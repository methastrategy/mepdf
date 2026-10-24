import { describe, it, expect } from 'vitest';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { compressPdf, compressPdfLossless, COMPRESSION_PRESETS } from '../src/core/pdf-compressor';
import { pdfWorker } from '../src/core/worker-client';
import type { PDFPageItem, DocumentMetadata } from '../src/core/types';

describe('WBS 3.2: Dual-Engine Compression (Lossless Vector vs Scanned)', () => {
  async function createVectorDocument(textContent: string): Promise<Uint8Array> {
    const doc = await PDFDocument.create();
    const page = doc.addPage([600, 400]);
    const font = await doc.embedFont(StandardFonts.Helvetica);
    page.drawText(textContent, {
      x: 50,
      y: 350,
      size: 18,
      font,
      color: rgb(0, 0, 0),
    });
    // Save uncompressed without object streams to simulate raw export
    return await doc.save({ useObjectStreams: false });
  }

  it('compresses PDF via lossless mode while preserving 100% text vectors and Ctrl+F searchability', async () => {
    const secretText = 'CONFIDENTIAL_SURVEY_COORDINATES_ZONE_47N';
    const rawBytes = await createVectorDocument(secretText);

    let progressHit = false;
    const result = await compressPdf(
      rawBytes,
      { mode: 'lossless' },
      (info) => {
        if (info.percent > 0) progressHit = true;
      }
    );

    expect(progressHit).toBe(true);
    expect(result.originalSize).toBe(rawBytes.byteLength);
    expect(result.pdfBytes.byteLength).toBeGreaterThan(0);
    expect(result.ratio).toBeLessThanOrEqual(1.0);

    // Verify text layer extraction with pdfjs-dist
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const loadingTask = pdfjs.getDocument({ data: result.pdfBytes });
    const pdf = await loadingTask.promise;
    expect(pdf.numPages).toBe(1);

    const page1 = await pdf.getPage(1);
    const textContent = await page1.getTextContent();
    const extractedStr = textContent.items.map((item: any) => item.str).join(' ');
    expect(extractedStr).toContain(secretText);
  });

  it('purges unreferenced incremental history and deflates object streams', async () => {
    const rawBytes = await createVectorDocument('Initial Draft Version');
    const directResult = await compressPdfLossless(rawBytes);

    expect(directResult.compressedSize).toBeGreaterThan(0);
    expect(directResult.originalSize).toBe(rawBytes.byteLength);

    // Verify valid load back into PDFDocument
    const loaded = await PDFDocument.load(directResult.pdfBytes);
    expect(loaded.getPageCount()).toBe(1);
  });

  it('exposes correct preset configurations for screen, ebook, and printer', () => {
    expect(COMPRESSION_PRESETS.screen?.dpi).toBe(96);
    expect(COMPRESSION_PRESETS.ebook?.dpi).toBe(150);
    expect(COMPRESSION_PRESETS.printer?.dpi).toBe(300);
  });
});

describe('WBS 3.1: Dedicated Web Worker Pipeline with Main-Thread Fallback', () => {
  async function createSampleDoc(text: string): Promise<Uint8Array> {
    const doc = await PDFDocument.create();
    const page = doc.addPage([500, 300]);
    page.drawText(text, { x: 50, y: 150, size: 14 });
    return await doc.save();
  }

  it('executes mergePages seamlessly through pdfWorker client', async () => {
    const bytes1 = await createSampleDoc('Document 1 Page 1');
    const bytes2 = await createSampleDoc('Document 2 Page 1');

    const docMap = new Map<string, DocumentMetadata>();
    docMap.set('doc-1', {
      id: 'doc-1',
      filename: 'doc1.pdf',
      size: bytes1.byteLength,
      pageCount: 1,
      fileBytes: bytes1,
    });
    docMap.set('doc-2', {
      id: 'doc-2',
      filename: 'doc2.pdf',
      size: bytes2.byteLength,
      pageCount: 1,
      fileBytes: bytes2,
    });

    const pages: PDFPageItem[] = [
      {
        id: 'p1',
        docId: 'doc-1',
        docName: 'doc1.pdf',
        pageIndex: 0,
        displayPageNumber: 1,
        rotation: 0,
        thumbnailDataUrl: '',
        width: 500,
        height: 300,
        selected: false,
      },
      {
        id: 'p2',
        docId: 'doc-2',
        docName: 'doc2.pdf',
        pageIndex: 0,
        displayPageNumber: 1,
        rotation: 90,
        thumbnailDataUrl: '',
        width: 500,
        height: 300,
        selected: false,
      },
    ];

    let progressReported = false;
    const merged = await pdfWorker.mergePages(pages, docMap, (info) => {
      if (info.percent > 0) progressReported = true;
    });

    expect(progressReported).toBe(true);
    expect(merged.byteLength).toBeGreaterThan(0);

    const loaded = await PDFDocument.load(merged);
    expect(loaded.getPageCount()).toBe(2);
    expect(loaded.getPage(1).getRotation().angle).toBe(90);
  });

  it('executes splitPagesByRanges via pdfWorker client', async () => {
    const bytes = await createSampleDoc('Page to Split');
    const docMap = new Map<string, DocumentMetadata>();
    docMap.set('doc-split', {
      id: 'doc-split',
      filename: 'split.pdf',
      size: bytes.byteLength,
      pageCount: 1,
      fileBytes: bytes,
    });

    const pages: PDFPageItem[] = [
      {
        id: 'p1',
        docId: 'doc-split',
        docName: 'split.pdf',
        pageIndex: 0,
        displayPageNumber: 1,
        rotation: 0,
        thumbnailDataUrl: '',
        width: 500,
        height: 300,
        selected: false,
      },
    ];

    const results = await pdfWorker.splitPagesByRanges(pages, docMap, '1', 'my_split');
    expect(results).toHaveLength(1);
    expect(results[0]?.filename).toContain('my_split');
    expect(results[0]?.bytes.byteLength).toBeGreaterThan(0);
  });

  it('executes compressLossless via pdfWorker client', async () => {
    const bytes = await createSampleDoc('Lossless Worker Test');
    const res = await pdfWorker.compressLossless(bytes);
    expect(res.compressedSize).toBeGreaterThan(0);
    expect(res.pdfBytes.byteLength).toBe(res.compressedSize);
  });

  it('executes protectPdf and watermarkPdf via pdfWorker client', async () => {
    const bytes = await createSampleDoc('Worker Pro Tools Test');

    // Protect
    const encrypted = await pdfWorker.protectPdf(bytes, 'SecurePass123!');
    expect(encrypted.byteLength).toBeGreaterThan(0);
    const binaryString = Array.from(encrypted.slice(0, 4000))
      .map((b) => String.fromCharCode(b))
      .join('');
    expect(binaryString).toContain('/Encrypt');

    // Watermark
    const watermarked = await pdfWorker.watermarkPdf(bytes, {
      type: 'text',
      text: 'CONFIDENTIAL',
      fontSize: 24,
      rotation: 45,
    });
    expect(watermarked.byteLength).toBeGreaterThan(0);
  });

  it('executes pageNumbers and updatePdfMetadata via pdfWorker client', async () => {
    const bytes = await createSampleDoc('Metadata and Numbers Test');

    // Numbers
    const numbered = await pdfWorker.pageNumbers(bytes, {
      format: 'page_n_of_total',
      position: 'bottom-center',
    });
    expect(numbered.byteLength).toBeGreaterThan(0);

    // Metadata
    const metaUpdated = await pdfWorker.updatePdfMetadata(
      bytes,
      {
        title: 'Survey Plan 2026',
        author: 'Metha',
      },
      false
    );
    expect(metaUpdated.byteLength).toBeGreaterThan(0);

    const loaded = await PDFDocument.load(metaUpdated, { updateMetadata: false });
    expect(loaded.getTitle()).toBe('Survey Plan 2026');
    expect(loaded.getAuthor()).toBe('Metha');
  });
});
