import { PDFDocument } from 'pdf-lib';
import type { CompressionOptions, CompressionResult, ProgressCallback } from './types';
import { loadPdfDocument, renderPageToCanvas, destroyPdfDocument } from './pdf-renderer';

export const COMPRESSION_PRESETS: Record<string, CompressionOptions> = {
  screen: {
    preset: 'screen',
    dpi: 96,
    quality: 0.65,
  },
  ebook: {
    preset: 'ebook',
    dpi: 150,
    quality: 0.78,
  },
  printer: {
    preset: 'printer',
    dpi: 300,
    quality: 0.90,
  },
};

/**
 * Lossless stream compression engine.
 * Repacks PDF structures into compressed cross-reference Object Streams (/ObjStm)
 * and purges orphaned incremental edit history while preserving 100% vector fidelity,
 * embedded fonts, and Ctrl+F text searchability.
 */
export async function compressPdfLossless(
  originalBytes: Uint8Array,
  onProgress?: ProgressCallback,
  _password?: string
): Promise<CompressionResult> {
  const originalSize = originalBytes.byteLength;
  if (onProgress) {
    onProgress({ stage: 'Analyzing vector streams', current: 1, total: 3, percent: 30 });
  }

  const srcDoc = await PDFDocument.load(originalBytes, { ignoreEncryption: true, updateMetadata: false });
  const targetDoc = await PDFDocument.create();

  if (onProgress) {
    onProgress({ stage: 'Extracting clean page trees', current: 2, total: 3, percent: 60 });
  }

  const pageIndices = srcDoc.getPageIndices();
  const copiedPages = await targetDoc.copyPages(srcDoc, pageIndices);
  for (const page of copiedPages) {
    targetDoc.addPage(page);
  }

  // Preserve document metadata if present
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

  if (onProgress) {
    onProgress({ stage: 'Deflating object streams', current: 3, total: 3, percent: 90 });
  }

  const compressedBytes = await targetDoc.save({
    useObjectStreams: true,
    objectsPerTick: 50,
  });

  const compressedSize = compressedBytes.byteLength;
  const ratio = originalSize > 0 ? compressedSize / originalSize : 1.0;
  const ineffective = compressedSize >= originalSize;

  if (onProgress) {
    onProgress({ stage: 'Complete', current: 3, total: 3, percent: 100 });
  }

  return {
    pdfBytes: compressedBytes,
    originalSize,
    compressedSize,
    ratio,
    ineffective,
  };
}

/**
 * Scanned PDF Downsampler.
 * Downsamples high-resolution scanned graphics and re-encodes pages using HTML5 Canvas & pdf-lib.
 */
export async function compressPdfScanned(
  originalBytes: Uint8Array,
  options: CompressionOptions,
  onProgress?: ProgressCallback,
  password?: string
): Promise<CompressionResult> {
  const originalSize = originalBytes.byteLength;
  const pdfDoc = await loadPdfDocument(originalBytes, password);
  try {
    const total = pdfDoc.numPages;
    const targetDoc = await PDFDocument.create();
    const dpi = options.dpi ?? 150;
    const quality = options.quality ?? 0.78;
    const scale = dpi / 72.0;

    for (let i = 1; i <= total; i++) {
      // Check unscaled viewport to prevent browser canvas allocation crashes on huge pages
      const page = await pdfDoc.getPage(i);
      const unscaledVp = page.getViewport({ scale: 1 });
      page.cleanup();

      const maxDim = Math.max(unscaledVp.width, unscaledVp.height);
      let effectiveScale = scale;
      const MAX_CANVAS_DIM = 4096;
      if (maxDim * scale > MAX_CANVAS_DIM) {
        effectiveScale = MAX_CANVAS_DIM / maxDim;
      }

      // renderPageToCanvas computes intrinsic rotation automatically
      const canvas = await renderPageToCanvas(pdfDoc, i, effectiveScale);

      const jpegBlob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error('Failed to compress canvas to JPEG'))),
          'image/jpeg',
          quality
        );
      });

      const jpegBytes = new Uint8Array(await jpegBlob.arrayBuffer());
      const embeddedImg = await targetDoc.embedJpg(jpegBytes);

      // Physical dimensions in points
      const ptWidth = canvas.width / effectiveScale;
      const ptHeight = canvas.height / effectiveScale;

      const newPage = targetDoc.addPage([ptWidth, ptHeight]);
      newPage.drawImage(embeddedImg, {
        x: 0,
        y: 0,
        width: ptWidth,
        height: ptHeight,
      });

      // Release canvas memory buffer immediately to prevent tab VRAM exhaustion
      canvas.width = 0;
      canvas.height = 0;

      if (onProgress) {
        onProgress({
          stage: 'Compressing pages',
          current: i,
          total,
          percent: Math.round((i / total) * 100),
        });
      }
    }

    const compressedBytes = await targetDoc.save({ useObjectStreams: true });
    const compressedSize = compressedBytes.byteLength;
    const ratio = originalSize > 0 ? compressedSize / originalSize : 1.0;
    const ineffective = compressedSize >= originalSize;

    return {
      pdfBytes: compressedBytes,
      originalSize,
      compressedSize,
      ratio,
      ineffective,
    };
  } finally {
    await destroyPdfDocument(pdfDoc);
  }
}

/**
 * In-browser Dual-Engine PDF Compressor.
 * Dispatches between Lossless Stream Deflation (vector text preserving) and Scanned Canvas Downsampling.
 */
export async function compressPdf(
  originalBytes: Uint8Array,
  options: CompressionOptions,
  onProgress?: ProgressCallback,
  password?: string
): Promise<CompressionResult> {
  if (options.mode === 'lossless') {
    return compressPdfLossless(originalBytes, onProgress, password);
  }
  return compressPdfScanned(originalBytes, options, onProgress, password);
}
