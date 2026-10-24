import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CockpitFilmstrip } from '../src/components/CockpitFilmstrip';
import { CockpitCanvas } from '../src/components/CockpitCanvas';
import { CockpitInspector } from '../src/components/CockpitInspector';
import type { PDFPageItem } from '../src/core/types';

vi.mock('lucide', async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    createIcons: vi.fn(),
  };
});

function createMockDom() {
  const elements = new Map<string, any>();

  const createMockElement = (tag = 'div') => {
    const classSet = new Set<string>();
    const attributes = new Map<string, string>();
    const listeners: Record<string, Function[]> = {};

    const el: any = {
      tagName: tag.toUpperCase(),
      id: '',
      style: {} as Record<string, string>,
      classList: {
        add: (...names: string[]) => names.forEach((n) => classSet.add(n)),
        remove: (...names: string[]) => names.forEach((n) => classSet.delete(n)),
        toggle: (name: string, force?: boolean) => {
          if (force !== undefined) {
            if (force) classSet.add(name);
            else classSet.delete(name);
            return force;
          }
          if (classSet.has(name)) {
            classSet.delete(name);
            return false;
          }
          classSet.add(name);
          return true;
        },
        contains: (name: string) => classSet.has(name),
      },
      getAttribute: (name: string) => attributes.get(name) || null,
      setAttribute: (name: string, val: string) => attributes.set(name, val),
      removeAttribute: (name: string) => attributes.delete(name),
      _innerHTML: '',
      get innerHTML() {
        return this._innerHTML;
      },
      set innerHTML(val: string) {
        this._innerHTML = val;
        // Parse IDs from innerHTML
        const idMatches = val.matchAll(/id=["']([^"']+)["']/g);
        for (const m of idMatches) {
          const id = m[1];
          if (id && !elements.has(`#${id}`)) {
            const childEl = createMockElement('div');
            childEl.id = id;
            elements.set(`#${id}`, childEl);
            this.appendChild(childEl);
          }
        }
        // Parse classes from innerHTML
        const classMatches = val.matchAll(/class=["']([^"']+)["']/g);
        for (const cm of classMatches) {
          const classStr = cm[1];
          if (classStr) {
            classStr.split(/\s+/).forEach((cls) => {
              if (cls && !elements.has(`.${cls}`)) {
                const childEl = createMockElement('div');
                childEl.classList.add(cls);
                elements.set(`.${cls}`, childEl);
                this.appendChild(childEl);
              }
            });
          }
        }
      },
      textContent: '',
      children: [] as any[],
      parentElement: null as any,
      appendChild(child: any) {
        this.children.push(child);
        child.parentElement = this;
        return child;
      },
      querySelector(sel: string) {
        if (sel.startsWith('#')) {
          const targetId = sel.slice(1);
          if (this.id === targetId) return this;
          if (elements.has(sel)) return elements.get(sel);
          for (const c of this.children) {
            const found = c.querySelector(sel);
            if (found) return found;
          }
        }
        if (sel.startsWith('.')) {
          const targetCls = sel.slice(1);
          if (this.classList.contains(targetCls)) return this;
          if (elements.has(sel)) return elements.get(sel);
          for (const c of this.children) {
            const found = c.querySelector(sel);
            if (found) return found;
          }
        }
        return elements.get(sel) || null;
      },
      querySelectorAll(sel: string) {
        const results: any[] = [];
        if (sel.startsWith('.')) {
          const cls = sel.slice(1);
          if (this.classList.contains(cls)) results.push(this);
          for (const c of this.children) {
            if (c.classList && c.classList.contains(cls)) results.push(c);
          }
        }
        return results;
      },
      addEventListener: (evt: string, cb: Function) => {
        if (!listeners[evt]) listeners[evt] = [];
        listeners[evt].push(cb);
      },
      removeEventListener: (evt: string, cb: Function) => {
        if (listeners[evt]) {
          listeners[evt] = listeners[evt].filter((fn) => fn !== cb);
        }
      },
      click() {
        if (listeners['click']) {
          listeners['click'].forEach((fn) => fn({ target: this, stopPropagation: vi.fn(), preventDefault: vi.fn() }));
        }
      },
    };
    return el;
  };

  const mockBody = createMockElement('body');
  const mockDoc: any = {
    body: mockBody,
    createElement: (tag: string) => createMockElement(tag),
    querySelector: (sel: string) => elements.get(sel) || mockBody.querySelector(sel),
    querySelectorAll: (sel: string) => mockBody.querySelectorAll(sel),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };

  return { mockDoc, createMockElement };
}

describe('BMW Neue Klasse 3-Pane Studio Cockpit Architecture', () => {
  let samplePages: PDFPageItem[];
  let originalDocument: any;

  beforeEach(() => {
    originalDocument = (globalThis as any).document;
    const { mockDoc } = createMockDom();
    (globalThis as any).document = mockDoc;

    samplePages = [
      {
        id: 'p1',
        docId: 'doc1',
        docName: 'TestDoc.pdf',
        pageIndex: 0,
        displayPageNumber: 1,
        rotation: 0,
        thumbnailDataUrl: 'data:image/png;base64,fake1',
        width: 595,
        height: 842,
        selected: false,
      },
      {
        id: 'p2',
        docId: 'doc1',
        docName: 'TestDoc.pdf',
        pageIndex: 1,
        displayPageNumber: 2,
        rotation: 90,
        thumbnailDataUrl: 'data:image/png;base64,fake2',
        width: 595,
        height: 842,
        selected: true,
      },
    ];
  });

  afterEach(() => {
    (globalThis as any).document = originalDocument;
    vi.restoreAllMocks();
  });

  describe('1. CockpitFilmstrip (Left Filmstrip Rail)', () => {
    it('initializes pages, default active page, and selection states', () => {
      const container = (globalThis as any).document.createElement('div');

      const events = {
        onSelectPage: vi.fn(),
        onToggleSelect: vi.fn(),
        onRotatePage: vi.fn(),
        onDeletePage: vi.fn(),
        onReorder: vi.fn(),
        onSelectAll: vi.fn(),
        onDeselectAll: vi.fn(),
        onRotateSelected: vi.fn(),
        onDeleteSelected: vi.fn(),
      };

      const filmstrip = new CockpitFilmstrip(container, events);
      filmstrip.setPages(samplePages);

      expect(filmstrip.getActivePageId()).toBe('p1');

      // Test activating another page
      filmstrip.setActivePageId('p2');
      expect(filmstrip.getActivePageId()).toBe('p2');

      // Test header actions
      const selectAllBtn = container.querySelector('#filmstrip-btn-select-all');
      selectAllBtn?.click();
      expect(events.onSelectAll).toHaveBeenCalled();

      const rotateSelBtn = container.querySelector('#filmstrip-btn-rotate-sel');
      rotateSelBtn?.click();
      expect(events.onRotateSelected).toHaveBeenCalledWith(90);

      const deleteSelBtn = container.querySelector('#filmstrip-btn-delete-sel');
      deleteSelBtn?.click();
      expect(events.onDeleteSelected).toHaveBeenCalled();
    });
  });

  describe('2. CockpitCanvas (Center Live Canvas Stage)', () => {
    it('manages active page, telemetry, and zoom clamping', () => {
      const container = (globalThis as any).document.createElement('div');

      const events = {
        onPrevPage: vi.fn(),
        onNextPage: vi.fn(),
        onRotateActive: vi.fn(),
        onZoomChange: vi.fn(),
      };

      const canvas = new CockpitCanvas(container, events);
      canvas.setActivePage(samplePages[0], 0, 2);

      // Verify zoom clamping [0.25, 3.0]
      canvas.setZoom(1.5);
      expect(canvas.getZoom()).toBe(1.5);
      expect(events.onZoomChange).toHaveBeenCalledWith(1.5);

      canvas.setZoom(4.0); // clamped to 3.0
      expect(canvas.getZoom()).toBe(3.0);

      canvas.setZoom(0.1); // clamped to 0.25
      expect(canvas.getZoom()).toBe(0.25);

      // Verify navigation controls trigger callbacks
      container.querySelector('#canvas-btn-prev')?.click();
      expect(events.onPrevPage).toHaveBeenCalled();

      container.querySelector('#canvas-btn-next')?.click();
      expect(events.onNextPage).toHaveBeenCalled();

      container.querySelector('#canvas-btn-rotate')?.click();
      expect(events.onRotateActive).toHaveBeenCalledWith(90);
    });

    it('updates real-time watermark and page number preview states', () => {
      const container = (globalThis as any).document.createElement('div');

      const canvas = new CockpitCanvas(container, {
        onPrevPage: vi.fn(),
        onNextPage: vi.fn(),
        onRotateActive: vi.fn(),
      });
      canvas.setActivePage(samplePages[0], 0, 2);

      // Watermark preview updates
      canvas.setWatermarkPreview({
        enabled: true,
        text: 'STUDIO LUXURY COCKPIT',
        fontSize: 48,
        opacity: 0.3,
        color: '#1c69d4',
        rotation: 45,
        repeat: false,
      });

      const wmOverlay = container.querySelector('#canvas-overlay-watermark');
      expect(wmOverlay).not.toBeNull();
      expect(wmOverlay.style.display).toBe('flex');
      expect(wmOverlay.style.color).toBe('#1c69d4');

      // Page numbers preview updates
      canvas.setPageNumberPreview({
        enabled: true,
        format: '{n} / {total}',
        position: 'bottom-center',
        margin: 30,
        fontSize: 12,
        color: '#ffffff',
      });

      const numOverlay = container.querySelector('#canvas-overlay-numbers');
      expect(numOverlay).not.toBeNull();
      expect(numOverlay.style.display).toBe('block');
      expect(numOverlay.textContent).toBe('1 / 2');
    });
  });

  describe('3. CockpitInspector (Right Property Inspector Panel)', () => {
    it('manages tab routing and emits live preview updates', () => {
      const container = (globalThis as any).document.createElement('div');

      const events = {
        onTabChange: vi.fn(),
        onRotateSelected: vi.fn(),
        onRotateAll: vi.fn(),
        onDeleteSelected: vi.fn(),
        onDuplicateActive: vi.fn(),
        onOpenSplit: vi.fn(),
        onWatermarkPreviewChange: vi.fn(),
        onApplyWatermark: vi.fn(),
        onPageNumberPreviewChange: vi.fn(),
        onApplyPageNumbers: vi.fn(),
        onApplyCompress: vi.fn(),
        onApplyProtect: vi.fn(),
        onApplyMetadata: vi.fn(),
        onSanitizeMetadata: vi.fn(),
        onImagesToPdf: vi.fn(),
        onPdfToImages: vi.fn(),
        onExtractText: vi.fn(),
      };

      const inspector = new CockpitInspector(container, events);
      inspector.setState({ selectedCount: 1, totalPages: 2 });

      expect(inspector.getActiveTab()).toBe('tools');

      // Tab switch: Watermark
      inspector.setActiveTab('watermark');
      expect(inspector.getActiveTab()).toBe('watermark');
      expect(events.onWatermarkPreviewChange).toHaveBeenCalledWith(
        expect.objectContaining({ enabled: true, text: 'CONFIDENTIAL' })
      );

      // Tab switch: Numbers
      inspector.setActiveTab('numbers');
      expect(inspector.getActiveTab()).toBe('numbers');
      expect(events.onPageNumberPreviewChange).toHaveBeenCalledWith(
        expect.objectContaining({ enabled: true, position: 'bottom-center' })
      );

      // Collapse state toggle
      inspector.setCollapsed(true);
      expect(inspector.isPanelCollapsed()).toBe(true);
      expect(container.querySelector('#inspector-btn-expand')).not.toBeNull();

      inspector.setCollapsed(false);
      expect(inspector.isPanelCollapsed()).toBe(false);
    });

    it('handles action button triggers across inspector sections', () => {
      const container = (globalThis as any).document.createElement('div');

      const events = {
        onTabChange: vi.fn(),
        onRotateSelected: vi.fn(),
        onRotateAll: vi.fn(),
        onDeleteSelected: vi.fn(),
        onDuplicateActive: vi.fn(),
        onOpenSplit: vi.fn(),
        onWatermarkPreviewChange: vi.fn(),
        onApplyWatermark: vi.fn(),
        onPageNumberPreviewChange: vi.fn(),
        onApplyPageNumbers: vi.fn(),
        onApplyCompress: vi.fn(),
        onApplyProtect: vi.fn(),
        onApplyMetadata: vi.fn(),
        onSanitizeMetadata: vi.fn(),
        onImagesToPdf: vi.fn(),
        onPdfToImages: vi.fn(),
        onExtractText: vi.fn(),
      };

      const inspector = new CockpitInspector(container, events);
      inspector.setState({ selectedCount: 1, totalPages: 2 });

      // Duplicate active page button
      container.querySelector('#insp-btn-duplicate')?.click();
      expect(events.onDuplicateActive).toHaveBeenCalled();

      // Open split button
      container.querySelector('#insp-btn-split')?.click();
      expect(events.onOpenSplit).toHaveBeenCalled();

      // Watermark apply
      inspector.setActiveTab('watermark');
      container.querySelector('#insp-wm-apply-btn')?.click();
      expect(events.onApplyWatermark).toHaveBeenCalledWith(
        expect.objectContaining({ text: 'CONFIDENTIAL' })
      );

      // Numbers apply
      inspector.setActiveTab('numbers');
      container.querySelector('#insp-pn-apply-btn')?.click();
      expect(events.onApplyPageNumbers).toHaveBeenCalledWith(
        expect.objectContaining({ position: 'bottom-center' })
      );

      // Compress apply
      inspector.setActiveTab('compress');
      container.querySelector('#insp-comp-apply-btn')?.click();
      expect(events.onApplyCompress).toHaveBeenCalledWith(
        expect.objectContaining({ engine: 'lossless' })
      );
    });
  });
});
