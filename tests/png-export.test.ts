import { describe, it, expect, vi } from 'vitest';

import { PDFDocument, rgb } from 'pdf-lib';
import fs from 'node:fs';
import path from 'node:path';
import { loadPdfDocument, destroyPdfDocument } from '../src/core/pdf-renderer';
import {
  imagesToPdf,
  mergePages,
  watermarkPdf,
  embedImageBytesSafely,
} from '../src/core/pdf-operations';
import { canvasToBlob } from '../src/utils/file-utils';
import type { PDFPageItem, DocumentMetadata } from '../src/core/types';

describe('PNG Ingestion, Buffer Integrity & Export Pipeline', () => {
  // 1x1 valid PNG
  const pngBase64 =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  const pngBytes = Uint8Array.from(atob(pngBase64), (c) => c.charCodeAt(0));

  it('preserves Uint8Array byteLength and prevents detachment when loadPdfDocument is called', async () => {
    const doc = await PDFDocument.create();
    doc.addPage([400, 400]);
    const pdfBytes = await doc.save();

    const originalLength = pdfBytes.byteLength;
    expect(originalLength).toBeGreaterThan(0);
    expect(pdfBytes.buffer.byteLength).toBeGreaterThan(0);

    const pdfDocProxy = await loadPdfDocument(pdfBytes);
    expect(pdfDocProxy.numPages).toBe(1);

    // CRITICAL INVARIANT: The original buffer must NOT be detached (must keep full byteLength)
    expect(pdfBytes.byteLength).toBe(originalLength);
    expect(pdfBytes.buffer.byteLength).toBeGreaterThan(0);

    await destroyPdfDocument(pdfDocProxy);
  });

  it('successfully converts PNG to PDF, loads it, and merges/exports it without error', async () => {
    const file = new File([pngBytes], 'avatar.png', { type: 'image/png' });

    // Step 1: Ingest PNG into PDF bytes
    const convertedPdfBytes = await imagesToPdf([file], { pageSize: 'A4' });
    expect(convertedPdfBytes).toBeInstanceOf(Uint8Array);
    expect(convertedPdfBytes.byteLength).toBeGreaterThan(0);

    // Step 2: Render/load thumbnails through PDF.js
    const pdfDoc = await loadPdfDocument(convertedPdfBytes);
    expect(pdfDoc.numPages).toBe(1);
    await destroyPdfDocument(pdfDoc);

    // Step 3: Verify the converted bytes were not detached by loadPdfDocument
    expect(convertedPdfBytes.byteLength).toBeGreaterThan(0);

    // Step 4: Populate documents map and pages list as main.ts does
    const docId = 'doc_png_test_1';
    const documentMap = new Map<string, DocumentMetadata>();
    documentMap.set(docId, {
      id: docId,
      filename: 'avatar.pdf',
      size: convertedPdfBytes.byteLength,
      pageCount: 1,
      fileBytes: convertedPdfBytes,
    });

    const pages: PDFPageItem[] = [
      {
        id: 'page_png_1',
        docId,
        docName: 'avatar.pdf',
        pageIndex: 0,
        displayPageNumber: 1,
        rotation: 0,
        thumbnailDataUrl: '',
        width: 595.28,
        height: 841.89,
        selected: false,
      },
    ];

    // Step 5: Export / merge pages
    const exportedBytes = await mergePages(pages, documentMap);
    expect(exportedBytes).toBeInstanceOf(Uint8Array);
    expect(exportedBytes.byteLength).toBeGreaterThan(0);

    // Step 6: Verify exported document is completely valid
    const verifiedDoc = await PDFDocument.load(exportedBytes);
    expect(verifiedDoc.getPageCount()).toBe(1);
  });

  it('successfully merges a real PNG image page with an existing multi-page PDF', async () => {
    // 1. Create a base PDF with 2 pages
    const baseDoc = await PDFDocument.create();
    baseDoc.addPage([500, 500]);
    baseDoc.addPage([500, 500]);
    const baseBytes = await baseDoc.save();

    // 2. Convert PNG into a page
    const file = new File([pngBytes], 'diagram.png', { type: 'image/png' });
    const imgPdfBytes = await imagesToPdf([file], { pageSize: 'fit' });

    // 3. Load both through PDF.js
    const p1 = await loadPdfDocument(baseBytes);
    const p2 = await loadPdfDocument(imgPdfBytes);
    await destroyPdfDocument(p1);
    await destroyPdfDocument(p2);

    // 4. Setup workspace document map
    const documentMap = new Map<string, DocumentMetadata>();
    documentMap.set('doc_base', {
      id: 'doc_base',
      filename: 'document.pdf',
      size: baseBytes.byteLength,
      pageCount: 2,
      fileBytes: baseBytes,
    });
    documentMap.set('doc_img', {
      id: 'doc_img',
      filename: 'diagram.pdf',
      size: imgPdfBytes.byteLength,
      pageCount: 1,
      fileBytes: imgPdfBytes,
    });

    // 5. Arrange pages: Base Page 1 -> Diagram PNG -> Base Page 2
    const pages: PDFPageItem[] = [
      {
        id: 'p_base_1',
        docId: 'doc_base',
        docName: 'document.pdf',
        pageIndex: 0,
        displayPageNumber: 1,
        rotation: 0,
        thumbnailDataUrl: '',
        width: 500,
        height: 500,
        selected: false,
      },
      {
        id: 'p_diagram',
        docId: 'doc_img',
        docName: 'diagram.pdf',
        pageIndex: 0,
        displayPageNumber: 2,
        rotation: 90, // Rotated page
        thumbnailDataUrl: '',
        width: 1,
        height: 1,
        selected: false,
      },
      {
        id: 'p_base_2',
        docId: 'doc_base',
        docName: 'document.pdf',
        pageIndex: 1,
        displayPageNumber: 3,
        rotation: 0,
        thumbnailDataUrl: '',
        width: 500,
        height: 500,
        selected: false,
      },
    ];

    // 6. Merge & export
    const mergedBytes = await mergePages(pages, documentMap);
    expect(mergedBytes.byteLength).toBeGreaterThan(0);

    const resultDoc = await PDFDocument.load(mergedBytes);
    expect(resultDoc.getPageCount()).toBe(3);
    expect(resultDoc.getPage(1).getRotation().angle).toBe(90);
  });

  it('embeds real PNG assets from public directory without crashing', async () => {
    const faviconPath = path.resolve(process.cwd(), 'public/favicon.png');
    if (fs.existsSync(faviconPath)) {
      const realPngBytes = fs.readFileSync(faviconPath);
      const doc = await PDFDocument.create();
      const img = await embedImageBytesSafely(doc, realPngBytes, 'image/png');
      expect(img.width).toBeGreaterThan(0);
      expect(img.height).toBeGreaterThan(0);

      const page = doc.addPage([img.width, img.height]);
      page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
      const savedBytes = await doc.save();
      expect(savedBytes.byteLength).toBeGreaterThan(0);
    }
  });

  it('applies image watermark using PNG image bytes without throwing', async () => {
    const baseDoc = await PDFDocument.create();
    baseDoc.addPage([600, 800]);
    const basePdfBytes = await baseDoc.save();

    const watermarkedBytes = await watermarkPdf(basePdfBytes, {
      type: 'image',
      imageBytes: pngBytes,
      imageType: 'png',
      opacity: 0.5,
      rotation: 30,
      position: 'center',
    });

    expect(watermarkedBytes).toBeInstanceOf(Uint8Array);
    expect(watermarkedBytes.byteLength).toBeGreaterThan(0);

    const doc = await PDFDocument.load(watermarkedBytes);
    expect(doc.getPageCount()).toBe(1);
  });

  it('throws descriptive error on empty image list', async () => {
    await expect(imagesToPdf([])).rejects.toThrow('No images selected.');
  });

  it('keeps buffer intact across multiple sequential calls to loadPdfDocument', async () => {
    const doc = await PDFDocument.create();
    doc.addPage([100, 100]);
    const bytes = await doc.save();
    const len = bytes.byteLength;

    for (let i = 0; i < 5; i++) {
      const p = await loadPdfDocument(bytes);
      expect(p.numPages).toBe(1);
      expect(bytes.byteLength).toBe(len);
      expect(bytes.buffer.byteLength).toBeGreaterThan(0);
      await destroyPdfDocument(p);
    }
  });

  it('converts multiple PNG images in batch into a multi-page PDF', async () => {
    const file1 = new File([pngBytes], 'page1.png', { type: 'image/png' });
    const file2 = new File([pngBytes], 'page2.png', { type: 'image/png' });
    const file3 = new File([pngBytes], 'page3.png', { type: 'image/png' });

    const pdfBytes = await imagesToPdf([file1, file2, file3], { pageSize: 'A4' });
    expect(pdfBytes.byteLength).toBeGreaterThan(0);

    const doc = await PDFDocument.load(pdfBytes);
    expect(doc.getPageCount()).toBe(3);
  });

  it('applies tiled repeat watermark across 3x3 grid when repeat is enabled', async () => {
    const baseDoc = await PDFDocument.create();
    baseDoc.addPage([600, 800]);
    const baseBytes = await baseDoc.save();

    const watermarkedBytes = await watermarkPdf(baseBytes, {
      type: 'text',
      text: 'CONFIDENTIAL TILE',
      fontSize: 32,
      opacity: 0.25,
      rotation: 45,
      repeat: true,
    });

    expect(watermarkedBytes).toBeInstanceOf(Uint8Array);
    expect(watermarkedBytes.byteLength).toBeGreaterThan(baseBytes.byteLength);

    const doc = await PDFDocument.load(watermarkedBytes);
    expect(doc.getPageCount()).toBe(1);
  });

  it('applies image watermark with repeat tiling without crashing', async () => {
    const baseDoc = await PDFDocument.create();
    baseDoc.addPage([500, 500]);
    const baseBytes = await baseDoc.save();

    const watermarkedBytes = await watermarkPdf(baseBytes, {
      type: 'image',
      imageBytes: pngBytes,
      imageType: 'png',
      opacity: 0.4,
      rotation: 0,
      repeat: true,
    });

    expect(watermarkedBytes).toBeInstanceOf(Uint8Array);
    const doc = await PDFDocument.load(watermarkedBytes);
    expect(doc.getPageCount()).toBe(1);
  });

  it('canvasToBlob converts successfully with native toBlob and fallback', async () => {
    // 1. Mock canvas with native toBlob
    const mockBlob = new Blob(['bytes'], { type: 'image/png' });
    const fakeCanvasWithBlob: any = {
      toBlob: vi.fn((cb: Function) => cb(mockBlob)),
    };
    const res1 = await canvasToBlob(fakeCanvasWithBlob, 'image/png');
    expect(res1).toBe(mockBlob);

    // 2. Mock canvas without toBlob, using toDataURL
    const fakeCanvasWithDataUrl: any = {
      toBlob: undefined,
      toDataURL: vi.fn(() => 'data:image/png;base64,' + pngBase64),
    };
    const res2 = await canvasToBlob(fakeCanvasWithDataUrl, 'image/png');
    expect(res2).toBeInstanceOf(Blob);
    expect(res2.type).toBe('image/png');
    expect(res2.size).toBe(pngBytes.byteLength);
  });
});

