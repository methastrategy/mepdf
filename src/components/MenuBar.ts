import {
  createIcons,
  FolderOpen,
  FilePlus,
  Save,
  Trash2,
  Undo2,
  CheckSquare,
  Square,
  RotateCw,
  Copy,
  Layers,
  LayoutGrid,
  ZoomIn,
  ZoomOut,
  Maximize2,
  FileText,
  Shield,
  Stamp,
  Hash,
  Scissors,
  Minimize2,
  Image,
  Tag,
  HelpCircle,
  Info,
  Globe,
  Sliders,
  Sparkles,
} from 'lucide';
import { getLanguage } from '../core/i18n';

export interface MenuBarState {
  hasDocument: boolean;
  canUndo: boolean;
  viewMode: 'cockpit' | 'grid';
  selectedCount: number;
  totalPageCount: number;
}

export interface MenuBarCallbacks {
  onOpenFile: () => void;
  onAddFiles: () => void;
  onSaveFile: () => void;
  onExportAs?: () => void;
  onClearWorkspace: () => void;
  onUndo: () => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onInvertSelection: () => void;
  onDeleteSelected: () => void;
  onRotateSelected: (deg: number) => void;
  onDuplicatePage: () => void;
  onSetViewMode: (mode: 'cockpit' | 'grid') => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetZoom: () => void;
  onFitWidth: () => void;
  onOpenTool: (tool: string) => void;
  onOpenPhotoStudio?: () => void;
  onEnhancePageImage?: () => void;
  onOpenHelpModal: () => void;
  onOpenAboutModal: () => void;
  onToggleLanguage: () => void;
}

export class MenuBar {
  private container: HTMLElement;
  private callbacks: MenuBarCallbacks;
  private state: MenuBarState = {
    hasDocument: false,
    canUndo: false,
    viewMode: 'cockpit',
    selectedCount: 0,
    totalPageCount: 0,
  };
  private openMenu: string | null = null;
  private isDocumentClickBound = false;

  constructor(container: HTMLElement, callbacks: MenuBarCallbacks) {
    this.container = container;
    this.callbacks = callbacks;
    this.render();
    this.bindGlobalKeyboardShortcuts();
  }

  public updateState(partial: Partial<MenuBarState>): void {
    this.state = { ...this.state, ...partial };
    this.render();
  }

  private closeAllMenus(): void {
    if (this.openMenu !== null) {
      this.openMenu = null;
      this.render();
    }
  }

  private bindGlobalKeyboardShortcuts(): void {
    if (typeof window === 'undefined') return;

    window.addEventListener('keydown', (e) => {
      // Don't intercept when modal, lightbox or progress overlay is open
      const isOverlayOpen = typeof document !== 'undefined' && Boolean(
        document.querySelector('#app-modal-overlay.open, #app-lightbox-overlay.open, .progress-overlay.visible')
      );
      if (isOverlayOpen) {
        if (e.key === 'Escape') {
          this.closeAllMenus();
        }
        return;
      }

      // Don't intercept when user is typing in form controls
      const activeTag = typeof document !== 'undefined' ? document.activeElement?.tagName.toLowerCase() : '';
      const isInput = activeTag === 'input' || activeTag === 'textarea';
      if (isInput) return;

      // Global shortcut handling
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'o') {
        e.preventDefault();
        this.callbacks.onOpenFile();
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (this.state.hasDocument) {
          this.callbacks.onSaveFile();
        }
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        this.callbacks.onSelectAll();
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        if (this.state.canUndo) {
          this.callbacks.onUndo();
        }
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'e') {
        e.preventDefault();
        if (this.state.hasDocument) {
          this.callbacks.onEnhancePageImage?.();
        }
        return;
      }

      if (e.key === 'Delete' || e.key === 'Del') {
        if (this.state.hasDocument) {
          e.preventDefault();
          this.callbacks.onDeleteSelected();
        }
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'r') {
        e.preventDefault();
        if (this.state.hasDocument) {
          this.callbacks.onRotateSelected(90);
        }
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        if (this.state.hasDocument) {
          this.callbacks.onDuplicatePage();
        }
        return;
      }

      if (e.key === 'F1') {
        e.preventDefault();
        this.callbacks.onSetViewMode('cockpit');
        return;
      }

      if (e.key === 'F2') {
        e.preventDefault();
        this.callbacks.onSetViewMode('grid');
        return;
      }

      if ((e.ctrlKey || e.metaKey) && (e.key === '=' || e.key === '+')) {
        e.preventDefault();
        this.callbacks.onZoomIn();
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key === '-') {
        e.preventDefault();
        this.callbacks.onZoomOut();
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key === '0') {
        e.preventDefault();
        this.callbacks.onResetZoom();
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key === '1') {
        e.preventDefault();
        this.callbacks.onFitWidth();
        return;
      }

      if (e.key === 'Escape') {
        if (this.openMenu !== null) {
          this.closeAllMenus();
        }
      }
    });

    if (typeof document !== 'undefined' && !this.isDocumentClickBound) {
      document.addEventListener('click', (e) => {
        if (!this.container.contains(e.target as Node)) {
          this.closeAllMenus();
        }
      });
      this.isDocumentClickBound = true;
    }
  }

  public render(): void {
    const lang = getLanguage();
    const hasDoc = this.state.hasDocument;
    const canUndo = this.state.canUndo;

    this.container.innerHTML = `
      <div class="menubar-wrapper" role="menubar" aria-label="Main Menu">
        <!-- Brand / Studio Tag -->
        <div class="menubar-brand" title="mePDF Studio Desktop">
          <span class="menubar-brand-badge">mePDF</span>
          <span class="menubar-studio-tag">STUDIO</span>
        </div>

        <!-- Menu Bar Root Items -->
        <div class="menubar-items-group">
          <!-- FILE MENU -->
          <div class="menubar-dropdown-wrapper ${this.openMenu === 'file' ? 'open' : ''}">
            <button class="menubar-root-btn ${this.openMenu === 'file' ? 'active' : ''}" data-menu="file" aria-haspopup="true">
              ${lang === 'th' ? 'ไฟล์ (File)' : 'File'}
            </button>
            <div class="menubar-menu-panel" role="menu">
              <button class="menubar-menu-item" data-action="open-file" role="menuitem">
                <i data-lucide="folder-open" class="menu-icon"></i>
                <span class="menu-label">${lang === 'th' ? 'เปิดเอกสาร...' : 'Open File...'}</span>
                <kbd class="menu-shortcut">Ctrl+O</kbd>
              </button>
              <button class="menubar-menu-item" data-action="add-files" role="menuitem">
                <i data-lucide="file-plus" class="menu-icon"></i>
                <span class="menu-label">${lang === 'th' ? 'เพิ่มไฟล์ต่อท้าย...' : 'Add Files...'}</span>
              </button>
              <div class="menubar-separator" role="separator"></div>
              <button class="menubar-menu-item ${!hasDoc ? 'disabled' : ''}" data-action="save-file" role="menuitem" ${!hasDoc ? 'disabled' : ''}>
                <i data-lucide="save" class="menu-icon"></i>
                <span class="menu-label">${lang === 'th' ? 'บันทึกเอกสาร' : 'Save Document'}</span>
                <kbd class="menu-shortcut">Ctrl+S</kbd>
              </button>
              <button class="menubar-menu-item ${!hasDoc ? 'disabled' : ''}" data-action="export-as" role="menuitem" ${!hasDoc ? 'disabled' : ''}>
                <i data-lucide="file-text" class="menu-icon"></i>
                <span class="menu-label">${lang === 'th' ? 'ส่งออกเป็นไฟล์ใหม่...' : 'Export As...'}</span>
              </button>
              <div class="menubar-separator" role="separator"></div>
              <button class="menubar-menu-item ${!hasDoc ? 'disabled' : ''} text-danger" data-action="clear-workspace" role="menuitem" ${!hasDoc ? 'disabled' : ''}>
                <i data-lucide="trash-2" class="menu-icon"></i>
                <span class="menu-label">${lang === 'th' ? 'ปิดและล้างพื้นที่ทำงาน' : 'Close Document'}</span>
              </button>
            </div>
          </div>

          <!-- EDIT MENU -->
          <div class="menubar-dropdown-wrapper ${this.openMenu === 'edit' ? 'open' : ''}">
            <button class="menubar-root-btn ${this.openMenu === 'edit' ? 'active' : ''}" data-menu="edit" aria-haspopup="true">
              ${lang === 'th' ? 'แก้ไข (Edit)' : 'Edit'}
            </button>
            <div class="menubar-menu-panel" role="menu">
              <button class="menubar-menu-item ${!canUndo ? 'disabled' : ''}" data-action="undo" role="menuitem" ${!canUndo ? 'disabled' : ''}>
                <i data-lucide="undo-2" class="menu-icon"></i>
                <span class="menu-label">${lang === 'th' ? 'เลิกทำ' : 'Undo'}</span>
                <kbd class="menu-shortcut">Ctrl+Z</kbd>
              </button>
              <div class="menubar-separator" role="separator"></div>
              <button class="menubar-menu-item ${!hasDoc ? 'disabled' : ''}" data-action="select-all" role="menuitem" ${!hasDoc ? 'disabled' : ''}>
                <i data-lucide="check-square" class="menu-icon"></i>
                <span class="menu-label">${lang === 'th' ? 'เลือกทุกหน้า' : 'Select All'}</span>
                <kbd class="menu-shortcut">Ctrl+A</kbd>
              </button>
              <button class="menubar-menu-item ${!hasDoc ? 'disabled' : ''}" data-action="deselect-all" role="menuitem" ${!hasDoc ? 'disabled' : ''}>
                <i data-lucide="square" class="menu-icon"></i>
                <span class="menu-label">${lang === 'th' ? 'ยกเลิกการเลือก' : 'Deselect All'}</span>
              </button>
              <button class="menubar-menu-item ${!hasDoc ? 'disabled' : ''}" data-action="invert-selection" role="menuitem" ${!hasDoc ? 'disabled' : ''}>
                <i data-lucide="sliders" class="menu-icon"></i>
                <span class="menu-label">${lang === 'th' ? 'สลับการเลือก' : 'Invert Selection'}</span>
              </button>
              <div class="menubar-separator" role="separator"></div>
              <button class="menubar-menu-item ${!hasDoc ? 'disabled' : ''}" data-action="rotate-90" role="menuitem" ${!hasDoc ? 'disabled' : ''}>
                <i data-lucide="rotate-cw" class="menu-icon"></i>
                <span class="menu-label">${lang === 'th' ? 'หมุน 90° ตามเข็ม' : 'Rotate 90° CW'}</span>
                <kbd class="menu-shortcut">Ctrl+R</kbd>
              </button>
              <button class="menubar-menu-item ${!hasDoc ? 'disabled' : ''}" data-action="duplicate-page" role="menuitem" ${!hasDoc ? 'disabled' : ''}>
                <i data-lucide="copy" class="menu-icon"></i>
                <span class="menu-label">${lang === 'th' ? 'คัดลอกหน้าที่เลือก' : 'Duplicate Page'}</span>
                <kbd class="menu-shortcut">Ctrl+D</kbd>
              </button>
              <button class="menubar-menu-item ${!hasDoc ? 'disabled' : ''}" data-action="enhance-page-image" role="menuitem" ${!hasDoc ? 'disabled' : ''}>
                <i data-lucide="sparkles" class="menu-icon"></i>
                <span class="menu-label">${lang === 'th' ? 'ปรับแต่งภาพหน้าเอกสาร (Enhance)' : 'Enhance Page Image'}</span>
                <kbd class="menu-shortcut">Ctrl+E</kbd>
              </button>
              <button class="menubar-menu-item ${!hasDoc ? 'disabled' : ''} text-danger" data-action="delete-selected" role="menuitem" ${!hasDoc ? 'disabled' : ''}>
                <i data-lucide="trash-2" class="menu-icon"></i>
                <span class="menu-label">${lang === 'th' ? 'ลบหน้าที่เลือก' : 'Delete Selected'}</span>
                <kbd class="menu-shortcut">Del</kbd>
              </button>
            </div>
          </div>

          <!-- VIEW MENU -->
          <div class="menubar-dropdown-wrapper ${this.openMenu === 'view' ? 'open' : ''}">
            <button class="menubar-root-btn ${this.openMenu === 'view' ? 'active' : ''}" data-menu="view" aria-haspopup="true">
              ${lang === 'th' ? 'มุมมอง (View)' : 'View'}
            </button>
            <div class="menubar-menu-panel" role="menu">
              <button class="menubar-menu-item ${this.state.viewMode === 'cockpit' ? 'checked' : ''}" data-action="view-cockpit" role="menuitem">
                <i data-lucide="layers" class="menu-icon"></i>
                <span class="menu-label">${lang === 'th' ? '3-Pane Studio Cockpit' : 'Studio Cockpit'}</span>
                <kbd class="menu-shortcut">F1</kbd>
              </button>
              <button class="menubar-menu-item ${this.state.viewMode === 'grid' ? 'checked' : ''}" data-action="view-grid" role="menuitem">
                <i data-lucide="layout-grid" class="menu-icon"></i>
                <span class="menu-label">${lang === 'th' ? 'Full Grid Macro Overview' : 'Macro Grid View'}</span>
                <kbd class="menu-shortcut">F2</kbd>
              </button>
              <div class="menubar-separator" role="separator"></div>
              <button class="menubar-menu-item" data-action="zoom-in" role="menuitem">
                <i data-lucide="zoom-in" class="menu-icon"></i>
                <span class="menu-label">${lang === 'th' ? 'ซูมเข้า' : 'Zoom In'}</span>
                <kbd class="menu-shortcut">Ctrl++</kbd>
              </button>
              <button class="menubar-menu-item" data-action="zoom-out" role="menuitem">
                <i data-lucide="zoom-out" class="menu-icon"></i>
                <span class="menu-label">${lang === 'th' ? 'ซูมออก' : 'Zoom Out'}</span>
                <kbd class="menu-shortcut">Ctrl+-</kbd>
              </button>
              <button class="menubar-menu-item" data-action="zoom-reset" role="menuitem">
                <i data-lucide="maximize-2" class="menu-icon"></i>
                <span class="menu-label">${lang === 'th' ? 'ขนาดจริง 100%' : 'Actual Size 100%'}</span>
                <kbd class="menu-shortcut">Ctrl+0</kbd>
              </button>
              <button class="menubar-menu-item" data-action="fit-width" role="menuitem">
                <i data-lucide="file-text" class="menu-icon"></i>
                <span class="menu-label">${lang === 'th' ? 'พอดีความกว้างหน้า' : 'Fit to Page'}</span>
                <kbd class="menu-shortcut">Ctrl+1</kbd>
              </button>
            </div>
          </div>

          <!-- TOOLS MENU -->
          <div class="menubar-dropdown-wrapper ${this.openMenu === 'tools' ? 'open' : ''}">
            <button class="menubar-root-btn ${this.openMenu === 'tools' ? 'active' : ''}" data-menu="tools" aria-haspopup="true">
              ${lang === 'th' ? 'เครื่องมือ (Tools)' : 'Tools'}
            </button>
            <div class="menubar-menu-panel" role="menu">
              <button class="menubar-menu-item" data-action="tool-photo-studio" role="menuitem">
                <i data-lucide="sparkles" class="menu-icon"></i>
                <span class="menu-label">${lang === 'th' ? '🎨 ห้องแต่งภาพ (Photo Studio)...' : '🎨 Photo Studio...'}</span>
              </button>
              <div class="menubar-separator" role="separator"></div>
              <button class="menubar-menu-item" data-action="tool-compress" role="menuitem">
                <i data-lucide="minimize-2" class="menu-icon"></i>
                <span class="menu-label">${lang === 'th' ? 'บีบอัดลดขนาด (Compress)' : 'Compress PDF'}</span>
              </button>
              <button class="menubar-menu-item" data-action="tool-protect" role="menuitem">
                <i data-lucide="shield" class="menu-icon"></i>
                <span class="menu-label">${lang === 'th' ? 'ล็อกรหัสผ่าน AES (Protect)' : 'Protect & Encrypt'}</span>
              </button>
              <button class="menubar-menu-item" data-action="tool-watermark" role="menuitem">
                <i data-lucide="stamp" class="menu-icon"></i>
                <span class="menu-label">${lang === 'th' ? 'ใส่ลายน้ำ (Watermark)' : 'Watermark'}</span>
              </button>
              <button class="menubar-menu-item" data-action="tool-numbers" role="menuitem">
                <i data-lucide="hash" class="menu-icon"></i>
                <span class="menu-label">${lang === 'th' ? 'รันเลขหน้า (Page Numbers)' : 'Page Numbers'}</span>
              </button>
              <button class="menubar-menu-item" data-action="tool-split" role="menuitem">
                <i data-lucide="scissors" class="menu-icon"></i>
                <span class="menu-label">${lang === 'th' ? 'แยกหน้า (Split PDF)' : 'Split Document'}</span>
              </button>
              <button class="menubar-menu-item" data-action="tool-metadata" role="menuitem">
                <i data-lucide="tag" class="menu-icon"></i>
                <span class="menu-label">${lang === 'th' ? 'ล้างข้อมูล Metadata (Sanitize)' : 'Sanitize Metadata'}</span>
              </button>
              <div class="menubar-separator" role="separator"></div>
              <button class="menubar-menu-item" data-action="tool-img2pdf" role="menuitem">
                <i data-lucide="image" class="menu-icon"></i>
                <span class="menu-label">${lang === 'th' ? 'แปลงรูปภาพเป็น PDF' : 'Images to PDF'}</span>
              </button>
              <button class="menubar-menu-item ${!hasDoc ? 'disabled' : ''}" data-action="tool-pdf2img" role="menuitem" ${!hasDoc ? 'disabled' : ''}>
                <i data-lucide="file-text" class="menu-icon"></i>
                <span class="menu-label">${lang === 'th' ? 'ส่งออก PDF เป็นรูปภาพ' : 'PDF to Images'}</span>
              </button>
              <button class="menubar-menu-item ${!hasDoc ? 'disabled' : ''}" data-action="tool-extract-text" role="menuitem" ${!hasDoc ? 'disabled' : ''}>
                <i data-lucide="file-text" class="menu-icon"></i>
                <span class="menu-label">${lang === 'th' ? 'สกัดข้อความ (Extract Text)' : 'Extract Text'}</span>
              </button>
            </div>
          </div>

          <!-- HELP MENU -->
          <div class="menubar-dropdown-wrapper ${this.openMenu === 'help' ? 'open' : ''}">
            <button class="menubar-root-btn ${this.openMenu === 'help' ? 'active' : ''}" data-menu="help" aria-haspopup="true">
              ${lang === 'th' ? 'ช่วยเหลือ (Help)' : 'Help'}
            </button>
            <div class="menubar-menu-panel" role="menu">
              <button class="menubar-menu-item" data-action="help-shortcuts" role="menuitem">
                <i data-lucide="help-circle" class="menu-icon"></i>
                <span class="menu-label">${lang === 'th' ? 'แป้นพิมพ์ลัด (Shortcuts)' : 'Keyboard Shortcuts'}</span>
                <kbd class="menu-shortcut">?</kbd>
              </button>
              <button class="menubar-menu-item" data-action="help-about" role="menuitem">
                <i data-lucide="info" class="menu-icon"></i>
                <span class="menu-label">${lang === 'th' ? 'เกี่ยวกับ mePDF Studio' : 'About mePDF Studio'}</span>
              </button>
            </div>
          </div>
        </div>

        <!-- Right Side Quick Status & Language -->
        <div class="menubar-tail-actions">
          <button class="menubar-lang-btn" id="menubar-lang-btn" title="Toggle Language (TH/EN)">
            <i data-lucide="globe" style="width: 12px; height: 12px;"></i>
            <span>${lang.toUpperCase()}</span>
          </button>
        </div>
      </div>
    `;

    this.attachDomEvents();
    this.refreshIcons();
  }

  private attachDomEvents(): void {
    const rootBtns = this.container.querySelectorAll<HTMLButtonElement>('.menubar-root-btn');
    rootBtns.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const menuName = btn.getAttribute('data-menu');
        if (this.openMenu === menuName) {
          this.closeAllMenus();
        } else {
          this.openMenu = menuName;
          this.render();
        }
      });

      // Hover to switch when a menu is already open
      btn.addEventListener('mouseenter', () => {
        const menuName = btn.getAttribute('data-menu');
        if (this.openMenu !== null && this.openMenu !== menuName) {
          this.openMenu = menuName;
          this.render();
        }
      });
    });

    const menuItems = this.container.querySelectorAll<HTMLButtonElement>('.menubar-menu-item');
    menuItems.forEach((item) => {
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        if (item.classList.contains('disabled') || item.disabled) return;
        const action = item.getAttribute('data-action');
        this.closeAllMenus();
        this.handleAction(action);
      });
    });

    const langBtn = this.container.querySelector('#menubar-lang-btn');
    langBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.callbacks.onToggleLanguage();
    });
  }

  private handleAction(action: string | null): void {
    if (!action) return;

    switch (action) {
      case 'open-file':
        this.callbacks.onOpenFile();
        break;
      case 'add-files':
        this.callbacks.onAddFiles();
        break;
      case 'save-file':
        this.callbacks.onSaveFile();
        break;
      case 'export-as':
        if (this.callbacks.onExportAs) {
          this.callbacks.onExportAs();
        } else {
          this.callbacks.onSaveFile();
        }
        break;
      case 'clear-workspace':
        this.callbacks.onClearWorkspace();
        break;
      case 'undo':
        this.callbacks.onUndo();
        break;
      case 'select-all':
        this.callbacks.onSelectAll();
        break;
      case 'deselect-all':
        this.callbacks.onDeselectAll();
        break;
      case 'invert-selection':
        this.callbacks.onInvertSelection();
        break;
      case 'rotate-90':
        this.callbacks.onRotateSelected(90);
        break;
      case 'duplicate-page':
        this.callbacks.onDuplicatePage();
        break;
      case 'delete-selected':
        this.callbacks.onDeleteSelected();
        break;
      case 'view-cockpit':
        this.callbacks.onSetViewMode('cockpit');
        break;
      case 'view-grid':
        this.callbacks.onSetViewMode('grid');
        break;
      case 'zoom-in':
        this.callbacks.onZoomIn();
        break;
      case 'zoom-out':
        this.callbacks.onZoomOut();
        break;
      case 'zoom-reset':
        this.callbacks.onResetZoom();
        break;
      case 'fit-width':
        this.callbacks.onFitWidth();
        break;
      case 'enhance-page-image':
        this.callbacks.onEnhancePageImage?.();
        break;
      case 'tool-photo-studio':
        if (this.callbacks.onOpenPhotoStudio) {
          this.callbacks.onOpenPhotoStudio();
        } else {
          this.callbacks.onOpenTool('photo-studio');
        }
        break;
      case 'tool-compress':
      case 'tool-protect':
      case 'tool-watermark':
      case 'tool-numbers':
      case 'tool-split':
      case 'tool-metadata':
      case 'tool-img2pdf':
      case 'tool-pdf2img':
      case 'tool-extract-text': {
        const toolName = action.replace('tool-', '');
        this.callbacks.onOpenTool(toolName);
        break;
      }
      case 'help-shortcuts':
        this.callbacks.onOpenHelpModal();
        break;
      case 'help-about':
        this.callbacks.onOpenAboutModal();
        break;
    }
  }

  private refreshIcons(): void {
    createIcons({
      icons: {
        FolderOpen,
        FilePlus,
        Save,
        Trash2,
        Undo2,
        CheckSquare,
        Square,
        RotateCw,
        Copy,
        Layers,
        LayoutGrid,
        ZoomIn,
        ZoomOut,
        Maximize2,
        FileText,
        Shield,
        Stamp,
        Hash,
        Scissors,
        Minimize2,
        Image,
        Tag,
        HelpCircle,
        Info,
        Globe,
        Sliders,
        Sparkles,
      },
      nameAttr: 'data-lucide',
    });
  }
}
