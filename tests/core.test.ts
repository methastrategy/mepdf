import { describe, it, expect } from 'vitest';
import { PDFDocument, degrees } from 'pdf-lib';
import { parseRangeExpression, mergePages, splitPagesByRanges } from '../src/core/pdf-operations';
import { formatBytes, getFileBaseName, escapeHtml } from '../src/utils/file-utils';
import type { PDFPageItem, DocumentMetadata } from '../src/core/types';

describe('formatBytes utility', () => {
  it('formats 0 bytes correctly', () => {
    expect(formatBytes(0)).toBe('0 B');
  });

  it('formats KB and MB correctly', () => {
    expect(formatBytes(1024)).toBe('1 KB');
    expect(formatBytes(1024 * 1024)).toBe('1 MB');
    expect(formatBytes(2.5 * 1024 * 1024)).toBe('2.5 MB');
  });

  it('handles custom decimal precision', () => {
    expect(formatBytes(1536, 2)).toBe('1.5 KB');
  });
});

describe('escapeHtml utility', () => {
  it('escapes dangerous HTML characters', () => {
    expect(escapeHtml('<script>alert("xss")</script>')).toBe('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
    expect(escapeHtml("Tom & Jerry's")).toBe('Tom &amp; Jerry&#39;s');
  });
});

describe('getFileBaseName utility', () => {
  it('strips extensions correctly', () => {
    expect(getFileBaseName('report.pdf')).toBe('report');
    expect(getFileBaseName('archive.tar.gz')).toBe('archive.tar');
    expect(getFileBaseName('photo')).toBe('photo');
  });
});

describe('parseRangeExpression', () => {
  it('returns individual pages when expression is empty', () => {
    expect(parseRangeExpression('', 3)).toEqual([[1], [2], [3]]);
    expect(parseRangeExpression('  ', 2)).toEqual([[1], [2]]);
  });

  it('parses mixed ranges and single pages', () => {
    expect(parseRangeExpression('1-3, 5, 7-8', 10)).toEqual([
      [1, 2, 3],
      [5],
      [7, 8],
    ]);
  });

  it('clamps out of bounds page numbers', () => {
    expect(parseRangeExpression('1-10', 4)).toEqual([[1, 2, 3, 4]]);
    expect(parseRangeExpression('0, 2, 99', 5)).toEqual([[2]]);
  });

  it('handles inverted ranges safely', () => {
    // 5-2 will clamp start to 2 or start=end
    const res = parseRangeExpression('5-2', 5);
    expect(res.length).toBeGreaterThan(0);
  });
});

describe('PDF operations - Merge & Split', () => {
  async function createTestPdf(pageCount: number, label: string): Promise<Uint8Array> {
    const doc = await PDFDocument.create();
    for (let i = 0; i < pageCount; i++) {
      const page = doc.addPage([400, 600]);
      page.setRotation(degrees(0));
    }
    return await doc.save();
  }

  it('merges multiple pages from different source documents with custom rotations', async () => {
    const docABytes = await createTestPdf(2, 'DocA');
    const docBBytes = await createTestPdf(2, 'DocB');

    const documentMap = new Map<string, DocumentMetadata>();
    documentMap.set('doc-a', {
      id: 'doc-a',
      filename: 'DocA.pdf',
      size: docABytes.byteLength,
      pageCount: 2,
      fileBytes: docABytes,
    });
    documentMap.set('doc-b', {
      id: 'doc-b',
      filename: 'DocB.pdf',
      size: docBBytes.byteLength,
      pageCount: 2,
      fileBytes: docBBytes,
    });

    // Reorder: DocB page 1, DocA page 2 (rotated 90°), DocA page 1
    const pagesToMerge: PDFPageItem[] = [
      {
        id: 'b-p1',
        docId: 'doc-b',
        docName: 'DocB.pdf',
        pageIndex: 0,
        displayPageNumber: 1,
        rotation: 0,
        thumbnailDataUrl: '',
        width: 400,
        height: 600,
        selected: false,
      },
      {
        id: 'a-p2',
        docId: 'doc-a',
        docName: 'DocA.pdf',
        pageIndex: 1,
        displayPageNumber: 2,
        rotation: 90,
        thumbnailDataUrl: '',
        width: 400,
        height: 600,
        selected: false,
      },
      {
        id: 'a-p1',
        docId: 'doc-a',
        docName: 'DocA.pdf',
        pageIndex: 0,
        displayPageNumber: 1,
        rotation: 180,
        thumbnailDataUrl: '',
        width: 400,
        height: 600,
        selected: false,
      },
    ];

    const mergedBytes = await mergePages(pagesToMerge, documentMap);
    expect(mergedBytes).toBeInstanceOf(Uint8Array);
    expect(mergedBytes.byteLength).toBeGreaterThan(0);

    // Verify merged document structure
    const verifiedDoc = await PDFDocument.load(mergedBytes);
    expect(verifiedDoc.getPageCount()).toBe(3);

    // Page 2 should have 90 degree rotation
    const page2 = verifiedDoc.getPage(1);
    expect(page2.getRotation().angle).toBe(90);

    // Page 3 should have 180 degree rotation
    const page3 = verifiedDoc.getPage(2);
    expect(page3.getRotation().angle).toBe(180);
  });

  it('preserves intrinsic page rotation when merging', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([400, 600]);
    page.setRotation(degrees(90)); // Intrinsic 90 degree rotation
    const docBytes = await doc.save();

    const documentMap = new Map<string, DocumentMetadata>();
    documentMap.set('doc-rotated', {
      id: 'doc-rotated',
      filename: 'Rotated.pdf',
      size: docBytes.byteLength,
      pageCount: 1,
      fileBytes: docBytes,
    });

    const pagesToMerge: PDFPageItem[] = [
      {
        id: 'rot-p1',
        docId: 'doc-rotated',
        docName: 'Rotated.pdf',
        pageIndex: 0,
        displayPageNumber: 1,
        rotation: 90, // Add 90 degrees in workspace
        thumbnailDataUrl: '',
        width: 400,
        height: 600,
        selected: false,
      },
    ];

    const mergedBytes = await mergePages(pagesToMerge, documentMap);
    const verifiedDoc = await PDFDocument.load(mergedBytes);
    // 90 intrinsic + 90 added = 180
    expect(verifiedDoc.getPage(0).getRotation().angle).toBe(180);
  });

  it('splits document by ranges into separate PDF files', async () => {
    const docBytes = await createTestPdf(4, 'DocMulti');
    const documentMap = new Map<string, DocumentMetadata>();
    documentMap.set('doc-multi', {
      id: 'doc-multi',
      filename: 'DocMulti.pdf',
      size: docBytes.byteLength,
      pageCount: 4,
      fileBytes: docBytes,
    });

    const pages: PDFPageItem[] = [0, 1, 2, 3].map((i) => ({
      id: `p-${i}`,
      docId: 'doc-multi',
      docName: 'DocMulti.pdf',
      pageIndex: i,
      displayPageNumber: i + 1,
      rotation: 0,
      thumbnailDataUrl: '',
      width: 400,
      height: 600,
      selected: false,
    }));

    const splitResults = await splitPagesByRanges(pages, documentMap, '1-2, 3-4', 'test');
    expect(splitResults).toHaveLength(2);
    expect(splitResults[0]?.filename).toBe('test_pages_1-2.pdf');
    expect(splitResults[1]?.filename).toBe('test_pages_3-4.pdf');

    const splitDoc1 = await PDFDocument.load(splitResults[0]!.bytes);
    expect(splitDoc1.getPageCount()).toBe(2);

    const splitDoc2 = await PDFDocument.load(splitResults[1]!.bytes);
    expect(splitDoc2.getPageCount()).toBe(2);
  });

  it('throws an error if merging an empty page list', async () => {
    const documentMap = new Map<string, DocumentMetadata>();
    await expect(mergePages([], documentMap)).rejects.toThrow('No pages selected to merge.');
  });
});

describe('Compression Presets specifications', () => {
  it('defines Screen (96 DPI), Ebook (150 DPI), and Print (300 DPI) presets accurately', async () => {
    const { COMPRESSION_PRESETS } = await import('../src/core/pdf-compressor');
    expect(COMPRESSION_PRESETS.screen?.dpi).toBe(96);
    expect(COMPRESSION_PRESETS.ebook?.dpi).toBe(150);
    expect(COMPRESSION_PRESETS.printer?.dpi).toBe(300);
  });
});

describe('Images to PDF conversion', () => {
  it('converts PNG image into a valid PDF document with A4 page fit', async () => {
    const { imagesToPdf } = await import('../src/core/pdf-operations');
    // 1x1 valid PNG
    const pngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const pngBytes = Uint8Array.from(atob(pngBase64), (c) => c.charCodeAt(0));
    const file = new File([pngBytes], 'pixel.png', { type: 'image/png' });

    const pdfBytes = await imagesToPdf([file], { pageSize: 'A4' });
    expect(pdfBytes).toBeInstanceOf(Uint8Array);
    expect(pdfBytes.byteLength).toBeGreaterThan(0);

    const doc = await PDFDocument.load(pdfBytes);
    expect(doc.getPageCount()).toBe(1);
  });
});

describe('ZIP packaging', () => {
  it('packages extracted images into a downloadable ZIP', async () => {
    const { createImagesZip } = await import('../src/core/pdf-operations');
    const JSZip = (await import('jszip')).default;

    const mockBlob = new Blob(['sample-image-data'], { type: 'image/png' });
    const items = [
      {
        name: 'page_001.png',
        blob: mockBlob,
        dataUrl: 'data:image/png;base64,...',
        pageNumber: 1,
        width: 100,
        height: 100,
      },
    ];

    const zipBlob = await createImagesZip(items);
    expect(zipBlob).toBeInstanceOf(Blob);

    const zipArrayBuffer = await zipBlob.arrayBuffer();
    const zip = await JSZip.loadAsync(zipArrayBuffer);
    expect(zip.file('page_001.png')).not.toBeNull();
  });
});
