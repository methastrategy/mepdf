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
 * In-browser Smart PDF Compressor.
 * Downsamples high-resolution scanned graphics and re-encodes pages using HTML5 Canvas & pdf-lib.
 */
export async function compressPdf(
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
    const scale = options.dpi / 72.0;

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
          options.quality
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
