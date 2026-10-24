import { PDFDocument, StandardFonts, rgb, degrees } from 'pdf-lib';
import { PDFDocument as PDFDocumentEncrypt } from 'pdf-lib-plus-encrypt';
import type {
  WatermarkOptions,
  PageNumberOptions,
  PDFInfoMetadata,
} from '../core/types';

export interface WorkerPageDescriptor {
  id: string;
  docId: string;
  pageIndex: number;
  rotation: number;
}

export type WorkerTaskType =
  | 'MERGE_PAGES'
  | 'SPLIT_PAGES'
  | 'COMPRESS_LOSSLESS'
  | 'WATERMARK_PDF'
  | 'PAGE_NUMBERS'
  | 'PROTECT_PDF'
  | 'UPDATE_METADATA';

export interface WorkerRequestPayloads {
  MERGE_PAGES: {
    pages: WorkerPageDescriptor[];
    documents: Record<string, Uint8Array>;
  };
  SPLIT_PAGES: {
    pages: WorkerPageDescriptor[];
    documents: Record<string, Uint8Array>;
    rangeString: string;
    baseFilename: string;
  };
  COMPRESS_LOSSLESS: {
    fileBytes: Uint8Array;
  };
  WATERMARK_PDF: {
    fileBytes: Uint8Array;
    options: WatermarkOptions;
  };
  PAGE_NUMBERS: {
    fileBytes: Uint8Array;
    options: PageNumberOptions;
  };
  PROTECT_PDF: {
    fileBytes: Uint8Array;
    userPassword: string;
    ownerPassword?: string;
  };
  UPDATE_METADATA: {
    fileBytes: Uint8Array;
    metadata: PDFInfoMetadata;
    sanitizeAll: boolean;
  };
}

export type WorkerTaskRequest =
  | { id: string; type: 'MERGE_PAGES'; payload: WorkerRequestPayloads['MERGE_PAGES'] }
  | { id: string; type: 'SPLIT_PAGES'; payload: WorkerRequestPayloads['SPLIT_PAGES'] }
  | { id: string; type: 'COMPRESS_LOSSLESS'; payload: WorkerRequestPayloads['COMPRESS_LOSSLESS'] }
  | { id: string; type: 'WATERMARK_PDF'; payload: WorkerRequestPayloads['WATERMARK_PDF'] }
  | { id: string; type: 'PAGE_NUMBERS'; payload: WorkerRequestPayloads['PAGE_NUMBERS'] }
  | { id: string; type: 'PROTECT_PDF'; payload: WorkerRequestPayloads['PROTECT_PDF'] }
  | { id: string; type: 'UPDATE_METADATA'; payload: WorkerRequestPayloads['UPDATE_METADATA'] };

export type WorkerTaskResponse =
  | { id: string; type: 'PROGRESS'; stage: string; current: number; total: number; percent: number }
  | { id: string; type: 'SUCCESS'; data: unknown }
  | { id: string; type: 'ERROR'; error: string };

// Helper range parser inside worker
function parseRangeExpression(rangeStr: string, maxPages: number): number[][] {
  const groups = rangeStr.split(/[,;\n]+/).map((s) => s.trim()).filter(Boolean);
  const result: number[][] = [];

  for (const group of groups) {
    const pageNumbers: number[] = [];
    if (group.includes('-')) {
      const parts = group.split('-');
      const start = parseInt(parts[0]?.trim() || '', 10);
      const end = parseInt(parts[1]?.trim() || '', 10);
      if (!isNaN(start) && !isNaN(end)) {
        const from = Math.max(1, Math.min(start, end));
        const to = Math.min(maxPages, Math.max(start, end));
        for (let p = from; p <= to; p++) {
          if (!pageNumbers.includes(p)) pageNumbers.push(p);
        }
      }
    } else {
      const single = parseInt(group, 10);
      if (!isNaN(single) && single >= 1 && single <= maxPages) {
        pageNumbers.push(single);
      }
    }
    if (pageNumbers.length > 0) {
      result.push(pageNumbers);
    }
  }

  return result;
}

// -------------------------------------------------------------
// WORKER EXECUTION IMPLEMENTATIONS
// -------------------------------------------------------------

async function executeMerge(
  pages: WorkerPageDescriptor[],
  documents: Record<string, Uint8Array>,
  postProgress: (stage: string, current: number, total: number, percent: number) => void
): Promise<Uint8Array> {
  if (pages.length === 0) {
    throw new Error('No pages selected to merge.');
  }

  const mergedDoc = await PDFDocument.create();
  const parsedDocs = new Map<string, PDFDocument>();
  const total = pages.length;

  for (let i = 0; i < total; i++) {
    const item = pages[i];
    if (!item) continue;

    let srcDoc = parsedDocs.get(item.docId);
    if (!srcDoc) {
      const fileBytes = documents[item.docId];
      if (!fileBytes) {
        throw new Error(`Source document bytes not found for ID: ${item.docId}`);
      }
      srcDoc = await PDFDocument.load(fileBytes, { ignoreEncryption: true });
      parsedDocs.set(item.docId, srcDoc);
    }

    const [copiedPage] = await mergedDoc.copyPages(srcDoc, [item.pageIndex]);
    if (!copiedPage) continue;

    if (item.rotation !== 0) {
      const currentRot = copiedPage.getRotation().angle;
      copiedPage.setRotation(degrees((currentRot + item.rotation) % 360));
    }

    mergedDoc.addPage(copiedPage);

    postProgress('Assembling pages in worker', i + 1, total, Math.round(((i + 1) / total) * 100));
  }

  return await mergedDoc.save({ useObjectStreams: true });
}

async function executeSplit(
  pages: WorkerPageDescriptor[],
  documents: Record<string, Uint8Array>,
  rangeString: string,
  baseFilename: string,
  postProgress: (stage: string, current: number, total: number, percent: number) => void
): Promise<{ filename: string; bytes: Uint8Array }[]> {
  const groups = parseRangeExpression(rangeString, pages.length);
  const results: { filename: string; bytes: Uint8Array }[] = [];
  const total = groups.length;

  for (let gIdx = 0; gIdx < total; gIdx++) {
    const pageIndices = groups[gIdx];
    if (!pageIndices || pageIndices.length === 0) continue;

    const groupPages: WorkerPageDescriptor[] = [];
    for (const pIdx of pageIndices) {
      const item = pages[pIdx - 1];
      if (item) groupPages.push(item);
    }

    if (groupPages.length === 0) continue;

    const bytes = await executeMerge(groupPages, documents, () => {});
    const rangeLabel =
      pageIndices.length === 1
        ? `page_${pageIndices[0]}`
        : `pages_${pageIndices[0]}-${pageIndices[pageIndices.length - 1]}`;

    results.push({
      filename: `${baseFilename}_${rangeLabel}.pdf`,
      bytes,
    });

    postProgress('Splitting documents in worker', gIdx + 1, total, Math.round(((gIdx + 1) / total) * 100));
  }

  return results;
}

async function executeCompressLossless(
  fileBytes: Uint8Array,
  postProgress: (stage: string, current: number, total: number, percent: number) => void
): Promise<{ pdfBytes: Uint8Array; originalSize: number; compressedSize: number; ratio: number; ineffective: boolean }> {
  const originalSize = fileBytes.byteLength;
  postProgress('Analyzing vector streams in worker', 1, 3, 30);

  const srcDoc = await PDFDocument.load(fileBytes, { ignoreEncryption: true, updateMetadata: false });
  const targetDoc = await PDFDocument.create();

  postProgress('Extracting clean page trees in worker', 2, 3, 60);

  const pageIndices = srcDoc.getPageIndices();
  const copiedPages = await targetDoc.copyPages(srcDoc, pageIndices);
  for (const page of copiedPages) {
    targetDoc.addPage(page);
  }

  const title = srcDoc.getTitle();
  const author = srcDoc.getAuthor();
  const subject = srcDoc.getSubject();
  const keywords = srcDoc.getKeywords();
  if (title) targetDoc.setTitle(title);
  if (author) targetDoc.setAuthor(author);
  if (subject) targetDoc.setSubject(subject);
  if (keywords) {
    const kwList = keywords.split(',').map((s) => s.trim()).filter(Boolean);
    if (kwList.length > 0) targetDoc.setKeywords(kwList);
  }

  postProgress('Deflating object streams in worker', 3, 3, 90);

  const compressedBytes = await targetDoc.save({ useObjectStreams: true, objectsPerTick: 50 });
  const compressedSize = compressedBytes.byteLength;
  const ratio = originalSize > 0 ? compressedSize / originalSize : 1.0;
  const ineffective = compressedSize >= originalSize;

  postProgress('Complete', 3, 3, 100);

  return {
    pdfBytes: compressedBytes,
    originalSize,
    compressedSize,
    ratio,
    ineffective,
  };
}

async function executeWatermark(
  fileBytes: Uint8Array,
  options: WatermarkOptions,
  postProgress: (stage: string, current: number, total: number, percent: number) => void
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(fileBytes, { ignoreEncryption: true });
  const total = doc.getPageCount();
  const font = await doc.embedFont(StandardFonts.HelveticaBold);

  const {
    type = 'text',
    text = 'CONFIDENTIAL',
    fontSize = 48,
    color = { r: 0.8, g: 0.1, b: 0.1 },
    opacity = 0.3,
    rotation = 45,
    position = 'center',
    pageRange = 'all',
  } = options;

  let targetIndices: number[] = [];
  if (pageRange === 'all' || !pageRange.trim()) {
    targetIndices = doc.getPageIndices();
  } else {
    const groups = parseRangeExpression(pageRange, total);
    targetIndices = [...new Set(groups.flat().map((p) => p - 1))].filter(
      (idx) => idx >= 0 && idx < total
    );
  }

  const rad = (rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  for (let i = 0; i < total; i++) {
    if (!targetIndices.includes(i)) continue;
    const page = doc.getPage(i);
    const { width: pWidth, height: pHeight } = page.getSize();

    let anchorX = pWidth / 2;
    let anchorY = pHeight / 2;

    switch (position) {
      case 'top-left':
        anchorX = pWidth * 0.25;
        anchorY = pHeight * 0.82;
        break;
      case 'top-center':
        anchorX = pWidth / 2;
        anchorY = pHeight * 0.85;
        break;
      case 'top-right':
        anchorX = pWidth * 0.75;
        anchorY = pHeight * 0.82;
        break;
      case 'bottom-left':
        anchorX = pWidth * 0.25;
        anchorY = pHeight * 0.18;
        break;
      case 'bottom-center':
        anchorX = pWidth / 2;
        anchorY = pHeight * 0.15;
        break;
      case 'bottom-right':
        anchorX = pWidth * 0.75;
        anchorY = pHeight * 0.18;
        break;
      case 'center':
      default:
        anchorX = pWidth / 2;
        anchorY = pHeight / 2;
        break;
    }

    if (type === 'text') {
      const watermarkText = text.trim() || 'CONFIDENTIAL';
      const textWidth = font.widthOfTextAtSize(watermarkText, fontSize);
      const textHeight = font.heightAtSize(fontSize);

      const cx = (textWidth / 2) * cos - (textHeight / 2) * sin;
      const cy = (textWidth / 2) * sin + (textHeight / 2) * cos;
      const x = anchorX - cx;
      const y = anchorY - cy;

      page.drawText(watermarkText, {
        x,
        y,
        size: fontSize,
        font,
        color: rgb(color.r, color.g, color.b),
        opacity: Math.max(0.01, Math.min(1, opacity)),
        rotate: degrees(rotation),
      });
    }

    postProgress('Applying watermark in worker', i + 1, total, Math.round(((i + 1) / total) * 100));
  }

  return await doc.save();
}

async function executePageNumbers(
  fileBytes: Uint8Array,
  options: PageNumberOptions,
  postProgress: (stage: string, current: number, total: number, percent: number) => void
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(fileBytes, { ignoreEncryption: true });
  const total = doc.getPageCount();
  const font = await doc.embedFont(StandardFonts.Helvetica);

  const {
    format = 'page_n_of_total',
    customTemplate,
    position = 'bottom-center',
    startPageNumber = 1,
    startFromIndex = 0,
    fontSize = 10,
    color = { r: 0.2, g: 0.2, b: 0.2 },
    margin = 36,
  } = options;

  const textColor = rgb(color.r, color.g, color.b);

  for (let i = 0; i < total; i++) {
    if (i < startFromIndex) continue;
    const page = doc.getPage(i);
    const { width: pWidth, height: pHeight } = page.getSize();
    const currentNum = startPageNumber + (i - startFromIndex);

    let text = '';
    switch (format) {
      case 'page_n':
        text = `Page ${currentNum}`;
        break;
      case 'number_only':
        text = `${currentNum}`;
        break;
      case 'n_slash_total':
        text = `${currentNum} / ${total}`;
        break;
      case 'custom':
        if (customTemplate) {
          text = customTemplate
            .replace(/\{n\}/g, String(currentNum))
            .replace(/\{total\}/g, String(total));
        } else {
          text = `Page ${currentNum} of ${total}`;
        }
        break;
      case 'page_n_of_total':
      default:
        text = `Page ${currentNum} of ${total}`;
        break;
    }

    const textWidth = font.widthOfTextAtSize(text, fontSize);
    const textHeight = font.heightAtSize(fontSize);

    let x = margin;
    let y = margin;

    if (position.includes('center')) {
      x = (pWidth - textWidth) / 2;
    } else if (position.includes('right')) {
      x = pWidth - margin - textWidth;
    } else {
      x = margin;
    }

    if (position.startsWith('top')) {
      y = pHeight - margin - textHeight;
    } else {
      y = margin;
    }

    page.drawText(text, {
      x,
      y,
      size: fontSize,
      font,
      color: textColor,
    });

    postProgress('Numbering pages in worker', i + 1, total, Math.round(((i + 1) / total) * 100));
  }

  return await doc.save();
}

async function executeProtect(
  fileBytes: Uint8Array,
  userPassword: string,
  ownerPassword?: string
): Promise<Uint8Array> {
  const doc = await PDFDocumentEncrypt.load(fileBytes, { ignoreEncryption: true });
  await doc.encrypt({
    userPassword,
    ownerPassword: ownerPassword || userPassword,
    permissions: {
      printing: 'highResolution',
      modifying: false,
      copying: false,
      annotating: false,
      fillingForms: false,
      contentAccessibility: false,
      documentAssembly: false,
    },
  });
  return await doc.save();
}

async function executeMetadata(
  fileBytes: Uint8Array,
  metadata: PDFInfoMetadata,
  sanitizeAll: boolean
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(fileBytes, { ignoreEncryption: true, updateMetadata: false });
  if (sanitizeAll) {
    doc.setTitle('');
    doc.setAuthor('');
    doc.setSubject('');
    doc.setKeywords([]);
    doc.setCreator('');
    doc.setProducer('');
  } else {
    if (metadata.title !== undefined) doc.setTitle(metadata.title);
    if (metadata.author !== undefined) doc.setAuthor(metadata.author);
    if (metadata.subject !== undefined) doc.setSubject(metadata.subject);
    if (metadata.keywords !== undefined) {
      const kw = metadata.keywords.split(',').map((k) => k.trim()).filter(Boolean);
      doc.setKeywords(kw);
    }
    if (metadata.creator !== undefined) doc.setCreator(metadata.creator);
    if (metadata.producer !== undefined) doc.setProducer(metadata.producer);
  }
  return await doc.save();
}

// -------------------------------------------------------------
// WORKER MESSAGE LISTENER
// -------------------------------------------------------------

if (typeof self !== 'undefined' && typeof (self as unknown as Worker).postMessage === 'function') {
  self.addEventListener('message', async (event: MessageEvent<WorkerTaskRequest>) => {
    const msg = event.data;
    const { id } = msg;

    const postProgress = (stage: string, current: number, total: number, percent: number) => {
      self.postMessage({ id, type: 'PROGRESS', stage, current, total, percent });
    };

    try {
      let result: unknown;
      let transferList: Transferable[] = [];

      switch (msg.type) {
        case 'MERGE_PAGES': {
          const resBytes = await executeMerge(msg.payload.pages, msg.payload.documents, postProgress);
          result = resBytes;
          transferList = [resBytes.buffer];
          break;
        }
        case 'SPLIT_PAGES': {
          const splitResults = await executeSplit(
            msg.payload.pages,
            msg.payload.documents,
            msg.payload.rangeString,
            msg.payload.baseFilename,
            postProgress
          );
          result = splitResults;
          transferList = splitResults.map((r) => r.bytes.buffer);
          break;
        }
        case 'COMPRESS_LOSSLESS': {
          const compResult = await executeCompressLossless(msg.payload.fileBytes, postProgress);
          result = compResult;
          transferList = [compResult.pdfBytes.buffer];
          break;
        }
        case 'WATERMARK_PDF': {
          const wmBytes = await executeWatermark(msg.payload.fileBytes, msg.payload.options, postProgress);
          result = wmBytes;
          transferList = [wmBytes.buffer];
          break;
        }
        case 'PAGE_NUMBERS': {
          const pnBytes = await executePageNumbers(msg.payload.fileBytes, msg.payload.options, postProgress);
          result = pnBytes;
          transferList = [pnBytes.buffer];
          break;
        }
        case 'PROTECT_PDF': {
          const prBytes = await executeProtect(msg.payload.fileBytes, msg.payload.userPassword, msg.payload.ownerPassword);
          result = prBytes;
          transferList = [prBytes.buffer];
          break;
        }
        case 'UPDATE_METADATA': {
          const metaBytes = await executeMetadata(msg.payload.fileBytes, msg.payload.metadata, msg.payload.sanitizeAll);
          result = metaBytes;
          transferList = [metaBytes.buffer];
          break;
        }
        default: {
          const exhaustiveCheck: never = msg;
          throw new Error(`Unsupported worker task type: ${(exhaustiveCheck as { type: string }).type}`);
        }
      }

      self.postMessage({ id, type: 'SUCCESS', data: result }, { transfer: transferList });
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      self.postMessage({ id, type: 'ERROR', error: errMsg });
    }
  });
}
