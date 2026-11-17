import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MenuBar } from '../src/components/MenuBar';
import { StatusBar } from '../src/components/StatusBar';
import { CockpitCanvas } from '../src/components/CockpitCanvas';
import { platformBridge, isTauriEnvironment } from '../src/core/tauri-bridge';

vi.mock('lucide', async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    createIcons: vi.fn(),
  };
});

function createMockDom() {
  const elements = new Map<string, any>();
  const windowListeners: Record<string, Function[]> = {};

  const mockWindow: any = {
    addEventListener: (evt: string, cb: Function) => {
      if (!windowListeners[evt]) windowListeners[evt] = [];
      windowListeners[evt].push(cb);
    },
    removeEventListener: (evt: string, cb: Function) => {
      if (windowListeners[evt]) {
        windowListeners[evt] = windowListeners[evt].filter((fn) => fn !== cb);
      }
    },
    dispatchEvent: (evt: any) => {
      const list = windowListeners[evt.type || 'keydown'] || [];
      list.forEach((fn) => fn(evt));
      return true;
    },
    triggerKeydown: (keyProps: any) => {
      const list = windowListeners['keydown'] || [];
      const evt = {
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
        ctrlKey: false,
        metaKey: false,
        shiftKey: false,
        ...keyProps,
      };
      list.forEach((fn) => fn(evt));
      return evt;
    },
  };

  const createMockElement = (tag = 'div') => {
    const classSet = new Set<string>();
    const attributes = new Map<string, string>();
    const listeners: Record<string, Function[]> = {};

    const el: any = {
      tagName: tag.toUpperCase(),
      id: '',
      value: '',
      min: '',
      max: '',
      step: '',
      style: {} as Record<string, string>,
      disabled: false,
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
      getAttribute: (name: string) => attributes.get(name) || (name in el ? String(el[name]) : null),
      setAttribute: (name: string, val: string) => {
        attributes.set(name, val);
        if (name === 'id') el.id = val;
        if (name === 'value') el.value = val;
        if (name === 'min') el.min = val;
        if (name === 'max') el.max = val;
      },
      removeAttribute: (name: string) => attributes.delete(name),
      _innerHTML: '',
      get innerHTML() {
        return this._innerHTML;
      },
      set innerHTML(val: string) {
        this._innerHTML = val;
        this.children = [];

        // Parse HTML tags with attributes
        const tagRegex = /<([a-zA-Z0-9-]+)([^>]*)>/g;
        let match;
        while ((match = tagRegex.exec(val)) !== null) {
          const tagName = match[1];
          const attrStr = match[2];
          const childEl = createMockElement(tagName);

          // Parse attributes
          const attrRegex = /([a-zA-Z0-9_-]+)(?:=["']([^"']*)["'])?/g;
          let aMatch;
          while ((aMatch = attrRegex.exec(attrStr)) !== null) {
            const aName = aMatch[1];
            const aVal = aMatch[2] !== undefined ? aMatch[2] : '';
            if (aName === 'class') {
              aVal.split(/\s+/).forEach((cls) => {
                if (cls) childEl.classList.add(cls);
              });
            } else if (aName === 'id') {
              childEl.id = aVal;
              elements.set(`#${aVal}`, childEl);
            } else {
              childEl.setAttribute(aName, aVal);
            }
          }
          this.appendChild(childEl);
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
      contains(target: any) {
        if (target === this) return true;
        for (const c of this.children) {
          if (c.contains && c.contains(target)) return true;
        }
        return false;
      },
      matches(sel: string) {
        if (sel.startsWith('#')) return this.id === sel.slice(1);
        if (sel.startsWith('.')) return this.classList.contains(sel.slice(1));
        const attrExactMatch = sel.match(/^\[([a-zA-Z0-9_-]+)="([^"]*)"\]$/);
        if (attrExactMatch) {
          return attributes.get(attrExactMatch[1]) === attrExactMatch[2];
        }
        const attrExistMatch = sel.match(/^\[([a-zA-Z0-9_-]+)\]$/);
        if (attrExistMatch) {
          return attributes.has(attrExistMatch[1]);
        }
        return this.tagName.toLowerCase() === sel.toLowerCase();
      },
      querySelector(sel: string) {
        if (this.matches(sel)) return this;
        for (const c of this.children) {
          if (c.matches && c.matches(sel)) return c;
          const found = c.querySelector?.(sel);
          if (found) return found;
        }
        return elements.get(sel) || null;
      },
      querySelectorAll(sel: string) {
        const results: any[] = [];
        if (this.matches(sel)) results.push(this);
        const search = (node: any) => {
          for (const c of node.children) {
            if (c.matches && c.matches(sel)) results.push(c);
            search(c);
          }
        };
        search(this);
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
    activeElement: null,
  };

  return { mockDoc, mockWindow, createMockElement };
}

describe('Desktop Studio Architecture & Tauri Integration', () => {
  let originalDocument: any;
  let originalWindow: any;
  let currentMockWindow: any;

  beforeEach(() => {
    originalDocument = (globalThis as any).document;
    originalWindow = (globalThis as any).window;
    const { mockDoc, mockWindow } = createMockDom();
    (globalThis as any).document = mockDoc;
    (globalThis as any).window = mockWindow;
    currentMockWindow = mockWindow;
  });

  afterEach(() => {
    (globalThis as any).document = originalDocument;
    (globalThis as any).window = originalWindow;
    vi.restoreAllMocks();
  });

  describe('1. MenuBar (Native-Grade Desktop Menu)', () => {
    it('initializes with default state, renders brand badge and root menus', () => {
      const container = (globalThis as any).document.createElement('div');
      const callbacks = {
        onOpenFile: vi.fn(),
        onAddFiles: vi.fn(),
        onSaveFile: vi.fn(),
        onClearWorkspace: vi.fn(),
        onUndo: vi.fn(),
        onSelectAll: vi.fn(),
        onDeselectAll: vi.fn(),
        onInvertSelection: vi.fn(),
        onDeleteSelected: vi.fn(),
        onRotateSelected: vi.fn(),
        onDuplicatePage: vi.fn(),
        onSetViewMode: vi.fn(),
        onZoomIn: vi.fn(),
        onZoomOut: vi.fn(),
        onResetZoom: vi.fn(),
        onFitWidth: vi.fn(),
        onOpenTool: vi.fn(),
        onOpenHelpModal: vi.fn(),
        onOpenAboutModal: vi.fn(),
        onToggleLanguage: vi.fn(),
      };

      const menuBar = new MenuBar(container, callbacks);
      expect(container.innerHTML).toContain('menubar-wrapper');
      expect(container.innerHTML).toContain('meCraft');
      expect(container.innerHTML).toContain('STUDIO');

      // Test updating state to active document
      menuBar.updateState({
        hasDocument: true,
        canUndo: true,
        viewMode: 'cockpit',
        selectedCount: 2,
        totalPageCount: 10,
      });

      expect(container.innerHTML).toContain('menubar-wrapper');
    });

    it('toggles language callback from menu tail action', () => {
      const container = (globalThis as any).document.createElement('div');
      const callbacks = {
        onOpenFile: vi.fn(),
        onAddFiles: vi.fn(),
        onSaveFile: vi.fn(),
        onExportAs: vi.fn(),
        onClearWorkspace: vi.fn(),
        onUndo: vi.fn(),
        onSelectAll: vi.fn(),
        onDeselectAll: vi.fn(),
        onInvertSelection: vi.fn(),
        onDeleteSelected: vi.fn(),
        onRotateSelected: vi.fn(),
        onDuplicatePage: vi.fn(),
        onSetViewMode: vi.fn(),
        onZoomIn: vi.fn(),
        onZoomOut: vi.fn(),
        onResetZoom: vi.fn(),
        onFitWidth: vi.fn(),
        onOpenTool: vi.fn(),
        onOpenHelpModal: vi.fn(),
        onOpenAboutModal: vi.fn(),
        onToggleLanguage: vi.fn(),
      };

      new MenuBar(container, callbacks);
      const langBtn = container.querySelector('#menubar-lang-btn');
      langBtn?.click();
      expect(callbacks.onToggleLanguage).toHaveBeenCalled();
    });

    it('triggers onExportAs callback when Export As is clicked', () => {
      const container = (globalThis as any).document.createElement('div');
      const callbacks = {
        onOpenFile: vi.fn(),
        onAddFiles: vi.fn(),
        onSaveFile: vi.fn(),
        onExportAs: vi.fn(),
        onClearWorkspace: vi.fn(),
        onUndo: vi.fn(),
        onSelectAll: vi.fn(),
        onDeselectAll: vi.fn(),
        onInvertSelection: vi.fn(),
        onDeleteSelected: vi.fn(),
        onRotateSelected: vi.fn(),
        onDuplicatePage: vi.fn(),
        onSetViewMode: vi.fn(),
        onZoomIn: vi.fn(),
        onZoomOut: vi.fn(),
        onResetZoom: vi.fn(),
        onFitWidth: vi.fn(),
        onOpenTool: vi.fn(),
        onOpenHelpModal: vi.fn(),
        onOpenAboutModal: vi.fn(),
        onToggleLanguage: vi.fn(),
      };

      const menuBar = new MenuBar(container, callbacks);
      menuBar.updateState({ hasDocument: true });

      // Click File menu root to open panel
      const fileBtn = container.querySelector('[data-menu="file"]');
      fileBtn?.click();

      // Click export-as item
      const exportItem = container.querySelector('[data-action="export-as"]');
      exportItem?.click();
      expect(callbacks.onExportAs).toHaveBeenCalled();
    });

    it('handles Delete/Del key shortcut to delete selected pages', () => {
      const container = (globalThis as any).document.createElement('div');
      const callbacks = {
        onOpenFile: vi.fn(),
        onAddFiles: vi.fn(),
        onSaveFile: vi.fn(),
        onExportAs: vi.fn(),
        onClearWorkspace: vi.fn(),
        onUndo: vi.fn(),
        onSelectAll: vi.fn(),
        onDeselectAll: vi.fn(),
        onInvertSelection: vi.fn(),
        onDeleteSelected: vi.fn(),
        onRotateSelected: vi.fn(),
        onDuplicatePage: vi.fn(),
        onSetViewMode: vi.fn(),
        onZoomIn: vi.fn(),
        onZoomOut: vi.fn(),
        onResetZoom: vi.fn(),
        onFitWidth: vi.fn(),
        onOpenTool: vi.fn(),
        onOpenHelpModal: vi.fn(),
        onOpenAboutModal: vi.fn(),
        onToggleLanguage: vi.fn(),
      };

      const menuBar = new MenuBar(container, callbacks);
      menuBar.updateState({ hasDocument: true, selectedCount: 1 });

      // Dispatch Delete key
      currentMockWindow.triggerKeydown({ key: 'Delete' });
      expect(callbacks.onDeleteSelected).toHaveBeenCalled();

      // Dispatch Del key
      currentMockWindow.triggerKeydown({ key: 'Del' });
      expect(callbacks.onDeleteSelected).toHaveBeenCalledTimes(2);
    });
  });

  describe('2. StatusBar (Bottom Telemetry & Controls)', () => {
    it('renders telemetry metrics and updates zoom state', () => {
      const container = (globalThis as any).document.createElement('div');
      const callbacks = {
        onZoomChange: vi.fn(),
        onFitWidth: vi.fn(),
        onFitPage: vi.fn(),
      };

      const statusBar = new StatusBar(container, callbacks);
      expect(container.innerHTML).toContain('app-status-bar');
      expect(container.innerHTML).toContain('RAM:');

      // Update state with active document info
      statusBar.updateState({
        currentPage: 3,
        totalPageCount: 12,
        pageSizeLabel: 'A4 595 × 842 pt',
        selectedCount: 2,
        isEncrypted: true,
        workerState: 'ready',
        zoom: 1.25,
      });

      expect(container.innerHTML).toContain('A4 595 × 842 pt');

      // Test zoom controls
      const zoomInBtn = container.querySelector('#status-zoom-in-btn');
      zoomInBtn?.click();
      expect(callbacks.onZoomChange).toHaveBeenCalled();

      const zoomOutBtn = container.querySelector('#status-zoom-out-btn');
      zoomOutBtn?.click();
      expect(callbacks.onZoomChange).toHaveBeenCalled();

      // Test fit-width control
      const fitWidthBtn = container.querySelector('#status-fit-width-btn');
      fitWidthBtn?.click();
      expect(callbacks.onFitWidth).toHaveBeenCalled();

      // Test fit-page control
      const fitPageBtn = container.querySelector('#status-fit-page-btn');
      fitPageBtn?.click();
      expect(callbacks.onFitPage).toHaveBeenCalled();

      // Test zoom slider supports up to 400%
      statusBar.setZoom(4.0);
      const slider = container.querySelector<HTMLInputElement>('#status-zoom-slider');
      expect(slider?.max).toBe('400');
      expect(slider?.value).toBe('400');

      statusBar.destroy();
    });
  });

  describe('3. Unified Platform Bridge (Tauri vs Browser)', () => {
    it('accurately identifies web environment when Tauri is absent', () => {
      expect(isTauriEnvironment()).toBe(false);
      expect(platformBridge.isTauri).toBe(false);
    });

    it('sets window title gracefully on web', async () => {
      await platformBridge.setWindowTitle('Test Title — meCraft Studio');
      expect((globalThis as any).document.title).toBe('Test Title — meCraft Studio');
    });

    it('provides safe web fallbacks for native filesystem and cli methods', async () => {
      // In web environment, writeNativeFile gracefully returns false
      const writeResult = await platformBridge.writeNativeFile('test.pdf', new Uint8Array([1, 2, 3]));
      expect(writeResult).toBe(false);

      // In web environment, readFileFromPath returns null
      const readResult = await platformBridge.readFileFromPath('test.pdf');
      expect(readResult).toBeNull();

      // In web environment, getInitialPdfPath returns null
      const cliPath = await platformBridge.getInitialPdfPath();
      expect(cliPath).toBeNull();
    });
  });

  describe('4. CockpitCanvas (Pan, Zoom, & Viewport Fitting)', () => {
    it('supports zoom level up to 4.0 (400%) and resets correctly', () => {
      const container = (globalThis as any).document.createElement('div');
      const events = {
        maxZoom: 4.0,
        onPrevPage: vi.fn(),
        onNextPage: vi.fn(),
        onRotateActive: vi.fn(),
        onZoomChange: vi.fn(),
      };

      const canvas = new CockpitCanvas(container, events);
      expect(canvas.getZoom()).toBe(1.0);

      // Zoom up to 4.0
      canvas.setZoom(4.0);
      expect(canvas.getZoom()).toBe(4.0);
      expect(events.onZoomChange).toHaveBeenCalledWith(4.0);

      // Clamp above 4.0
      canvas.setZoom(5.5);
      expect(canvas.getZoom()).toBe(4.0);

      // Fit page resets zoom to 1.0
      canvas.fitPage();
      expect(canvas.getZoom()).toBe(1.0);

      // Reset pan resets offset
      canvas.resetPan();
      expect(canvas.getZoom()).toBe(1.0);
    });

    it('renders empty state startup workbench when no active page is provided', () => {
      const container = (globalThis as any).document.createElement('div');
      const events = {
        onPrevPage: vi.fn(),
        onNextPage: vi.fn(),
        onRotateActive: vi.fn(),
        onOpenFile: vi.fn(),
      };

      const canvas = new CockpitCanvas(container, events);
      canvas.setActivePage(null, 0, 0);

      expect(container.innerHTML).toContain('cockpit-startup-workbench');
      expect(container.innerHTML).toContain('meCraft Studio Desktop');
      expect(container.innerHTML).toContain('workbench-dropzone');

      // Click open file button in startup workbench
      const openBtn = container.querySelector('#workbench-btn-open');
      openBtn?.click();
      expect(events.onOpenFile).toHaveBeenCalled();
    });
  });
});
