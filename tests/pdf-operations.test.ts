import { describe, it, expect } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { splitPagesByRanges, mergePages } from '../src/core/pdf-operations';
import { getDefaultSplitRange } from '../src/components/Modal';
import {
  clearThumbnailCache,
  removeDocThumbnails,
  getThumbnailCacheSize,
  setCachedThumbnail,
  destroyPdfDocument,
} from '../src/core/pdf-renderer';
import type { PDFPageItem, DocumentMetadata, CompressionResult } from '../src/core/types';

describe('Split Default Range calculation (getDefaultSplitRange)', () => {
  it('handles 1-page and 0-page document defensively', () => {
    expect(getDefaultSplitRange(1)).toBe('1');
    expect(getDefaultSplitRange(0)).toBe('1');
    expect(getDefaultSplitRange(-5)).toBe('1');
    expect(getDefaultSplitRange(NaN)).toBe('1');
  });

  it('handles 2-page document with clean separation without duplicates', () => {
    // The previous bug produced "1-2, 2-2"
    expect(getDefaultSplitRange(2)).toBe('1, 2');
  });

  it('handles 3-page document', () => {
    expect(getDefaultSplitRange(3)).toBe('1, 2-3');
  });

  it('handles 4-page and multi-page documents', () => {
    expect(getDefaultSplitRange(4)).toBe('1-2, 3-4');
    expect(getDefaultSplitRange(5)).toBe('1-2, 3-5');
    expect(getDefaultSplitRange(6)).toBe('1-3, 4-6');
    expect(getDefaultSplitRange(10)).toBe('1-5, 6-10');
  });
});

describe('Split 2-page document with "1, 2"', () => {
  async function createTwoPagePdf(): Promise<Uint8Array> {
    const doc = await PDFDocument.create();
    doc.addPage([300, 300]);
    doc.addPage([300, 300]);
    return await doc.save();
  }

  it('splits a 2-page document using "1, 2" into exactly two 1-page files', async () => {
    const bytes = await createTwoPagePdf();
    const docMap = new Map<string, DocumentMetadata>();
    docMap.set('doc-2p', {
      id: 'doc-2p',
      filename: 'two_pages.pdf',
      size: bytes.byteLength,
      pageCount: 2,
      fileBytes: bytes,
    });

    const pages: PDFPageItem[] = [
      {
        id: 'p1',
        docId: 'doc-2p',
        docName: 'two_pages.pdf',
        pageIndex: 0,
        displayPageNumber: 1,
        rotation: 0,
        thumbnailDataUrl: '',
        width: 300,
        height: 300,
        selected: false,
      },
      {
        id: 'p2',
        docId: 'doc-2p',
        docName: 'two_pages.pdf',
        pageIndex: 1,
        displayPageNumber: 2,
        rotation: 0,
        thumbnailDataUrl: '',
        width: 300,
        height: 300,
        selected: false,
      },
    ];

    const rangeStr = getDefaultSplitRange(2); // "1, 2"
    const results = await splitPagesByRanges(pages, docMap, rangeStr, 'split');

    expect(results).toHaveLength(2);
    expect(results[0]?.filename).toBe('split_page_1.pdf');
    expect(results[1]?.filename).toBe('split_page_2.pdf');

    const doc1 = await PDFDocument.load(results[0]!.bytes);
    expect(doc1.getPageCount()).toBe(1);

    const doc2 = await PDFDocument.load(results[1]!.bytes);
    expect(doc2.getPageCount()).toBe(1);
  });
});

describe('Encrypted Document Handling in mergePages and splitPagesByRanges', () => {
  // A minimal valid PDF structure with an /Encrypt trailer entry
  const encryptedPdfText = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 400] >>
endobj
4 0 obj
<< /Filter /Standard /V 1 /R 2 /O (12345678901234567890123456789012) /U (12345678901234567890123456789012) /P -44 >>
endobj
xref
0 5
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000187 00000 n 
trailer
<< /Size 5 /Root 1 0 R /Encrypt 4 0 R >>
startxref
299
%%EOF`;

  const encryptedPdfBytes = new TextEncoder().encode(encryptedPdfText);

  it('proves that PDFDocument.load without ignoreEncryption throws Encrypted error', async () => {
    await expect(PDFDocument.load(encryptedPdfBytes)).rejects.toThrow(/Input document to `PDFDocument.load` is encrypted/);
  });

  it('proves that PDFDocument.load with { ignoreEncryption: true } succeeds', async () => {
    const loadedDoc = await PDFDocument.load(encryptedPdfBytes, { ignoreEncryption: true });
    expect(loadedDoc.getPageCount()).toBe(1);
  });

  it('merges pages from an encrypted document without throwing EncryptedPDFError', async () => {
    const docMap = new Map<string, DocumentMetadata>();
    docMap.set('enc-doc', {
      id: 'enc-doc',
      filename: 'protected.pdf',
      size: encryptedPdfBytes.byteLength,
      pageCount: 1,
      fileBytes: encryptedPdfBytes,
    });

    const pages: PDFPageItem[] = [
      {
        id: 'enc-p1',
        docId: 'enc-doc',
        docName: 'protected.pdf',
        pageIndex: 0,
        displayPageNumber: 1,
        rotation: 0,
        thumbnailDataUrl: '',
        width: 400,
        height: 400,
        selected: false,
      },
    ];

    const mergedBytes = await mergePages(pages, docMap);
    expect(mergedBytes).toBeInstanceOf(Uint8Array);
    expect(mergedBytes.byteLength).toBeGreaterThan(0);

    const resultDoc = await PDFDocument.load(mergedBytes);
    expect(resultDoc.getPageCount()).toBe(1);
  });

  it('splits pages from an encrypted document without throwing EncryptedPDFError', async () => {
    const docMap = new Map<string, DocumentMetadata>();
    docMap.set('enc-doc', {
      id: 'enc-doc',
      filename: 'protected.pdf',
      size: encryptedPdfBytes.byteLength,
      pageCount: 1,
      fileBytes: encryptedPdfBytes,
    });

    const pages: PDFPageItem[] = [
      {
        id: 'enc-p1',
        docId: 'enc-doc',
        docName: 'protected.pdf',
        pageIndex: 0,
        displayPageNumber: 1,
        rotation: 0,
        thumbnailDataUrl: '',
        width: 400,
        height: 400,
        selected: false,
      },
    ];

    const splitResults = await splitPagesByRanges(pages, docMap, '1', 'enc_split');
    expect(splitResults).toHaveLength(1);
    expect(splitResults[0]?.filename).toBe('enc_split_page_1.pdf');
    const doc = await PDFDocument.load(splitResults[0]!.bytes);
    expect(doc.getPageCount()).toBe(1);
  });
});

describe('Thumbnail cache pruning and memory release', () => {
  it('clears thumbnail cache and prunes specific doc thumbnails without prefix collision', () => {
    clearThumbnailCache();
    expect(getThumbnailCacheSize()).toBe(0);

    // Populate actual cache via setCachedThumbnail
    setCachedThumbnail('docA-p1-r0-w320', 'data:image/jpeg;base64,aaa');
    setCachedThumbnail('docA-p2-r0-w320', 'data:image/jpeg;base64,bbb');
    setCachedThumbnail('docA_extra-p1-r0-w320', 'data:image/jpeg;base64,xxx');
    setCachedThumbnail('docB-p1-r0-w320', 'data:image/jpeg;base64,ccc');

    expect(getThumbnailCacheSize()).toBe(4);

    // Pruning docA must delete docA-p1 and docA-p2, but NOT docA_extra or docB!
    removeDocThumbnails('docA');
    expect(getThumbnailCacheSize()).toBe(2);

    // Pruning docB removes docB
    removeDocThumbnails('docB');
    expect(getThumbnailCacheSize()).toBe(1);

    clearThumbnailCache();
    expect(getThumbnailCacheSize()).toBe(0);
  });

  it('safely handles destroyPdfDocument', async () => {
    const fakeProxy = {
      destroy: async () => {},
    };
    await expect(destroyPdfDocument(fakeProxy as any)).resolves.not.toThrow();
  });
});

describe('Filename preservation and compression paradox invariants', () => {
  it('correctly resolves single-document export name and multi-document merge name', () => {
    function resolveExportFilename(pages: { docId: string }[], docMap: Map<string, { filename: string }>): string {
      const distinctDocIds = new Set(pages.map((p) => p.docId));
      if (distinctDocIds.size === 1) {
        const docId = distinctDocIds.values().next().value;
        const doc = docId ? docMap.get(docId) : null;
        if (doc?.filename) {
          return `${doc.filename.replace(/\.pdf$/i, '')}_edited.pdf`;
        }
      }
      return 'mepdf_merged.pdf';
    }

    const docMap = new Map<string, { filename: string }>();
    docMap.set('d1', { filename: 'Invoice_2026.pdf' });
    docMap.set('d2', { filename: 'Receipt.PDF' });

    // Single doc
    expect(resolveExportFilename([{ docId: 'd1' }, { docId: 'd1' }], docMap)).toBe('Invoice_2026_edited.pdf');
    expect(resolveExportFilename([{ docId: 'd2' }], docMap)).toBe('Receipt_edited.pdf');

    // Multiple docs
    expect(resolveExportFilename([{ docId: 'd1' }, { docId: 'd2' }], docMap)).toBe('mepdf_merged.pdf');
  });

  it('validates ineffective compression ratio detection', () => {
    function computeCompressionResult(originalSize: number, compressedSize: number): CompressionResult {
      const ratio = originalSize > 0 ? compressedSize / originalSize : 1.0;
      const ineffective = compressedSize >= originalSize;
      return {
        pdfBytes: new Uint8Array(compressedSize),
        originalSize,
        compressedSize,
        ratio,
        ineffective,
      };
    }

    // Paradox case: compressed is larger or equal to original
    const paradox = computeCompressionResult(1000, 1050);
    expect(paradox.ineffective).toBe(true);
    expect(paradox.ratio).toBe(1.05);

    const identical = computeCompressionResult(1000, 1000);
    expect(identical.ineffective).toBe(true);

    // Effective case: compressed is smaller
    const effective = computeCompressionResult(1000, 600);
    expect(effective.ineffective).toBe(false);
    expect(effective.ratio).toBe(0.6);
  });
});
