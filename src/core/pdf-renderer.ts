import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.mjs?url';
import type { ProgressCallback } from './types';

// Initialize PDF.js worker URL
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

/**
 * High-performance LRU Cache for rendered PDF thumbnails.
 * Enforces a strict memory ceiling (default 120 pages) to prevent tab OOM crashes on mobile/iOS.
 */
export class LruThumbnailCache {
  private cache = new Map<string, string>();
  private readonly maxEntries: number;

  constructor(maxEntries = 120) {
    this.maxEntries = Math.max(1, maxEntries);
  }

  get(key: string): string | undefined {
    const val = this.cache.get(key);
    if (val !== undefined) {
      // Re-insert to mark as recently used
      this.cache.delete(key);
      this.cache.set(key, val);
    }
    return val;
  }

  has(key: string): boolean {
    return this.cache.has(key);
  }

  set(key: string, value: string): void {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxEntries) {
      // Evict oldest entry (first item in Map)
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey !== undefined) {
        this.cache.delete(oldestKey);
      }
    }
    this.cache.set(key, value);
  }

  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  deletePrefix(prefix: string): void {
    for (const key of Array.from(this.cache.keys())) {
      if (key.startsWith(prefix) || key === prefix) {
        this.cache.delete(key);
      }
    }
  }

  clear(): void {
    this.cache.clear();
  }

  get size(): number {
    return this.cache.size;
  }

  get capacity(): number {
    return this.maxEntries;
  }

  keys(): IterableIterator<string> {
    return this.cache.keys();
  }
}

// Global LRU thumbnail cache instance with 120 entries ceiling
export const thumbnailCache = new LruThumbnailCache(120);

/**
 * Loads a PDF document from raw byte array, optionally with a password
 */
export async function loadPdfDocument(
  data: Uint8Array,
  password?: string
): Promise<pdfjsLib.PDFDocumentProxy> {
  const loadingTask = pdfjsLib.getDocument({
    data,
    useSystemFonts: true,
    password,
  });
  return await loadingTask.promise;
}

/**
 * Explicitly releases PDF.js document resources, font caches, and worker memory
 */
export async function destroyPdfDocument(pdfDoc: pdfjsLib.PDFDocumentProxy): Promise<void> {
  try {
    await pdfDoc.destroy();
  } catch (err) {
    console.warn('PDFDocument destroy error:', err);
  }
}

/**
 * Renders a single page to a canvas and returns high quality JPEG data URL thumbnail
 */
export async function renderPageThumbnail(
  pdfDoc: pdfjsLib.PDFDocumentProxy,
  pageNumber: number,
  rotation = 0,
  targetWidth = 320,
  cacheKeyPrefix?: string
): Promise<{ dataUrl: string; width: number; height: number }> {
  const page = await pdfDoc.getPage(pageNumber);
  try {
    const finalRotation = (page.rotate + rotation) % 360;

    const cacheKey = cacheKeyPrefix ? `${cacheKeyPrefix}-p${pageNumber}-r${finalRotation}-w${targetWidth}` : null;
    if (cacheKey && thumbnailCache.has(cacheKey)) {
      const cached = thumbnailCache.get(cacheKey)!;
      const vp = page.getViewport({ scale: 1, rotation: finalRotation });
      return { dataUrl: cached, width: vp.width, height: vp.height };
    }

    const originalViewport = page.getViewport({ scale: 1, rotation: finalRotation });
    const scale = targetWidth / originalViewport.width;
    const viewport = page.getViewport({ scale, rotation: finalRotation });

    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.floor(viewport.width));
    canvas.height = Math.max(1, Math.floor(viewport.height));

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('Unable to create 2D canvas context');

    // Fill crisp white background behind transparent PDF pages
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const renderContext = {
      canvasContext: ctx,
      viewport,
    };

    const renderTask = page.render(renderContext);
    await renderTask.promise;

    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);

    // Release canvas buffer memory
    canvas.width = 0;
    canvas.height = 0;

    if (cacheKey) {
      thumbnailCache.set(cacheKey, dataUrl);
    }

    return {
      dataUrl,
      width: originalViewport.width,
      height: originalViewport.height,
    };
  } finally {
    page.cleanup();
  }
}

/**
 * Renders a page to a canvas at a specific scale/DPI for export or compression
 */
export async function renderPageToCanvas(
  pdfDoc: pdfjsLib.PDFDocumentProxy,
  pageNumber: number,
  scale = 2.0,
  additionalRotation = 0
): Promise<HTMLCanvasElement> {
  const page = await pdfDoc.getPage(pageNumber);
  try {
    const finalRotation = (page.rotate + additionalRotation) % 360;
    const viewport = page.getViewport({ scale, rotation: finalRotation });

    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.floor(viewport.width));
    canvas.height = Math.max(1, Math.floor(viewport.height));

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('Unable to create 2D canvas context');

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const renderTask = page.render({
      canvasContext: ctx,
      viewport,
    });
    await renderTask.promise;

    return canvas;
  } finally {
    page.cleanup();
  }
}

/**
 * Extracts plain text from all pages of a PDF document
 */
export async function extractTextFromDoc(
  pdfDoc: pdfjsLib.PDFDocumentProxy,
  onProgress?: ProgressCallback
): Promise<string> {
  const total = pdfDoc.numPages;
  const pagesOutput: string[] = [];

  for (let i = 1; i <= total; i++) {
    let page: pdfjsLib.PDFPageProxy | null = null;
    try {
      page = await pdfDoc.getPage(i);
      const content = await page.getTextContent();
      const pageLines: string[] = [];
      let currentY: number | null = null;
      let lineBuffer = '';

      for (const item of content.items) {
        if ('str' in item) {
          const y = item.transform ? Math.round(item.transform[5] ?? 0) : null;
          const hasEOL = 'hasEOL' in item && Boolean(item.hasEOL);

          if (currentY !== null && y !== null && Math.abs(y - currentY) > 5) {
            if (lineBuffer.trim()) pageLines.push(lineBuffer.trim());
            lineBuffer = item.str;
            currentY = y;
          } else {
            lineBuffer += (lineBuffer ? ' ' : '') + item.str;
            if (currentY === null && y !== null) currentY = y;
          }

          if (hasEOL && lineBuffer.trim()) {
            pageLines.push(lineBuffer.trim());
            lineBuffer = '';
            currentY = null;
          }
        }
      }
      if (lineBuffer.trim()) pageLines.push(lineBuffer.trim());

      const pageText = pageLines.join('\n').trim();
      pagesOutput.push(`=== Page ${i} / ${total} ===\n` + (pageText || '[No selectable text on this page]'));
    } catch {
      pagesOutput.push(`=== Page ${i} / ${total} ===\n[Error reading text on page ${i}]`);
    } finally {
      page?.cleanup();
    }

    if (onProgress) {
      onProgress({
        stage: 'Extracting text',
        current: i,
        total,
        percent: Math.round((i / total) * 100),
      });
    }
  }

  return pagesOutput.join('\n\n');
}

/**
 * Clear thumbnail cache when needed
 */
export function clearThumbnailCache(): void {
  thumbnailCache.clear();
}

/**
 * Prunes thumbnail cache for a specific document ID
 */
export function removeDocThumbnails(docId: string): void {
  thumbnailCache.deletePrefix(`${docId}-`);
  thumbnailCache.delete(docId);
}

/**
 * Sets a thumbnail in cache (used by renderer and tests)
 */
export function setCachedThumbnail(key: string, dataUrl: string): void {
  thumbnailCache.set(key, dataUrl);
}

/**
 * Returns current thumbnail cache entry count
 */
export function getThumbnailCacheSize(): number {
  return thumbnailCache.size;
}
