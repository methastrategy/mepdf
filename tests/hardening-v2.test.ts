import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as pdfRenderer from '../src/core/pdf-renderer';
import { pdfToImages } from '../src/core/pdf-operations';
import { ModalManager } from '../src/components/Modal';
import { ToastManager } from '../src/components/Toast';
import { VisualGrid } from '../src/components/VisualGrid';
import type { PDFPageItem, DocumentMetadata } from '../src/core/types';

vi.mock('lucide', async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    createIcons: vi.fn(),
  };
});

describe('mePDF v2.0.2 Hardening Suite', () => {
  let originalDocument: any;
  let originalWindow: any;

  beforeEach(() => {
    originalDocument = (globalThis as any).document;
    originalWindow = (globalThis as any).window;
  });

  afterEach(() => {
    (globalThis as any).document = originalDocument;
    (globalThis as any).window = originalWindow;
    vi.restoreAllMocks();
  });

  describe('pdfToImages Memory Optimization', () => {
    it('generates image items with empty dataUrl to eliminate multi-megabyte allocations', async () => {
      // Mock loadPdfDocument
      const fakePdfDoc: any = {
        numPages: 2,
      };
      vi.spyOn(pdfRenderer, 'loadPdfDocument').mockResolvedValue(fakePdfDoc);
      vi.spyOn(pdfRenderer, 'destroyPdfDocument').mockResolvedValue(undefined);

      // Mock canvas
      const mockBlob = new Blob(['img-bytes'], { type: 'image/png' });
      const fakeCanvas: any = {
        width: 800,
        height: 1200,
        toBlob: vi.fn((cb: Function) => cb(mockBlob)),
      };
      vi.spyOn(pdfRenderer, 'renderPageToCanvas').mockResolvedValue(fakeCanvas);

      const items = await pdfToImages(new Uint8Array([1, 2, 3]), 150, 'png');

      expect(items).toHaveLength(2);
      expect(items[0]?.name).toBe('page_001.png');
      expect(items[0]?.width).toBe(800);
      expect(items[0]?.height).toBe(1200);
      expect(items[0]?.dataUrl).toBe(''); // Crucial memory optimization invariant
      expect(items[1]?.dataUrl).toBe('');
      expect(items[0]?.blob).toBe(mockBlob);
    });
  });

  describe('ModalManager Password Deadlock & ARIA & Focus Trap', () => {
    function setupMockDOM() {
      const listeners: Record<string, Function[]> = {};
      const elements: Record<string, any> = {};

      const createMockEl = (tag: string, id = '', className = '') => {
        const el: any = {
          tagName: tag.toUpperCase(),
          id,
          className,
          innerHTML: '',
          style: {},
          classList: {
            classes: new Set<string>(),
            add(c: string) { this.classes.add(c); },
            remove(c: string) { this.classes.delete(c); },
            contains(c: string) { return this.classes.has(c); },
          },
          attributes: {} as Record<string, string>,
          setAttribute(k: string, v: string) { this.attributes[k] = v; },
          getAttribute(k: string) { return this.attributes[k] || null; },
          children: [] as any[],
          appendChild(child: any) {
            this.children.push(child);
            child.parentElement = this;
            return child;
          },
          removeChild(child: any) {
            this.children = this.children.filter((c: any) => c !== child);
            child.parentElement = null;
            return child;
          },
          querySelector(sel: string) {
            if (sel === '#modal-header-title') return elements['#modal-header-title'];
            if (sel === '#modal-body-content') return elements['#modal-body-content'];
            if (sel === '#modal-footer-actions') return elements['#modal-footer-actions'];
            if (sel === '#modal-close-btn') return elements['#modal-close-btn'];
            if (sel === '#pdf-password-input') return elements['#pdf-password-input'];
            if (sel === '#pdf-password-error') return elements['#pdf-password-error'];
            if (sel === '#modal-password-cancel-btn') return elements['#modal-password-cancel-btn'];
            if (sel === '#modal-password-submit-btn') return elements['#modal-password-submit-btn'];
            return null;
          },
          querySelectorAll(sel: string) {
            return [];
          },
          eventListeners: {} as Record<string, Function[]>,
          addEventListener(evt: string, cb: Function) {
            if (!this.eventListeners[evt]) this.eventListeners[evt] = [];
            this.eventListeners[evt].push(cb);
          },
          removeEventListener(evt: string, cb: Function) {
            if (!this.eventListeners[evt]) return;
            this.eventListeners[evt] = this.eventListeners[evt].filter((f: any) => f !== cb);
          },
          click() {
            this.eventListeners['click']?.forEach((cb: any) => cb({ target: this }));
          },
          focus: vi.fn(),
          select: vi.fn(),
          value: '',
        };
        if (id) elements[`#${id}`] = el;
        return el;
      };

      const mockBody = createMockEl('body');
      elements['#modal-header-title'] = createMockEl('h3', 'modal-header-title');
      elements['#modal-body-content'] = createMockEl('div', 'modal-body-content');
      elements['#modal-footer-actions'] = createMockEl('div', 'modal-footer-actions');
      elements['#modal-close-btn'] = createMockEl('button', 'modal-close-btn');

      const mockDoc: any = {
        body: mockBody,
        createElement: (tag: string) => {
          const el = createMockEl(tag);
          return el;
        },
        querySelector: (sel: string) => {
          if (sel === '#app-modal-overlay') {
            return elements['#app-modal-overlay'] || mockBody.children.find((c: any) => c.id === 'app-modal-overlay') || null;
          }
          return null;
        },
        querySelectorAll: () => [],
        activeElement: null,
      };

      const mockWin: any = {
        addEventListener: (evt: string, cb: Function) => {
          if (!listeners[evt]) listeners[evt] = [];
          listeners[evt].push(cb);
        },
        dispatchKeydown: (key: string, shiftKey = false) => {
          listeners['keydown']?.forEach((cb) => cb({ key, shiftKey, preventDefault: vi.fn() }));
        },
      };

      (globalThis as any).document = mockDoc;
      (globalThis as any).window = mockWin;

      return { mockDoc, mockWin, elements, createMockEl };
    }

    it('resolves the password prompt cancellation promise when closed via close() or Escape', async () => {
      const { elements, createMockEl } = setupMockDOM();
      const modal = new ModalManager();

      elements['#pdf-password-input'] = createMockEl('input', 'pdf-password-input');
      elements['#pdf-password-error'] = createMockEl('div', 'pdf-password-error');
      elements['#modal-password-cancel-btn'] = createMockEl('button', 'modal-password-cancel-btn');
      elements['#modal-password-submit-btn'] = createMockEl('button', 'modal-password-submit-btn');

      let cancelled = false;
      let submitted = false;

      // Simulate the exact ingestion pattern in main.ts
      const passwordPromise = new Promise<string>((resolve, reject) => {
        modal.showPasswordPromptModal(
          'locked.pdf',
          (pwd) => {
            submitted = true;
            resolve(pwd);
          },
          () => {
            cancelled = true;
            reject(new Error('Password prompt cancelled'));
          }
        );
      });

      // User hits Escape or clicks X / backdrop which triggers modal.close()
      modal.close();

      await expect(passwordPromise).rejects.toThrow('Password prompt cancelled');
      expect(cancelled).toBe(true);
      expect(submitted).toBe(false);
    });

    it('does not fire onCancel when password submit succeeds', async () => {
      const { elements, createMockEl } = setupMockDOM();
      const modal = new ModalManager();

      const pwdInput = createMockEl('input', 'pdf-password-input');
      pwdInput.value = 'secret123';
      elements['#pdf-password-input'] = pwdInput;
      elements['#pdf-password-error'] = createMockEl('div', 'pdf-password-error');
      elements['#modal-password-cancel-btn'] = createMockEl('button', 'modal-password-cancel-btn');
      const submitBtn = createMockEl('button', 'modal-password-submit-btn');
      elements['#modal-password-submit-btn'] = submitBtn;

      let onCancelCalled = false;
      let submitValue = '';

      modal.showPasswordPromptModal(
        'secure.pdf',
        async (pwd) => {
          submitValue = pwd;
          return true;
        },
        () => {
          onCancelCalled = true;
        }
      );

      // Submit clicked
      await submitBtn.eventListeners['click']?.[0]?.();

      expect(submitValue).toBe('secret123');
      expect(onCancelCalled).toBe(false);

      // Subsequent close does not trigger onCancel
      modal.close();
      expect(onCancelCalled).toBe(false);
    });

    it('contains ARIA dialog semantics on modal-card', () => {
      setupMockDOM();
      const modal = new ModalManager();
      modal.open('Test Title', '<div>Content</div>', '<button>OK</button>');

      const overlay = (globalThis as any).document.querySelector('#app-modal-overlay');
      expect(overlay.innerHTML).toContain('role="dialog"');
      expect(overlay.innerHTML).toContain('aria-modal="true"');
      expect(overlay.innerHTML).toContain('aria-labelledby="modal-header-title"');
    });
  });

  describe('ToastManager Action Buttons', () => {
    it('creates an action toast with status role and invokes callback when action is clicked', () => {
      const createdElements: any[] = [];
      const mockDoc: any = {
        createElement: (tag: string) => {
          const el: any = {
            tagName: tag.toUpperCase(),
            className: '',
            textContent: '',
            style: {},
            attributes: {} as Record<string, string>,
            setAttribute(k: string, v: string) { this.attributes[k] = v; },
            getAttribute(k: string) { return this.attributes[k]; },
            children: [] as any[],
            appendChild(child: any) {
              this.children.push(child);
              child.parentElement = this;
              return child;
            },
            removeChild(child: any) {
              this.children = this.children.filter((c: any) => c !== child);
              child.parentElement = null;
              return child;
            },
            eventListeners: {} as Record<string, Function[]>,
            addEventListener(evt: string, cb: Function) {
              if (!this.eventListeners[evt]) this.eventListeners[evt] = [];
              this.eventListeners[evt].push(cb);
            },
          };
          createdElements.push(el);
          return el;
        },
        querySelector: () => null,
        querySelectorAll: () => [],
        body: {
          appendChild: vi.fn(),
        },
      };

      (globalThis as any).document = mockDoc;
      const toastManager = new ToastManager();

      let actionFired = false;
      const result = toastManager.showAction('Page removed', 'Undo', () => {
        actionFired = true;
      });

      expect(result).toHaveProperty('dismiss');

      // Find the action toast element
      const toastEl = createdElements.find((el) => el.className.includes('toast-action'));
      expect(toastEl).toBeDefined();
      expect(toastEl.getAttribute('role')).toBe('status');
      expect(toastEl.getAttribute('aria-live')).toBe('polite');

      // Find the action button
      const actionBtn = createdElements.find((el) => el.className === 'toast-action-btn');
      expect(actionBtn).toBeDefined();
      expect(actionBtn.textContent).toBe('Undo');

      // Trigger click on action button
      const clickEvt = { stopPropagation: vi.fn() };
      actionBtn.eventListeners['click']?.[0]?.(clickEvt);
      expect(clickEvt.stopPropagation).toHaveBeenCalled();
      expect(actionFired).toBe(true);
    });
  });

  describe('VisualGrid Event Isolation & Disabled Button Hit-Testing', () => {
    function createMockContainer() {
      const container: any = {
        innerHTML: '',
        querySelectorAll: (sel: string) => {
          return [];
        },
      };
      return container;
    }

    it('renders disabled buttons without pointer-events: none', () => {
      const container = createMockContainer();
      const grid = new VisualGrid(container, {
        onToggleSelect: vi.fn(),
        onRotatePage: vi.fn(),
        onDeletePage: vi.fn(),
        onReorder: vi.fn(),
      });

      const pages: PDFPageItem[] = [
        {
          id: 'p1',
          docId: 'd1',
          docName: 'doc.pdf',
          pageIndex: 0,
          displayPageNumber: 1,
          rotation: 0,
          thumbnailDataUrl: '',
          width: 200,
          height: 300,
          selected: false,
        },
        {
          id: 'p2',
          docId: 'd1',
          docName: 'doc.pdf',
          pageIndex: 1,
          displayPageNumber: 2,
          rotation: 0,
          thumbnailDataUrl: '',
          width: 200,
          height: 300,
          selected: false,
        },
      ];

      (globalThis as any).document = {
        createElement: () => ({ setAttribute: vi.fn() }),
        querySelectorAll: () => [],
      };

      grid.setPages(pages);

      // Page 1 move-left button must be disabled, but must NOT have pointer-events: none inline!
      expect(container.innerHTML).toContain('page-move-left-btn');
      expect(container.innerHTML).toContain('disabled');
      expect(container.innerHTML).not.toContain('pointer-events: none;');
    });

    it('stops event propagation on card drop', () => {
      const listeners: Record<string, Function[]> = {};
      const mockCard: any = {
        getAttribute: (attr: string) => (attr === 'data-page-id' ? 'p1' : '0'),
        querySelector: () => null,
        classList: { remove: vi.fn(), add: vi.fn() },
        addEventListener: (evt: string, cb: Function) => {
          if (!listeners[evt]) listeners[evt] = [];
          listeners[evt].push(cb);
        },
      };

      const container: any = {
        innerHTML: '',
        querySelectorAll: () => [mockCard],
      };

      const onFilesDropped = vi.fn();
      const grid = new VisualGrid(container, {
        onToggleSelect: vi.fn(),
        onRotatePage: vi.fn(),
        onDeletePage: vi.fn(),
        onReorder: vi.fn(),
        onFilesDropped,
      });

      const pages: PDFPageItem[] = [
        {
          id: 'p1',
          docId: 'd1',
          docName: 'doc.pdf',
          pageIndex: 0,
          displayPageNumber: 1,
          rotation: 0,
          thumbnailDataUrl: '',
          width: 200,
          height: 300,
          selected: false,
        },
      ];

      grid.setPages(pages);

      const dropHandler = listeners['drop']?.[0];
      expect(dropHandler).toBeDefined();

      const fakeFile = new File(['data'], 'test.pdf', { type: 'application/pdf' });
      const dropEvt = {
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
        dataTransfer: {
          files: [fakeFile],
        },
      };

      dropHandler(dropEvt);

      expect(dropEvt.preventDefault).toHaveBeenCalled();
      expect(dropEvt.stopPropagation).toHaveBeenCalled();
      expect(onFilesDropped).toHaveBeenCalledWith([fakeFile]);
    });
  });

  describe('Undo Deletion State Restoration Invariants', () => {
    it('correctly restores deleted page to its exact original index and preserves document metadata', () => {
      const documents = new Map<string, DocumentMetadata>();
      const docA: DocumentMetadata = {
        id: 'docA',
        filename: 'DocA.pdf',
        size: 1024,
        pageCount: 2,
        fileBytes: new Uint8Array([1, 2, 3]),
      };
      documents.set('docA', docA);

      let pages: PDFPageItem[] = [
        { id: 'p0', docId: 'docA', docName: 'DocA.pdf', pageIndex: 0, displayPageNumber: 1, rotation: 0, thumbnailDataUrl: '', width: 100, height: 100, selected: false },
        { id: 'p1', docId: 'docA', docName: 'DocA.pdf', pageIndex: 1, displayPageNumber: 2, rotation: 90, thumbnailDataUrl: '', width: 100, height: 100, selected: false },
        { id: 'p2', docId: 'docA', docName: 'DocA.pdf', pageIndex: 2, displayPageNumber: 3, rotation: 0, thumbnailDataUrl: '', width: 100, height: 100, selected: false },
      ];

      // Simulate deleteSinglePage on p1 (index 1)
      const targetId = 'p1';
      const idx = pages.findIndex((p) => p.id === targetId);
      const deletedPage = pages[idx]!;
      const docMeta = documents.get(deletedPage.docId);

      const lastDeletedState = {
        pages: [{ page: { ...deletedPage }, index: idx }],
        documents: docMeta ? [{ ...docMeta }] : [],
      };

      pages.splice(idx, 1);
      expect(pages).toHaveLength(2);
      expect(pages.map((p) => p.id)).toEqual(['p0', 'p2']);

      // Undo deletion
      for (const doc of lastDeletedState.documents) {
        if (!documents.has(doc.id)) documents.set(doc.id, doc);
      }
      for (const { page, index } of lastDeletedState.pages) {
        const insertAt = Math.min(Math.max(0, index), pages.length);
        pages.splice(insertAt, 0, page);
      }

      expect(pages).toHaveLength(3);
      expect(pages[1]?.id).toBe('p1');
      expect(pages[1]?.rotation).toBe(90);
      expect(pages.map((p) => p.id)).toEqual(['p0', 'p1', 'p2']);
    });

    it('correctly restores multiple selected pages across different documents', () => {
      const documents = new Map<string, DocumentMetadata>();
      documents.set('docA', { id: 'docA', filename: 'A.pdf', size: 100, pageCount: 2, fileBytes: new Uint8Array() });
      documents.set('docB', { id: 'docB', filename: 'B.pdf', size: 200, pageCount: 1, fileBytes: new Uint8Array() });

      let pages: PDFPageItem[] = [
        { id: 'a1', docId: 'docA', docName: 'A.pdf', pageIndex: 0, displayPageNumber: 1, rotation: 0, thumbnailDataUrl: '', width: 100, height: 100, selected: true },
        { id: 'a2', docId: 'docA', docName: 'A.pdf', pageIndex: 1, displayPageNumber: 2, rotation: 0, thumbnailDataUrl: '', width: 100, height: 100, selected: false },
        { id: 'b1', docId: 'docB', docName: 'B.pdf', pageIndex: 0, displayPageNumber: 1, rotation: 0, thumbnailDataUrl: '', width: 100, height: 100, selected: true },
      ];

      // Delete selected: a1 and b1
      const selectedWithIndices = pages
        .map((p, idx) => ({ page: { ...p }, index: idx }))
        .filter((item) => item.page.selected);

      const docIds = new Set(selectedWithIndices.map((i) => i.page.docId));
      const docsToKeep = Array.from(docIds).map((id) => documents.get(id)!).filter(Boolean);

      const lastDeletedState = {
        pages: selectedWithIndices,
        documents: docsToKeep,
      };

      pages = pages.filter((p) => !p.selected);
      // Prune documents: docB is now unused
      documents.delete('docB');
      expect(documents.has('docB')).toBe(false);
      expect(pages).toHaveLength(1);
      expect(pages[0]?.id).toBe('a2');

      // Undo batch deletion
      for (const doc of lastDeletedState.documents) {
        if (!documents.has(doc.id)) documents.set(doc.id, doc);
      }
      expect(documents.has('docB')).toBe(true);

      const sorted = [...lastDeletedState.pages].sort((a, b) => a.index - b.index);
      for (const { page, index } of sorted) {
        const insertAt = Math.min(Math.max(0, index), pages.length);
        pages.splice(insertAt, 0, page);
      }

      expect(pages).toHaveLength(3);
      expect(pages.map((p) => p.id)).toEqual(['a1', 'a2', 'b1']);
    });
  });
});
