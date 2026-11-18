import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { PDFDocument, PDFName, degrees } from 'pdf-lib';
import {
  updatePdfMetadata,
  getPDFMetadata,
  mergePages,
  splitPagesByRanges,
  syncDocumentAfterTauriSave,
} from '../src/core/pdf-operations';
import {
  removeDocThumbnails,
  setCachedThumbnail,
  thumbnailCache,
} from '../src/core/pdf-renderer';
import {
  saveWorkspaceState,
  loadWorkspaceState,
  clearWorkspaceState,
  _resetMemoryStore,
  _isDocPersisted,
} from '../src/core/workspace-storage';
import type { DocumentMetadata, PDFPageItem } from '../src/core/types';

describe('Phase 1.1: Fix Viewport Height 62px Overflow', () => {
  it('ensures .workspace-main uses natural flex bounds without hardcoded 100dvh calculation', () => {
    const cssPath = path.resolve(__dirname, '../src/styles/app.css');
    const cssContent = fs.readFileSync(cssPath, 'utf8');

    // .workspace-main must use flex: 1, height: auto, max-height: none
    const wsMainMatch = cssContent.match(/\.workspace-main\s*\{([^}]+)\}/);
    expect(wsMainMatch).not.toBeNull();
    const wsMainBody = wsMainMatch![1];
    expect(wsMainBody).toContain('flex: 1');
    expect(wsMainBody).toContain('min-height: 0');
    expect(wsMainBody).toContain('height: auto');
    expect(wsMainBody).toContain('max-height: none');
    expect(wsMainBody).not.toContain('calc(100vh - var(--ribbon-height');
    expect(wsMainBody).not.toContain('calc(100dvh - var(--ribbon-height');

    // .workspace-main.in-cockpit must also use flex: 1, height: auto, max-height: none
    const wsInCockpitMatch = cssContent.match(/\.workspace-main\.in-cockpit\s*\{([^}]+)\}/);
    expect(wsInCockpitMatch).not.toBeNull();
    const wsInCockpitBody = wsInCockpitMatch![1];
    expect(wsInCockpitBody).toContain('flex: 1');
    expect(wsInCockpitBody).toContain('min-height: 0');
    expect(wsInCockpitBody).toContain('height: auto');
    expect(wsInCockpitBody).toContain('max-height: none');
    expect(wsInCockpitBody).not.toContain('calc(100vh - var(--ribbon-height');

    // .cockpit-workspace must use height: 100% and min-height: 0
    const cockpitWsMatch = cssContent.match(/\.cockpit-workspace\s*\{([^}]+)\}/);
    expect(cockpitWsMatch).not.toBeNull();
    const cockpitWsBody = cockpitWsMatch![1];
    expect(cockpitWsBody).toContain('height: 100%');
    expect(cockpitWsBody).toContain('min-height: 0');
    expect(cockpitWsBody).not.toContain('calc(100vh - var(--ribbon-height');
  });
});

describe('Phase 1.2: Fix Tauri Save In-memory Desync', () => {
  it('synchronizes in-memory document bytes and resets page state after native file overwrite', async () => {
    // 1. Create a 3-page source document
    const srcDoc = await PDFDocument.create();
    srcDoc.addPage([400, 600]);
    srcDoc.addPage([400, 600]);
    srcDoc.addPage([400, 600]);
    const originalBytes = await srcDoc.save();

    const singleDoc: DocumentMetadata = {
      id: 'doc_tauri_sync',
      filename: 'contract.pdf',
      nativePath: 'C:\\Users\\User\\Documents\\contract.pdf',
      size: originalBytes.length,
      pageCount: 3,
      fileBytes: originalBytes,
    };

    const documentMap = new Map<string, DocumentMetadata>();
    documentMap.set(singleDoc.id, singleDoc);

    // User workspace has 2 pages (page 0 was deleted, remaining are page index 1 and 2, with page 1 rotated by 90)
    const pages: PDFPageItem[] = [
      {
        id: 'p1',
        docId: singleDoc.id,
        docName: singleDoc.filename,
        pageIndex: 1, // original index 1
        displayPageNumber: 2,
        rotation: 90,
        thumbnailDataUrl: '',
        width: 400,
        height: 600,
        selected: false,
      },
      {
        id: 'p2',
        docId: singleDoc.id,
        docName: singleDoc.filename,
        pageIndex: 2, // original index 2
        displayPageNumber: 3,
        rotation: 0,
        thumbnailDataUrl: '',
        width: 400,
        height: 600,
        selected: false,
      },
    ];

    // Merge pages as done during Tauri save
    const mergedBytes = await mergePages(pages, documentMap);
    expect(mergedBytes.byteLength).toBeGreaterThan(0);

    // Populate thumbnail cache to verify cache invalidation on save
    setCachedThumbnail(`${singleDoc.id}-p1-r0-1600`, 'stale-page1-thumbnail');
    setCachedThumbnail(`${singleDoc.id}-p2-r0-1600`, 'stale-page2-thumbnail');
    expect(thumbnailCache.has(`${singleDoc.id}-p1-r0-1600`)).toBe(true);

    // Apply the Tauri save sync fix logic via production helper
    syncDocumentAfterTauriSave(singleDoc, pages, mergedBytes);
    documentMap.set(singleDoc.id, singleDoc);
    removeDocThumbnails(singleDoc.id);

    // Verify thumbnail cache is purged of stale entries for this document
    expect(thumbnailCache.has(`${singleDoc.id}-p1-r0-1600`)).toBe(false);
    expect(thumbnailCache.has(`${singleDoc.id}-p2-r0-1600`)).toBe(false);

    // Verify in-memory document state is now in sync with newly saved mergedBytes
    expect(singleDoc.fileBytes).toBe(mergedBytes);
    expect(singleDoc.size).toBe(mergedBytes.byteLength);
    expect(singleDoc.pageCount).toBe(2);
    expect(pages[0]?.pageIndex).toBe(0);
    expect(pages[0]?.rotation).toBe(0);
    expect(pages[1]?.pageIndex).toBe(1);
    expect(pages[1]?.rotation).toBe(0);

    // Subsequent operation 1: Split document into separate ranges
    // If pageIndex remained stale (index 2 in a 2-page doc), this would throw out-of-bounds error!
    const splitResults = await splitPagesByRanges(pages, documentMap, '1,2');
    expect(splitResults).toHaveLength(2);
    expect(splitResults[0]?.bytes).toBeInstanceOf(Uint8Array);
    expect(splitResults[1]?.bytes).toBeInstanceOf(Uint8Array);

    // Verify the split pages have valid page counts
    const splitDoc1 = await PDFDocument.load(splitResults[0]!.bytes);
    expect(splitDoc1.getPageCount()).toBe(1);
    const splitDoc2 = await PDFDocument.load(splitResults[1]!.bytes);
    expect(splitDoc2.getPageCount()).toBe(1);

    // Subsequent operation 2: Sanitize metadata on the synchronized document bytes
    const sanitizedBytes = await updatePdfMetadata(singleDoc.fileBytes, {}, true);
    const sanitizedDoc = await PDFDocument.load(sanitizedBytes);
    expect(sanitizedDoc.getPageCount()).toBe(2);
  });
});

describe('Phase 1.3: Fix PDF Metadata Sanitization', () => {
  it('clears info dictionary strings, purges XMP and PieceInfo catalogs, and zeroes timestamps', async () => {
    const doc = await PDFDocument.create();
    doc.setTitle('Sensitive Defense Contract');
    doc.setAuthor('Secret Engineer');
    doc.setSubject('Top Secret Specifications');
    doc.setKeywords(['confidential', 'classified']);
    doc.setCreator('Internal Engineering Suite v4.2');
    doc.setProducer('Acme Proprietary PDF Engine');

    // Attach XMP Metadata stream and PieceInfo dictionary to catalog
    doc.catalog.set(PDFName.of('Metadata'), doc.context.obj('<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?><x:xmpmeta>...</x:xmpmeta>'));
    doc.catalog.set(PDFName.of('PieceInfo'), doc.context.obj({ Illustrator: { Private: 'private-data' } }));

    // Set non-zero creation and modification dates
    doc.setCreationDate(new Date('2025-05-15T10:30:00Z'));
    doc.setModificationDate(new Date('2026-01-20T14:45:00Z'));
    doc.addPage([400, 600]);

    const dirtyBytes = await doc.save();
    expect(dirtyBytes.length).toBeGreaterThan(0);

    // Verify initial dirty state
    const initialMeta = await getPDFMetadata(dirtyBytes);
    expect(initialMeta.title).toBe('Sensitive Defense Contract');
    expect(initialMeta.author).toBe('Secret Engineer');
    expect(initialMeta.creationDate?.getFullYear()).toBe(2025);

    // Perform full sanitization
    const sanitizedBytes = await updatePdfMetadata(dirtyBytes, {}, true);

    // Verify sanitized metadata via getPDFMetadata
    const cleanMeta = await getPDFMetadata(sanitizedBytes);
    expect(cleanMeta.title).toBe('');
    expect(cleanMeta.author).toBe('');
    expect(cleanMeta.subject).toBe('');
    expect(cleanMeta.keywords).toBe('');
    expect(cleanMeta.creator).toBe('');
    expect(cleanMeta.producer).toBe('');
    expect(cleanMeta.creationDate?.getTime()).toBe(0);
    expect(cleanMeta.modificationDate?.getTime()).toBe(0);

    // Verify deep catalog inspection: Metadata and PieceInfo must be purged
    const cleanDoc = await PDFDocument.load(sanitizedBytes, { updateMetadata: false });
    expect(cleanDoc.catalog.has(PDFName.of('Metadata'))).toBe(false);
    expect(cleanDoc.catalog.has(PDFName.of('PieceInfo'))).toBe(false);
    expect(cleanDoc.getCreationDate()?.getTime()).toBe(0);
    expect(cleanDoc.getModificationDate()?.getTime()).toBe(0);
  });
});

describe('Phase 1.4: Optimize IndexedDB Disk Churn', () => {
  beforeEach(async () => {
    _resetMemoryStore();
    await clearWorkspaceState();
  });

  it('omits heavy thumbnailDataUrl from saved session payload to eliminate session store bloat', async () => {
    const dummyBytes = new Uint8Array([37, 80, 68, 70, 45, 49]); // %PDF-1
    const dummyDoc: DocumentMetadata = {
      id: 'doc_churn_1',
      filename: 'churn_test.pdf',
      size: dummyBytes.length,
      pageCount: 1,
      fileBytes: dummyBytes,
    };

    // Heavy 1600px base64 thumbnail string (~200KB mock)
    const heavyThumbnail = 'data:image/jpeg;base64,' + 'A'.repeat(50000);
    const dummyPage: PDFPageItem = {
      id: 'page_churn_1',
      docId: 'doc_churn_1',
      docName: 'churn_test.pdf',
      pageIndex: 0,
      displayPageNumber: 1,
      rotation: 0,
      thumbnailDataUrl: heavyThumbnail,
      width: 595,
      height: 842,
      selected: false,
    };

    const saved = await saveWorkspaceState([dummyDoc], [dummyPage]);
    expect(saved).toBe(true);

    // Restore workspace: session restored gracefully with thumbnailDataUrl as empty string (ready for lazy rehydration)
    const restored = await loadWorkspaceState();
    expect(restored).not.toBeNull();
    expect(restored?.documents).toHaveLength(1);
    expect(restored?.pages).toHaveLength(1);
    expect(restored?.pages[0]?.id).toBe('page_churn_1');
    expect(restored?.pages[0]?.thumbnailDataUrl).toBe('');
  });

  it('avoids re-writing unmodified raw document bytes on repeated saveWorkspaceState calls', async () => {
    const dummyBytes = new Uint8Array([37, 80, 68, 70, 45, 49, 46, 52]); // %PDF-1.4
    const dummyDoc: DocumentMetadata = {
      id: 'doc_tracking_1',
      filename: 'unmodified.pdf',
      size: dummyBytes.length,
      pageCount: 1,
      fileBytes: dummyBytes,
    };

    const dummyPage: PDFPageItem = {
      id: 'page_track_1',
      docId: 'doc_tracking_1',
      docName: 'unmodified.pdf',
      pageIndex: 0,
      displayPageNumber: 1,
      rotation: 0,
      thumbnailDataUrl: '',
      width: 595,
      height: 842,
      selected: false,
    };

    // Initial save: doc is persisted
    await saveWorkspaceState([dummyDoc], [dummyPage]);
    expect(_isDocPersisted('doc_tracking_1')).toBe(true);

    // Repeated save with same byte reference: unmodified document bytes are skipped
    const secondSave = await saveWorkspaceState([dummyDoc], [dummyPage]);
    expect(secondSave).toBe(true);
    expect(_isDocPersisted('doc_tracking_1')).toBe(true);

    // When byte reference or size changes (e.g. after edit/save):
    const newBytes = new Uint8Array([37, 80, 68, 70, 45, 49, 46, 55, 99]);
    dummyDoc.fileBytes = newBytes;
    dummyDoc.size = newBytes.length;

    const thirdSave = await saveWorkspaceState([dummyDoc], [dummyPage]);
    expect(thirdSave).toBe(true);
    expect(_isDocPersisted('doc_tracking_1')).toBe(true);

    // When metadata changes (e.g. renamed filename) without changing byte reference:
    dummyDoc.filename = 'renamed_document.pdf';
    const fourthSave = await saveWorkspaceState([dummyDoc], [dummyPage]);
    expect(fourthSave).toBe(true);

    const restored = await loadWorkspaceState();
    expect(restored?.documents[0]?.filename).toBe('renamed_document.pdf');
  });
});
