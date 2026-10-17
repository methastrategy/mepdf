import { PDFDocument, degrees, type PDFImage } from 'pdf-lib';
import JSZip from 'jszip';
import type {
  PDFPageItem,
  DocumentMetadata,
  ImageToPdfOptions,
  ExtractedImageItem,
  ProgressCallback,
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
