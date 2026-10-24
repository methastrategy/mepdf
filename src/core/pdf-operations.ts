import { PDFDocument, StandardFonts, rgb, degrees, type PDFImage } from 'pdf-lib';
import { PDFDocument as PDFDocumentEncrypt } from 'pdf-lib-plus-encrypt';
import JSZip from 'jszip';
import type {
  PDFPageItem,
  DocumentMetadata,
  ImageToPdfOptions,
  ExtractedImageItem,
  ProgressCallback,
  WatermarkOptions,
  PageNumberOptions,
  PDFInfoMetadata,
} from './types';
import { loadPdfDocument, renderPageToCanvas, extractTextFromDoc, destroyPdfDocument } from './pdf-renderer';

/**
 * Merges a list of PDFPageItems (in their current display order and rotations)
 * into a single unified PDF document.
 */
export async function mergePages(
  pages: PDFPageItem[],
  documentMap: Map<string, DocumentMetadata>,
  onProgress?: ProgressCallback
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
      const meta = documentMap.get(item.docId);
      if (!meta) {
        throw new Error(`Source document metadata not found for ID: ${item.docId}`);
      }
      srcDoc = await PDFDocument.load(meta.fileBytes, { ignoreEncryption: true });
      parsedDocs.set(item.docId, srcDoc);
    }

    const [copiedPage] = await mergedDoc.copyPages(srcDoc, [item.pageIndex]);
    if (!copiedPage) continue;

    if (item.rotation !== 0) {
      const currentRot = copiedPage.getRotation().angle;
      copiedPage.setRotation(degrees((currentRot + item.rotation) % 360));
    }

    mergedDoc.addPage(copiedPage);

    if (onProgress) {
      onProgress({
        stage: 'Assembling pages',
        current: i + 1,
        total,
        percent: Math.round(((i + 1) / total) * 100),
      });
    }
  }

  return await mergedDoc.save();
}

/**
 * Splits pages by user-defined range expressions (e.g. "1-3, 4, 5-8") or selected pages.
 */
export async function splitPagesByRanges(
  pages: PDFPageItem[],
  documentMap: Map<string, DocumentMetadata>,
  rangeString: string,
  baseFilename = 'split',
  onProgress?: ProgressCallback
): Promise<{ filename: string; bytes: Uint8Array }[]> {
  const groups = parseRangeExpression(rangeString, pages.length);
  const results: { filename: string; bytes: Uint8Array }[] = [];
  const total = groups.length;

  for (let gIdx = 0; gIdx < total; gIdx++) {
    const pageIndices = groups[gIdx];
    if (!pageIndices || pageIndices.length === 0) continue;

    const groupPages: PDFPageItem[] = [];
    for (const pIdx of pageIndices) {
      const item = pages[pIdx - 1]; // 1-based index converted to 0-based
      if (item) groupPages.push(item);
    }

    if (groupPages.length === 0) continue;

    const bytes = await mergePages(groupPages, documentMap);
    const rangeLabel = pageIndices.length === 1 
      ? `page_${pageIndices[0]}` 
      : `pages_${pageIndices[0]}-${pageIndices[pageIndices.length - 1]}`;
    
    results.push({
      filename: `${baseFilename}_${rangeLabel}.pdf`,
      bytes,
    });

    if (onProgress) {
      onProgress({
        stage: `Splitting group ${gIdx + 1} of ${total}`,
        current: gIdx + 1,
        total,
        percent: Math.round(((gIdx + 1) / total) * 100),
      });
    }
  }

  return results;
}

/**
 * Parses page ranges such as "1-3, 5, 7-10" into arrays of 1-based page numbers.
 */
export function parseRangeExpression(expr: string, maxPages: number): number[][] {
  const trimmed = expr.trim();
  if (!trimmed) {
    // Default: each page individually
    return Array.from({ length: maxPages }, (_, i) => [i + 1]);
  }

  const parts = trimmed.split(',').map((p) => p.trim()).filter(Boolean);
  const groups: number[][] = [];

  for (const part of parts) {
    if (part.includes('-')) {
      const [startStr, endStr] = part.split('-').map((s) => s.trim());
      const start = Math.max(1, Math.min(parseInt(startStr ?? '1', 10) || 1, maxPages));
      const end = Math.max(start, Math.min(parseInt(endStr ?? `${maxPages}`, 10) || maxPages, maxPages));
      const group: number[] = [];
      for (let p = start; p <= end; p++) {
        group.push(p);
      }
      if (group.length > 0) groups.push(group);
    } else {
      const pageNum = parseInt(part, 10);
      if (!isNaN(pageNum) && pageNum >= 1 && pageNum <= maxPages) {
        groups.push([pageNum]);
      }
    }
  }

  return groups.length > 0 ? groups : Array.from({ length: maxPages }, (_, i) => [i + 1]);
}

/**
 * Helper to embed an image into a PDFDocument, with canvas fallback for unsupported image formats.
 */
async function embedImageSafely(doc: PDFDocument, file: File): Promise<PDFImage> {
  const arrayBuffer = await file.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  const name = (file.name || '').toLowerCase();
  const isJpg =
    file.type === 'image/jpeg' ||
    file.type === 'image/jpg' ||
    file.type === 'image/pjpeg' ||
    /\.(jpe?g)$/i.test(name);
  const isPng = file.type === 'image/png' || /\.png$/i.test(name);

  if (isJpg) {
    try {
      return await doc.embedJpg(bytes);
    } catch {
      // Fallback via canvas if non-standard JPEG
    }
  } else if (isPng) {
    try {
      return await doc.embedPng(bytes);
    } catch {
      // Fallback via canvas if non-standard PNG
    }
  }

  // Universal canvas fallback for WebP, GIF, SVG, BMP, AVIF, etc.
  return await embedViaCanvas(doc, file);
}

async function embedViaCanvas(doc: PDFDocument, file: File): Promise<PDFImage> {
  let imgBitmap: ImageBitmap | null = null;
  let canvas: HTMLCanvasElement | null = null;

  if (typeof createImageBitmap === 'function') {
    try {
      imgBitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      canvas = document.createElement('canvas');
      canvas.width = imgBitmap.width;
      canvas.height = imgBitmap.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Could not create offscreen canvas');
      ctx.drawImage(imgBitmap, 0, 0);
    } catch {
      try {
        imgBitmap = await createImageBitmap(file);
        canvas = document.createElement('canvas');
        canvas.width = imgBitmap.width;
        canvas.height = imgBitmap.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Could not create offscreen canvas');
        ctx.drawImage(imgBitmap, 0, 0);
      } catch {
        canvas = null;
      }
    } finally {
      imgBitmap?.close();
    }
  }

  if (!canvas) {
    canvas = await new Promise<HTMLCanvasElement>((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        const c = document.createElement('canvas');
        c.width = img.naturalWidth || img.width;
        c.height = img.naturalHeight || img.height;
        const ctx = c.getContext('2d');
        if (ctx) ctx.drawImage(img, 0, 0);
        URL.revokeObjectURL(url);
        resolve(c);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error(`Failed to load image: ${file.name}`));
      };
      img.src = url;
    });
  }

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas!.toBlob((b) => (b ? resolve(b) : reject(new Error('Canvas conversion failed'))), 'image/png');
  });

  canvas.width = 0;
  canvas.height = 0;

  const pngBytes = new Uint8Array(await blob.arrayBuffer());
  return await doc.embedPng(pngBytes);
}

/**
 * Converts multiple image files into a single PDF document.
 */
export async function imagesToPdf(
  files: File[],
  options: ImageToPdfOptions = { pageSize: 'A4' },
  onProgress?: ProgressCallback
): Promise<Uint8Array> {
  if (files.length === 0) {
    throw new Error('No images selected.');
  }

  const pdfDoc = await PDFDocument.create();
  const total = files.length;

  for (let i = 0; i < total; i++) {
    const file = files[i];
    if (!file) continue;

    const img = await embedImageSafely(pdfDoc, file);
    const { width: imgW, height: imgH } = img;

    if (options.pageSize === 'fit') {
      // Exactly fit page to image dimensions
      const page = pdfDoc.addPage([imgW, imgH]);
      page.drawImage(img, {
        x: 0,
        y: 0,
        width: imgW,
        height: imgH,
      });
    } else {
      // Standard A4: 595.28 x 841.89 points
      const isLandscape = imgW > imgH;
      const pageW = isLandscape ? 841.89 : 595.28;
      const pageH = isLandscape ? 595.28 : 841.89;

      const margin = options.margin ?? 24;
      const availW = pageW - margin * 2;
      const availH = pageH - margin * 2;

      // Scale proportionally to fit within printable area
      const scale = Math.min(availW / imgW, availH / imgH);
      const drawW = imgW * scale;
      const drawH = imgH * scale;

      const x = (pageW - drawW) / 2;
      const y = (pageH - drawH) / 2;

      const page = pdfDoc.addPage([pageW, pageH]);
      page.drawImage(img, {
        x,
        y,
        width: drawW,
        height: drawH,
      });
    }

    if (onProgress) {
      onProgress({
        stage: 'Converting images',
        current: i + 1,
        total,
        percent: Math.round(((i + 1) / total) * 100),
      });
    }
  }

  return await pdfDoc.save();
}

/**
 * Converts PDF pages into image items (Blobs and Data URLs) at a given DPI.
 */
export async function pdfToImages(
  pdfBytes: Uint8Array,
  dpi = 150,
  format: 'png' | 'jpeg' = 'png',
  onProgress?: ProgressCallback,
  password?: string
): Promise<ExtractedImageItem[]> {
  const pdfDoc = await loadPdfDocument(pdfBytes, password);
  try {
    const total = pdfDoc.numPages;
    const items: ExtractedImageItem[] = [];
    const scale = dpi / 72.0;

    for (let i = 1; i <= total; i++) {
      const canvas = await renderPageToCanvas(pdfDoc, i, scale);
      const mimeType = format === 'jpeg' ? 'image/jpeg' : 'image/png';
      const quality = format === 'jpeg' ? 0.9 : undefined;

      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error('Failed to create page blob'))),
          mimeType,
          quality
        );
      });

      const ext = format === 'jpeg' ? 'jpg' : 'png';
      const numStr = String(i).padStart(3, '0');
      items.push({
        name: `page_${numStr}.${ext}`,
        blob,
        dataUrl: '', // Memory optimization: skip unused multi-megabyte base64 allocation
        pageNumber: i,
        width: canvas.width,
        height: canvas.height,
      });

      // Release canvas memory buffer immediately
      canvas.width = 0;
      canvas.height = 0;

      if (onProgress) {
        onProgress({
          stage: 'Rendering pages to images',
          current: i,
          total,
          percent: Math.round((i / total) * 100),
        });
      }
    }

    return items;
  } finally {
    await destroyPdfDocument(pdfDoc);
  }
}

/**
 * Packages multiple extracted image items into a downloadable ZIP file.
 */
export async function createImagesZip(
  images: ExtractedImageItem[],
  onProgress?: ProgressCallback
): Promise<Blob> {
  const zip = new JSZip();
  const total = images.length;

  for (let i = 0; i < total; i++) {
    const img = images[i];
    if (img) {
      zip.file(img.name, img.blob);
    }
    if (onProgress) {
      onProgress({
        stage: 'Zipping images',
        current: i + 1,
        total,
        percent: Math.round(((i + 1) / total) * 100),
      });
    }
  }

  return await zip.generateAsync({ type: 'blob' });
}

/**
 * Extracts plain text from a raw PDF byte array.
 */
export async function extractText(
  pdfBytes: Uint8Array,
  onProgress?: ProgressCallback,
  password?: string
): Promise<string> {
  const pdfDoc = await loadPdfDocument(pdfBytes, password);
  try {
    return await extractTextFromDoc(pdfDoc, onProgress);
  } finally {
    await destroyPdfDocument(pdfDoc);
  }
}

/**
 * Encrypts and password-protects a PDF document with standard PDF security.
 */
export async function protectPdf(
  fileBytes: Uint8Array,
  userPassword: string,
  ownerPassword?: string
): Promise<Uint8Array> {
  const pwd = userPassword.trim();
  if (!pwd) {
    throw new Error('Password cannot be empty');
  }
  const doc = await PDFDocumentEncrypt.load(fileBytes, { ignoreEncryption: true });
  await doc.encrypt({
    userPassword: pwd,
    ownerPassword: ownerPassword && ownerPassword.trim() ? ownerPassword.trim() : pwd,
  });
  return await doc.save();
}

/**
 * Adds custom text or image watermark to PDF pages.
 */
export async function addWatermarkToPdf(
  fileBytes: Uint8Array,
  options: WatermarkOptions,
  onProgress?: ProgressCallback
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(fileBytes, { ignoreEncryption: true });
  const total = doc.getPageCount();
  if (total === 0) {
    throw new Error('PDF has no pages to watermark');
  }

  const {
    type = 'text',
    text = 'CONFIDENTIAL',
    imageBytes,
    imageType = 'png',
    fontSize = 48,
    color = { r: 0.5, g: 0.5, b: 0.5 },
    opacity = 0.3,
    rotation = 45,
    position = 'center',
    pageRange,
  } = options;

  let targetPageIndices: number[] = [];
  if (pageRange && pageRange.trim().length > 0) {
    const groups = parseRangeExpression(pageRange, total);
    targetPageIndices = groups.flat().map((p) => p - 1);
  } else {
    targetPageIndices = Array.from({ length: total }, (_, i) => i);
  }
  const pageSet = new Set(targetPageIndices);

  let font: import('pdf-lib').PDFFont | null = null;
  let embeddedImg: import('pdf-lib').PDFImage | null = null;

  if (type === 'text') {
    font = await doc.embedFont(StandardFonts.HelveticaBold);
  } else if (type === 'image' && imageBytes) {
    embeddedImg = imageType === 'jpeg' || (imageType as string) === 'jpg'
      ? await doc.embedJpg(imageBytes)
      : await doc.embedPng(imageBytes);
  }

  const rad = (rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  for (let i = 0; i < total; i++) {
    if (!pageSet.has(i)) continue;
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

    if (type === 'text' && font) {
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
    } else if (type === 'image' && embeddedImg) {
      const maxDim = Math.min(pWidth, pHeight) * 0.45;
      const imgScale = Math.min(maxDim / embeddedImg.width, maxDim / embeddedImg.height, 1);
      const w = embeddedImg.width * imgScale;
      const h = embeddedImg.height * imgScale;

      const cx = (w / 2) * cos - (h / 2) * sin;
      const cy = (w / 2) * sin + (h / 2) * cos;
      const x = anchorX - cx;
      const y = anchorY - cy;

      page.drawImage(embeddedImg, {
        x,
        y,
        width: w,
        height: h,
        opacity: Math.max(0.01, Math.min(1, opacity)),
        rotate: degrees(rotation),
      });
    }

    if (onProgress) {
      onProgress({
        stage: 'Applying watermark',
        current: i + 1,
        total,
        percent: Math.round(((i + 1) / total) * 100),
      });
    }
  }

  return await doc.save();
}

/**
 * Automatically stamps formatted page numbers onto PDF pages.
 */
export async function addPageNumbersToPdf(
  fileBytes: Uint8Array,
  options: PageNumberOptions,
  onProgress?: ProgressCallback
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(fileBytes, { ignoreEncryption: true });
  const total = doc.getPageCount();
  if (total === 0) {
    throw new Error('PDF has no pages to number');
  }

  const {
    format = 'page_n_of_total',
    customTemplate,
    position = 'bottom-center',
    startPageNumber = 1,
    startFromIndex = 0,
    fontSize = 10,
    color = { r: 0.25, g: 0.25, b: 0.25 },
    margin = 28,
  } = options;

  const font = await doc.embedFont(StandardFonts.Helvetica);
  const textColor = rgb(color.r, color.g, color.b);

  for (let i = 0; i < total; i++) {
    if (i < startFromIndex) continue;

    const page = doc.getPage(i);
    const { width: pWidth, height: pHeight } = page.getSize();
    const currentNumber = startPageNumber + (i - startFromIndex);

    let text = '';
    switch (format) {
      case 'page_n':
        text = `Page ${currentNumber}`;
        break;
      case 'page_n_of_total':
        text = `Page ${currentNumber} of ${total}`;
        break;
      case 'number_only':
        text = `${currentNumber}`;
        break;
      case 'n_slash_total':
        text = `${currentNumber}/${total}`;
        break;
      case 'custom':
        text = (customTemplate || 'Page {n} of {total}')
          .replace(/\{n\}/g, String(currentNumber))
          .replace(/\{total\}/g, String(total));
        break;
    }

    const textWidth = font.widthOfTextAtSize(text, fontSize);
    const textHeight = font.heightAtSize(fontSize);

    let x = (pWidth - textWidth) / 2;
    let y = margin;

    // Horizontal alignment
    if (position.includes('left')) {
      x = margin;
    } else if (position.includes('right')) {
      x = pWidth - margin - textWidth;
    } else {
      x = (pWidth - textWidth) / 2;
    }

    // Vertical alignment
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

    if (onProgress) {
      onProgress({
        stage: 'Numbering pages',
        current: i + 1,
        total,
        percent: Math.round(((i + 1) / total) * 100),
      });
    }
  }

  return await doc.save();
}

/**
 * Reads existing metadata information from a PDF document.
 */
export async function getPDFMetadata(fileBytes: Uint8Array): Promise<PDFInfoMetadata> {
  const doc = await PDFDocument.load(fileBytes, { ignoreEncryption: true, updateMetadata: false });
  return {
    title: doc.getTitle() || '',
    author: doc.getAuthor() || '',
    subject: doc.getSubject() || '',
    keywords: (doc.getKeywords() || '').trim(),
    creator: doc.getCreator() || '',
    producer: doc.getProducer() || '',
    creationDate: doc.getCreationDate(),
    modificationDate: doc.getModificationDate(),
  };
}

/**
 * Sanitizes or updates document metadata (Author, Title, Subject, Creator, Producer).
 */
export async function updatePdfMetadata(
  fileBytes: Uint8Array,
  metadata: PDFInfoMetadata,
  sanitizeAll = false
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
      const kw = metadata.keywords
        .split(',')
        .map((k) => k.trim())
        .filter(Boolean);
      doc.setKeywords(kw);
    }
    if (metadata.creator !== undefined) doc.setCreator(metadata.creator);
    if (metadata.producer !== undefined) doc.setProducer(metadata.producer);
  }

  return await doc.save();
}
