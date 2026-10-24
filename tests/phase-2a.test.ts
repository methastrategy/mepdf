import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  t,
  getLanguage,
  setLanguage,
  onLanguageChange,
  translations,
  type Language,
} from '../src/core/i18n';
import {
  saveWorkspaceState,
  loadWorkspaceState,
  clearWorkspaceState,
  _resetMemoryStore,
} from '../src/core/workspace-storage';
import {
  HASH_TO_ROUTE_MAP,
  ROUTE_TO_HASH_MAP,
  getCurrentRoute,
  setHashRoute,
  type ToolRoute,
} from '../src/core/router';
import type { DocumentMetadata, PDFPageItem } from '../src/core/types';

describe('Phase 2A - i18n Localization Engine', () => {
  beforeEach(() => {
    setLanguage('th');
  });

  it('defaults to or sets language correctly', () => {
    expect(getLanguage()).toBe('th');
    setLanguage('en');
    expect(getLanguage()).toBe('en');
  });

  it('translates basic string keys in English and Thai', () => {
    setLanguage('en');
    expect(t('brandName')).toBe('mePDF');
    expect(t('tabStudio')).toBe('Visual Studio (Merge & Organize)');
    expect(t('tabSplit')).toBe('Split PDF');

    setLanguage('th');
    expect(t('brandName')).toBe('mePDF');
    expect(t('tabStudio')).toBe('Visual Studio (รวมและจัดหน้า)');
    expect(t('tabSplit')).toBe('แยกหน้า PDF');
  });

  it('interpolates dynamic parameters into translated strings', () => {
    setLanguage('en');
    expect(t('toolbarPagesCount', { count: 5 })).toBe('5 pages');
    expect(t('toolbarSelectedOfTotal', { selected: 2, total: 5 })).toBe('2 of 5 selected');
    expect(t('toastImportSuccess', { count: 3 })).toBe('Imported 3 pages successfully!');

    setLanguage('th');
    expect(t('toolbarPagesCount', { count: 5 })).toBe('5 หน้า');
    expect(t('toolbarSelectedOfTotal', { selected: 2, total: 5 })).toBe('เลือก 2 จาก 5 หน้า');
    expect(t('toastImportSuccess', { count: 3 })).toBe('นำเข้า 3 หน้าสำเร็จ!');
  });

  it('notifies listeners on language change', () => {
    const changes: Language[] = [];
    const unsubscribe = onLanguageChange((lang) => {
      changes.push(lang);
    });

    setLanguage('en');
    setLanguage('th');
    setLanguage('en');

    unsubscribe();
    setLanguage('th');

    expect(changes).toEqual(['en', 'th', 'en']);
  });

  it('has matching translation keys across all languages', () => {
    const enKeys = Object.keys(translations.en).sort();
    const thKeys = Object.keys(translations.th).sort();
    expect(thKeys).toEqual(enKeys);
  });
});

describe('Phase 2A - Workspace Storage (IndexedDB / Memory Fallback)', () => {
  beforeEach(async () => {
    _resetMemoryStore();
    await clearWorkspaceState();
  });

  const dummyDoc: DocumentMetadata = {
    id: 'doc_test_1',
    filename: 'test.pdf',
    size: 1024,
    pageCount: 2,
    fileBytes: new Uint8Array([37, 80, 68, 70, 45]), // %PDF-
  };

  const dummyPages: PDFPageItem[] = [
    {
      id: 'doc_test_1_p1',
      docId: 'doc_test_1',
      docName: 'test.pdf',
      pageIndex: 0,
      displayPageNumber: 1,
      rotation: 90,
      thumbnailDataUrl: 'data:image/png;base64,abc',
      width: 595,
      height: 842,
      selected: false,
    },
    {
      id: 'doc_test_1_p2',
      docId: 'doc_test_1',
      docName: 'test.pdf',
      pageIndex: 1,
      displayPageNumber: 2,
      rotation: 0,
      thumbnailDataUrl: 'data:image/png;base64,def',
      width: 595,
      height: 842,
      selected: false,
    },
  ];

  it('saves and restores workspace state faithfully', async () => {
    const saveResult = await saveWorkspaceState([dummyDoc], dummyPages);
    expect(saveResult).toBe(true);

    const loaded = await loadWorkspaceState();
    expect(loaded).not.toBeNull();
    expect(loaded?.documents).toHaveLength(1);
    expect(loaded?.documents[0]?.filename).toBe('test.pdf');
    expect(loaded?.documents[0]?.fileBytes).toBeInstanceOf(Uint8Array);
    expect(loaded?.pages).toHaveLength(2);
    expect(loaded?.pages[0]?.rotation).toBe(90);
    expect(loaded?.pages[1]?.rotation).toBe(0);
  });

  it('clears saved workspace state completely', async () => {
    await saveWorkspaceState([dummyDoc], dummyPages);
    const clearResult = await clearWorkspaceState();
    expect(clearResult).toBe(true);

    const loadedAfterClear = await loadWorkspaceState();
    expect(loadedAfterClear).toBeNull();
  });

  it('prunes unused documents in decoupled storage when pages are removed', async () => {
    const dummyDoc2: DocumentMetadata = {
      id: 'doc_test_2',
      filename: 'second.pdf',
      size: 2048,
      pageCount: 1,
      fileBytes: new Uint8Array([37, 80, 68, 70, 45, 50]),
    };
    const page2: PDFPageItem = {
      id: 'doc_test_2_p1',
      docId: 'doc_test_2',
      docName: 'second.pdf',
      pageIndex: 0,
      displayPageNumber: 1,
      rotation: 0,
      thumbnailDataUrl: 'data:image/png;base64,xyz',
      width: 595,
      height: 842,
      selected: false,
    };

    // Save with 2 docs and 3 pages
    await saveWorkspaceState([dummyDoc, dummyDoc2], [...dummyPages, page2]);
    let loaded = await loadWorkspaceState();
    expect(loaded?.documents).toHaveLength(2);
    expect(loaded?.pages).toHaveLength(3);

    // Remove pages from doc_test_2, keeping only dummyPages
    await saveWorkspaceState([dummyDoc], dummyPages);
    loaded = await loadWorkspaceState();
    expect(loaded?.documents).toHaveLength(1);
    expect(loaded?.documents[0]?.id).toBe('doc_test_1');
    expect(loaded?.pages).toHaveLength(2);
  });
});

describe('Phase 2A - URL Hash Tool Router', () => {
  const originalWindow = (globalThis as any).window;

  beforeEach(() => {
    (globalThis as any).window = {
      location: { hash: '' },
      history: {
        replaceState: (_data: any, _unused: string, url: string) => {
          (globalThis as any).window.location.hash = url;
        },
      },
    };
  });

  afterEach(() => {
    (globalThis as any).window = originalWindow;
  });

  it('correctly maps known hashes to tool routes', () => {
    expect(HASH_TO_ROUTE_MAP['#/merge']).toBe('studio');
    expect(HASH_TO_ROUTE_MAP['#/studio']).toBe('studio');
    expect(HASH_TO_ROUTE_MAP['#/split']).toBe('split');
    expect(HASH_TO_ROUTE_MAP['#/compress']).toBe('compress');
    expect(HASH_TO_ROUTE_MAP['#/protect']).toBe('protect');
    expect(HASH_TO_ROUTE_MAP['#/encrypt']).toBe('protect');
    expect(HASH_TO_ROUTE_MAP['#/pdf-to-images']).toBe('pdf2img');
    expect(HASH_TO_ROUTE_MAP['#/images-to-pdf']).toBe('img2pdf');
    expect(HASH_TO_ROUTE_MAP['#/extract-text']).toBe('extract-text');
  });

  it('correctly maps tool routes to canonical hashes', () => {
    expect(ROUTE_TO_HASH_MAP['studio']).toBe('#/merge');
    expect(ROUTE_TO_HASH_MAP['split']).toBe('#/split');
    expect(ROUTE_TO_HASH_MAP['compress']).toBe('#/compress');
    expect(ROUTE_TO_HASH_MAP['protect']).toBe('#/protect');
    expect(ROUTE_TO_HASH_MAP['img2pdf']).toBe('#/images-to-pdf');
    expect(ROUTE_TO_HASH_MAP['pdf2img']).toBe('#/pdf-to-images');
    expect(ROUTE_TO_HASH_MAP['extract-text']).toBe('#/extract-text');
  });

  it('updates window hash cleanly via setHashRoute', () => {
    setHashRoute('compress');
    expect(getCurrentRoute()).toBe('compress');

    setHashRoute('split');
    expect(getCurrentRoute()).toBe('split');

    setHashRoute('extract-text');
    expect(getCurrentRoute()).toBe('extract-text');

    setHashRoute('studio');
    expect(getCurrentRoute()).toBe('studio');
  });
});
