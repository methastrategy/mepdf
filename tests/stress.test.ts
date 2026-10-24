import { describe, it, expect } from 'vitest';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { mergePages, splitPagesByRanges, protectPdf, addWatermarkToPdf, addPageNumbersToPdf, updatePdfMetadata } from '../src/core/pdf-operations';
import { compressPdfLossless } from '../src/core/pdf-compressor';
import type { PDFPageItem, DocumentMetadata } from '../src/core/types';

describe('WBS 4.3: End-to-End Stress & Chain Pipeline Testing', () => {
  it('handles large 60-page document batch merge and split without memory churn', async () => {
    // Generate a synthetic 30-page document
    const doc1 = await PDFDocument.create();
    const font = await doc1.embedFont(StandardFonts.Helvetica);
    for (let i = 1; i <= 30; i++) {
      const page = doc1.addPage([595, 842]);
      page.drawText(`Stress Document 1 — Page ${i}`, { x: 50, y: 780, size: 12, font });
    }
    const bytes1 = await doc1.save();

    // Generate another 30-page document
    const doc2 = await PDFDocument.create();
    for (let i = 1; i <= 30; i++) {
      const page = doc2.addPage([595, 842]);
      page.drawText(`Stress Document 2 — Page ${i}`, { x: 50, y: 780, size: 12, font });
    }
    const bytes2 = await doc2.save();

    const docMap = new Map<string, DocumentMetadata>();
    docMap.set('doc-1', {
      id: 'doc-1',
      filename: 'doc1_30p.pdf',
      size: bytes1.byteLength,
      pageCount: 30,
      fileBytes: bytes1,
    });
    docMap.set('doc-2', {
      id: 'doc-2',
      filename: 'doc2_30p.pdf',
      size: bytes2.byteLength,
      pageCount: 30,
      fileBytes: bytes2,
    });

    // Assemble 60-page interleaved sequence
    const pages: PDFPageItem[] = [];
    for (let i = 0; i < 30; i++) {
      pages.push({
        id: `p1_${i}`,
        docId: 'doc-1',
        docName: 'doc1_30p.pdf',
        pageIndex: i,
        displayPageNumber: i + 1,
        rotation: (i % 4) * 90,
        thumbnailDataUrl: '',
        width: 595,
        height: 842,
        selected: false,
      });
      pages.push({
        id: `p2_${i}`,
        docId: 'doc-2',
        docName: 'doc2_30p.pdf',
        pageIndex: i,
        displayPageNumber: i + 1,
        rotation: 0,
        thumbnailDataUrl: '',
        width: 595,
        height: 842,
        selected: false,
      });
    }

    expect(pages).toHaveLength(60);

    // Merge 60 pages
    const startTime = performance.now();
    let progressUpdates = 0;
    const mergedBytes = await mergePages(pages, docMap, () => {
      progressUpdates++;
    });
    const duration = performance.now() - startTime;

    expect(mergedBytes.byteLength).toBeGreaterThan(0);
    expect(progressUpdates).toBeGreaterThan(0);
    expect(duration).toBeLessThan(10000); // Must complete within 10s

    const mergedDoc = await PDFDocument.load(mergedBytes);
    expect(mergedDoc.getPageCount()).toBe(60);

    // Split 60 pages into 6 ranges of 10 pages each
    const splitResults = await splitPagesByRanges(
      pages,
      docMap,
      '1-10, 11-20, 21-30, 31-40, 41-50, 51-60',
      'stress_batch'
    );
    expect(splitResults).toHaveLength(6);
    for (const res of splitResults) {
      const partDoc = await PDFDocument.load(res.bytes);
      expect(partDoc.getPageCount()).toBe(10);
    }
  });

  it('executes a full end-to-end toolchain pipeline without buffer corruption', async () => {
    // Stage 1: Create initial base document
    const initialDoc = await PDFDocument.create();
    const p1 = initialDoc.addPage([500, 500]);
    p1.drawText('Original Raw Vector Text', { x: 50, y: 400, size: 16 });
    const p2 = initialDoc.addPage([500, 500]);
    p2.drawText('Page 2 Content', { x: 50, y: 400, size: 16 });
    const step1Bytes = await initialDoc.save();

    // Stage 2: Watermark
    const step2Bytes = await addWatermarkToPdf(step1Bytes, {
      type: 'text',
      text: 'CONFIDENTIAL ARCHIVE',
      fontSize: 28,
      rotation: 45,
      opacity: 0.25,
      position: 'center',
    });
    expect(step2Bytes.byteLength).toBeGreaterThan(0);

    // Stage 3: Page Numbering
    const step3Bytes = await addPageNumbersToPdf(step2Bytes, {
      format: 'page_n_of_total',
      position: 'bottom-center',
    });
    expect(step3Bytes.byteLength).toBeGreaterThan(0);

    // Stage 4: Metadata Update
    const step4Bytes = await updatePdfMetadata(
      step3Bytes,
      {
        title: 'End-to-End Stress Verified Document',
        author: 'mePDF Release Pipeline',
      },
      false
    );
    expect(step4Bytes.byteLength).toBeGreaterThan(0);

    // Stage 5: Lossless Deflate Compression
    const compResult = await compressPdfLossless(step4Bytes);
    expect(compResult.pdfBytes.byteLength).toBeGreaterThan(0);

    // Stage 6: Encrypt with Password
    const finalEncrypted = await protectPdf(compResult.pdfBytes, 'SuperSecretKey99#');
    expect(finalEncrypted.byteLength).toBeGreaterThan(0);

    // Inspect encryption signature
    const headerString = Array.from(finalEncrypted.slice(0, 4000))
      .map((b) => String.fromCharCode(b))
      .join('');
    expect(headerString).toContain('/Encrypt');
  });

  it('validates SEO, Open Graph and Structured Data (JSON-LD) integrity', () => {
    const indexPath = resolve(process.cwd(), 'index.html');
    const indexHtml = readFileSync(indexPath, 'utf8');

    expect(indexHtml).toContain('<title>');
    expect(indexHtml).toContain('name="description"');
    expect(indexHtml).toContain('name="keywords"');
    expect(indexHtml).toContain('property="og:title"');
    expect(indexHtml).toContain('property="og:image"');
    expect(indexHtml).toContain('name="twitter:card"');
    expect(indexHtml).toContain('application/ld+json');

    // Extract JSON-LD and verify valid JSON parse
    const match = indexHtml.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
    expect(match).not.toBeNull();
    const jsonLdContent = match![1]!.trim();
    const parsed = JSON.parse(jsonLdContent);

    expect(parsed['@context']).toBe('https://schema.org');
    expect(parsed['@type']).toBe('WebApplication');
    expect(parsed.name).toBe('mePDF');
    expect(parsed.offers.price).toBe('0');
    expect(parsed.featureList.length).toBeGreaterThan(5);
  });

  it('validates robots.txt and sitemap.xml presence', () => {
    const robotsPath = resolve(process.cwd(), 'public/robots.txt');
    const sitemapPath = resolve(process.cwd(), 'public/sitemap.xml');

    expect(existsSync(robotsPath)).toBe(true);
    expect(existsSync(sitemapPath)).toBe(true);

    const robotsContent = readFileSync(robotsPath, 'utf8');
    expect(robotsContent).toContain('User-agent: *');
    expect(robotsContent).toContain('sitemap.xml');

    const sitemapContent = readFileSync(sitemapPath, 'utf8');
    expect(sitemapContent).toContain('https://mepdf.vercel.app/');
    expect(sitemapContent).toContain('xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"');
  });
});
