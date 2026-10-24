import './styles/tokens.css';
import './styles/app.css';

import {
  createIcons,
  Layers,
  Minimize2,
  Image,
  FileText,
  Upload,
  Download,
  DownloadCloud,
  ShieldCheck,
  Plus,
  Minus,
  Scissors,
  Globe,
  Lock,
  Stamp,
  Hash,
  Tag,
  RotateCw,
  Trash2,
  Undo2,
  LayoutGrid,
} from 'lucide';
import { registerSW } from 'virtual:pwa-register';

import type { PDFPageItem, DocumentMetadata } from './core/types';
import {
  loadPdfDocument,
  renderPageThumbnail,
  destroyPdfDocument,
  clearThumbnailCache,
  removeDocThumbnails,
} from './core/pdf-renderer';
import { imagesToPdf } from './core/pdf-operations';
import { compressPdf } from './core/pdf-compressor';
import { pdfWorker } from './core/worker-client';
import { readFileAsUint8Array, downloadBytes } from './utils/file-utils';
import { Toolbar } from './components/Toolbar';
import { VisualGrid } from './components/VisualGrid';
import { CockpitFilmstrip } from './components/CockpitFilmstrip';
import { CockpitCanvas } from './components/CockpitCanvas';
import { CockpitInspector, type InspectorTab } from './components/CockpitInspector';
import { modal } from './components/Modal';
import { toast } from './components/Toast';
import { progressOverlay } from './components/ProgressOverlay';
import { LightboxModal } from './components/LightboxModal';
import { t, getLanguage, setLanguage, onLanguageChange } from './core/i18n';
import { saveWorkspaceState, loadWorkspaceState, clearWorkspaceState } from './core/workspace-storage';
import { getCurrentRoute, setHashRoute, onHashChange, type ToolRoute } from './core/router';
import type { CloudDocument } from './cloud/document-service';
import { authService } from './cloud/auth-service';
import { authModal } from './components/AuthModal';
import { UserAccountMenu } from './components/UserAccountMenu';
import { cloudLibraryModal } from './components/CloudLibraryModal';
import { saveToCloudModal } from './components/SaveToCloudModal';

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace('#', '');
  const num = parseInt(clean, 16);
  if (isNaN(num)) return { r: 0, g: 0, b: 0 };
  return {
    r: ((num >> 16) & 255) / 255,
    g: ((num >> 8) & 255) / 255,
    b: (num & 255) / 255,
  };
}

class MePdfApp {
  private appEl: HTMLElement;
  private documents = new Map<string, DocumentMetadata>();
  private pages: PDFPageItem[] = [];

  // Studio Cockpit Components
  private cockpitFilmstrip: CockpitFilmstrip | null = null;
  private cockpitCanvas: CockpitCanvas | null = null;
  private cockpitInspector: CockpitInspector | null = null;
  private activePageId: string | null = null;
  private activeViewMode: 'cockpit' | 'grid' = 'cockpit';

  // Legacy Grid & Toolbar components
  private toolbar: Toolbar | null = null;
  private visualGrid: VisualGrid | null = null;

  // Modals & Menu
  private lightboxModal: LightboxModal | null = null;
  private userAccountMenu: UserAccountMenu | null = null;
  private fileInput: HTMLInputElement;
  private pendingAction: string | null = null;
  private undoStack: Array<{
    pages: { page: PDFPageItem; index: number }[];
    documents: DocumentMetadata[];
  }> = [];
  private activeUndoToast: { dismiss: () => void } | null = null;
  private autoSaveTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.appEl = document.querySelector<HTMLElement>('#app')!;
    this.fileInput = document.createElement('input');
    this.fileInput.type = 'file';
    this.fileInput.multiple = true;
    this.fileInput.accept = '.pdf,image/*';
    this.fileInput.style.display = 'none';
    document.body.appendChild(this.fileInput);

    this.lightboxModal = new LightboxModal();

    // Lock theme permanently to Neue Klasse Luxury
    document.documentElement.setAttribute('data-theme', 'bmw');

    this.renderShell();
    this.initCockpitComponents();
    this.initEventListeners();
    this.initRouterAndStorage();
    this.updateUI();
  }

  private renderShell(): void {
    const lang = getLanguage();
    this.appEl.innerHTML = `
      <!-- Top Command Ribbon (BMW Neue Klasse Luxury Style) -->
      <header class="command-ribbon navbar">
        <div class="ribbon-brand-section">
          <div class="ribbon-logo">
            <span>mePDF</span>
          </div>
          <span class="ribbon-badge" id="brand-badge-el">STUDIO COCKPIT</span>
          <span class="ribbon-doc-info" id="ribbon-doc-info" style="display: none;"></span>
        </div>

        <div class="ribbon-center-section">
          <div class="ribbon-pill-group">
            <button class="ribbon-pill-btn active" id="ribbon-view-cockpit-btn" data-view="cockpit" title="3-Pane Studio Cockpit View">
              <i data-lucide="layers" style="width: 14px; height: 14px;"></i>
              <span id="ribbon-label-cockpit">${t('viewCockpit') || 'Cockpit'}</span>
            </button>
            <button class="ribbon-pill-btn" id="ribbon-view-grid-btn" data-view="grid" title="Full Grid Macro Overview">
              <i data-lucide="layout-grid" style="width: 14px; height: 14px;"></i>
              <span id="ribbon-label-grid">${t('viewGrid') || 'Grid'}</span>
            </button>
          </div>

          <div class="ribbon-zoom-group">
            <button class="ribbon-zoom-btn" id="ribbon-zoom-out" title="Zoom Out">
              <i data-lucide="minus" style="width: 13px; height: 13px;"></i>
            </button>
            <span class="ribbon-zoom-val" id="ribbon-zoom-val">100%</span>
            <button class="ribbon-zoom-btn" id="ribbon-zoom-in" title="Zoom In">
              <i data-lucide="plus" style="width: 13px; height: 13px;"></i>
            </button>
          </div>

          <button class="btn btn-ghost btn-sm" id="ribbon-undo-btn" title="Undo (Ctrl+Z)" style="display: none;">
            <i data-lucide="undo-2" style="width: 14px; height: 14px;"></i>
          </button>
        </div>

        <div class="ribbon-right-section nav-actions">
          <button class="btn btn-secondary btn-sm" id="ribbon-add-files-btn" title="Add files to workspace">
            <i data-lucide="plus" style="width: 14px; height: 14px;"></i>
            <span id="ribbon-add-files-label">${t('toolbarAddFiles') || 'Add'}</span>
          </button>

          <div id="nav-user-account-container"></div>

          <button class="lang-switcher-btn" id="nav-lang-toggle-btn" title="Switch Language / สลับภาษา">
            <i data-lucide="globe" style="width: 13px; height: 13px;"></i>
            <span class="lang-opt ${lang === 'th' ? 'active' : ''}">TH</span>
            <span class="lang-sep">/</span>
            <span class="lang-opt ${lang === 'en' ? 'active' : ''}">EN</span>
          </button>

          <button class="btn btn-secondary btn-sm" id="nav-install-btn" style="display: none;" title="${t('navInstall')}">
            <i data-lucide="download-cloud" style="width: 14px; height: 14px;"></i>
            <span>${t('navInstall')}</span>
          </button>

          <button class="btn btn-primary" id="nav-export-btn" title="${t('navExport')} (Ctrl+S)">
            <i data-lucide="download" style="width: 15px; height: 15px;"></i>
            <span id="nav-export-label">${t('navExport')}</span>
          </button>
        </div>
      </header>

      <!-- Main Workspace Container -->
      <main class="workspace-main" id="workspace-main">
        <!-- Landing Dropzone Area -->
        <div id="dropzone-area" class="dropzone-container">
          <div class="dropzone-icon">
            <i data-lucide="upload" style="width: 36px; height: 36px;"></i>
          </div>
          <h2 class="dropzone-title" id="dropzone-title-el">${t('dropzoneTitle')}</h2>
          <p class="dropzone-desc" id="dropzone-desc-el">${t('dropzoneDesc')}</p>
          <button class="btn btn-primary" id="dropzone-browse-btn">
            <i data-lucide="plus" style="width: 16px; height: 16px;"></i>
            <span id="dropzone-select-label">${t('dropzoneSelectBtn')}</span>
          </button>
          <div class="dropzone-pills">
            <span class="privacy-pill">
              <i data-lucide="shield-check" style="width: 13px; height: 13px; color: var(--success);"></i>
              <span id="dropzone-zero-upload-label">${t('dropzoneZeroUpload')}</span>
            </span>
            <span class="privacy-pill" id="dropzone-unlimited-label">${t('dropzoneUnlimitedSize')}</span>
            <span class="privacy-pill" id="dropzone-formats-label">${t('dropzoneSupportedFormats')}</span>
          </div>
        </div>

        <!-- 3-Pane Studio Cockpit Workspace -->
        <div id="cockpit-workspace" class="cockpit-workspace" style="display: none;">
          <div id="cockpit-filmstrip-pane" class="cockpit-filmstrip"></div>
          <div id="cockpit-canvas-pane" class="cockpit-canvas"></div>
          <div id="cockpit-inspector-pane" class="cockpit-inspector"></div>
        </div>

        <!-- Full Grid Workspace Controls & Grid -->
        <div id="workspace-controls" style="display: none;"></div>
        <div id="workspace-grid" style="display: none;"></div>
      </main>
    `;

    this.refreshIcons();
  }

  private initCockpitComponents(): void {
    const filmstripPane = this.appEl.querySelector<HTMLElement>('#cockpit-filmstrip-pane')!;
    const canvasPane = this.appEl.querySelector<HTMLElement>('#cockpit-canvas-pane')!;
    const inspectorPane = this.appEl.querySelector<HTMLElement>('#cockpit-inspector-pane')!;

    // 1. Filmstrip Rail
    this.cockpitFilmstrip = new CockpitFilmstrip(filmstripPane, {
      onSelectPage: (pageId) => {
        this.activePageId = pageId;
        this.syncCockpitCanvas();
      },
      onToggleSelect: (pageId) => this.togglePageSelect(pageId),
      onRotatePage: (pageId, deg) => this.rotateSinglePage(pageId, deg),
      onDeletePage: (pageId) => this.deleteSinglePage(pageId),
      onReorder: (from, to) => this.reorderPages(from, to),
      onSelectAll: () => this.selectAll(),
      onDeselectAll: () => this.deselectAll(),
      onRotateSelected: (deg) => this.rotateSelected(deg),
      onDeleteSelected: () => this.deleteSelected(),
    });

    // 2. Live Canvas Stage
    this.cockpitCanvas = new CockpitCanvas(canvasPane, {
      onPrevPage: () => this.navigatePage(-1),
      onNextPage: () => this.navigatePage(1),
      onRotateActive: (deg) => {
        if (this.activePageId) this.rotateSinglePage(this.activePageId, deg);
      },
      onZoomChange: (zoom) => {
        const val = this.appEl.querySelector<HTMLElement>('#ribbon-zoom-val');
        if (val) val.textContent = `${Math.round(zoom * 100)}%`;
      },
    });

    // 3. Property Inspector Panel
    this.cockpitInspector = new CockpitInspector(inspectorPane, {
      onTabChange: (tab) => {
        setHashRoute(tab as ToolRoute);
      },
      onRotateSelected: (deg) => this.rotateSelected(deg),
      onRotateAll: (deg) => this.rotateAll(deg),
      onDeleteSelected: () => this.deleteSelected(),
      onDuplicateActive: () => this.duplicateActivePage(),
      onOpenSplit: () => this.openSplitModal(),
      // Watermark
      onWatermarkPreviewChange: (state) => {
        this.cockpitCanvas?.setWatermarkPreview(state);
      },
      onApplyWatermark: async (options) => {
        await this.handleApplyWatermark(options);
      },
      // Page Numbers
      onPageNumberPreviewChange: (state) => {
        this.cockpitCanvas?.setPageNumberPreview(state);
      },
      onApplyPageNumbers: async (options) => {
        await this.handleApplyPageNumbers(options);
      },
      // Compress
      onApplyCompress: async (options) => {
        await this.handleApplyCompress(options);
      },
      // Protect
      onApplyProtect: async (password) => {
        await this.handleApplyProtect(password);
      },
      // Metadata
      onApplyMetadata: async (meta) => {
        await this.handleApplyMetadata(meta);
      },
      onSanitizeMetadata: async () => {
        await this.handleSanitizeMetadata();
      },
      // Convert
      onImagesToPdf: () => {
        this.handleTabSwitch('img2pdf');
      },
      onPdfToImages: () => {
        this.handleTabSwitch('pdf2img');
      },
      onExtractText: () => {
        this.handleTabSwitch('extract-text');
      },
    });

    // Sub-components: User Account Menu
    const accountContainer = this.appEl.querySelector<HTMLElement>('#nav-user-account-container');
    if (accountContainer) {
      this.userAccountMenu = new UserAccountMenu(accountContainer, {
        onOpenCloudLibrary: () => cloudLibraryModal.open(),
        onOpenAuthModal: () => authModal.open(),
      });
    }

    cloudLibraryModal.setOptions({
      onOpenInStudio: async (doc, bytes) => this.loadCloudDocument(doc, bytes),
      onClose: () => this.resetNavTabToStudio(),
    });

    // Full Grid and Toolbar components
    const controlsContainer = this.appEl.querySelector<HTMLElement>('#workspace-controls')!;
    const gridContainer = this.appEl.querySelector<HTMLElement>('#workspace-grid')!;

    this.toolbar = new Toolbar(controlsContainer, {
      onSelectAll: () => this.toggleSelectAll(),
      onDeselectAll: () => this.deselectAll(),
      onInvertSelection: () => this.invertSelection(),
      onRotateSelected: (deg) => this.rotateSelected(deg),
      onRotateAll: (deg) => this.rotateAll(deg),
      onDeleteSelected: () => this.deleteSelected(),
      onOpenSplit: () => this.openSplitModal(),
      onAddFiles: () => this.fileInput.click(),
      onClearAll: () => this.clearAll(),
      onSaveToCloud: () => this.handleSaveToCloud(),
    });

    this.toolbar.setAuthenticated(authService.isAuthenticated());
    authService.onAuthStateChange((user) => {
      this.toolbar?.setAuthenticated(Boolean(user));
    });

    this.visualGrid = new VisualGrid(gridContainer, {
      onToggleSelect: (pageId) => this.togglePageSelect(pageId),
      onRotatePage: (pageId, deg) => this.rotateSinglePage(pageId, deg),
      onDeletePage: (pageId) => this.deleteSinglePage(pageId),
      onReorder: (from, to) => this.reorderPages(from, to),
      onZoomPage: (pageId) => this.lightboxModal?.open(pageId, this.pages, this.documents),
      onFilesDropped: (droppedFiles) => this.handleFiles(droppedFiles),
    });
  }

  private syncCockpitCanvas(): void {
    if (!this.cockpitCanvas) return;
    if (this.pages.length === 0) {
      this.cockpitCanvas.setActivePage(null, 0, 0);
      return;
    }
    const idx = this.pages.findIndex((p) => p.id === this.activePageId);
    const activeIdx = idx >= 0 ? idx : 0;
    const activePage = this.pages[activeIdx] || null;
    this.cockpitCanvas.setActivePage(activePage, activeIdx, this.pages.length);
  }

  private navigatePage(delta: number): void {
    if (this.pages.length === 0) return;
    const curIdx = this.pages.findIndex((p) => p.id === this.activePageId);
    const nextIdx = Math.max(0, Math.min(this.pages.length - 1, (curIdx >= 0 ? curIdx : 0) + delta));
    const nextItem = this.pages[nextIdx];
    if (nextItem) {
      this.activePageId = nextItem.id;
      this.cockpitFilmstrip?.setActivePageId(nextItem.id);
      this.syncCockpitCanvas();
    }
  }

  private duplicateActivePage(): void {
    if (this.pages.length === 0 || !this.activePageId) return;
    const idx = this.pages.findIndex((p) => p.id === this.activePageId);
    if (idx === -1) return;
    const orig = this.pages[idx]!;
    const duplicate: PDFPageItem = {
      ...orig,
      id: `page_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      selected: false,
    };
    this.pages.splice(idx + 1, 0, duplicate);
    this.activePageId = duplicate.id;
    this.updateUI();
    toast.show(`Duplicated page ${idx + 1}`, 'success');
  }

  private refreshIcons(): void {
    createIcons({
      icons: {
        Layers,
        Minimize2,
        Image,
        FileText,
        Upload,
        Download,
        DownloadCloud,
        ShieldCheck,
        Plus,
        Minus,
        Scissors,
        Globe,
        Lock,
        Stamp,
        Hash,
        Tag,
        RotateCw,
        Trash2,
        Undo2,
        LayoutGrid,
      },
      nameAttr: 'data-lucide',
    });
  }

  private initEventListeners(): void {
    // Browse & Dropzone
    const browseBtn = this.appEl.querySelector('#dropzone-browse-btn');
    browseBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.fileInput.click();
    });

    const ribbonAddBtn = this.appEl.querySelector('#ribbon-add-files-btn');
    ribbonAddBtn?.addEventListener('click', () => {
      this.fileInput.click();
    });

    const dropzoneArea = this.appEl.querySelector('#dropzone-area');
    dropzoneArea?.addEventListener('click', () => {
      this.fileInput.click();
    });

    this.fileInput.addEventListener('change', async () => {
      if (this.fileInput.files && this.fileInput.files.length > 0) {
        await this.handleFiles(Array.from(this.fileInput.files));
        this.fileInput.value = '';
      }
    });

    this.fileInput.addEventListener('cancel', () => {
      this.pendingAction = null;
      this.resetNavTabToStudio();
    });

    // Window drag & drop
    window.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzoneArea?.classList.add('drag-active');
    });

    window.addEventListener('dragleave', (e) => {
      if (e.relatedTarget === null) {
        dropzoneArea?.classList.remove('drag-active');
      }
    });

    window.addEventListener('drop', async (e) => {
      e.preventDefault();
      dropzoneArea?.classList.remove('drag-active');
      if (e.dataTransfer && e.dataTransfer.files.length > 0) {
        await this.handleFiles(Array.from(e.dataTransfer.files));
      }
    });

    // Export button
    const exportBtn = this.appEl.querySelector('#nav-export-btn');
    exportBtn?.addEventListener('click', () => this.exportCurrentDocument());

    // View Switcher (Cockpit vs Grid)
    const cockpitViewBtn = this.appEl.querySelector<HTMLButtonElement>('#ribbon-view-cockpit-btn');
    const gridViewBtn = this.appEl.querySelector<HTMLButtonElement>('#ribbon-view-grid-btn');

    cockpitViewBtn?.addEventListener('click', () => {
      this.activeViewMode = 'cockpit';
      cockpitViewBtn.classList.add('active');
      gridViewBtn?.classList.remove('active');
      this.updateUI();
    });

    gridViewBtn?.addEventListener('click', () => {
      this.activeViewMode = 'grid';
      gridViewBtn.classList.add('active');
      cockpitViewBtn?.classList.remove('active');
      this.updateUI();
    });

    // Ribbon Zoom controls
    this.appEl.querySelector('#ribbon-zoom-in')?.addEventListener('click', () => {
      if (this.cockpitCanvas) {
        this.cockpitCanvas.setZoom(this.cockpitCanvas.getZoom() + 0.15);
      }
    });

    this.appEl.querySelector('#ribbon-zoom-out')?.addEventListener('click', () => {
      if (this.cockpitCanvas) {
        this.cockpitCanvas.setZoom(this.cockpitCanvas.getZoom() - 0.15);
      }
    });

    // Ribbon Undo button
    this.appEl.querySelector('#ribbon-undo-btn')?.addEventListener('click', () => {
      this.undoDelete();
    });

    // Language toggle
    const langToggleBtn = this.appEl.querySelector('#nav-lang-toggle-btn');
    langToggleBtn?.addEventListener('click', () => {
      const nextLang = getLanguage() === 'th' ? 'en' : 'th';
      setLanguage(nextLang);
      toast.show(t('toastLanguageSwitched'), 'info');
    });

    // Keyboard shortcuts
    window.addEventListener('keydown', (e) => {
      if (
        modal.isOpen() ||
        progressOverlay.isOpen() ||
        (this.lightboxModal && this.lightboxModal.isOpen()) ||
        authModal.isOpen() ||
        cloudLibraryModal.isOpen() ||
        saveToCloudModal.isOpen()
      ) return;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        this.exportCurrentDocument();
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
        const activeTag = document.activeElement?.tagName.toLowerCase();
        if (activeTag !== 'input' && activeTag !== 'textarea') {
          e.preventDefault();
          this.selectAll();
        }
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        const activeTag = document.activeElement?.tagName.toLowerCase();
        if (activeTag !== 'input' && activeTag !== 'textarea') {
          e.preventDefault();
          this.undoDelete();
        }
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const activeTag = document.activeElement?.tagName.toLowerCase();
        if (activeTag !== 'input' && activeTag !== 'textarea') {
          this.deleteSelected();
        }
      }
    });

    // PWA Install Prompt
    let deferredInstallPrompt: any = null;
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredInstallPrompt = e;
      const installBtn = this.appEl.querySelector<HTMLButtonElement>('#nav-install-btn');
      if (installBtn) {
        installBtn.style.display = 'inline-flex';
        this.refreshIcons();
        installBtn.onclick = async () => {
          if (!deferredInstallPrompt) return;
          deferredInstallPrompt.prompt();
          const { outcome } = await deferredInstallPrompt.userChoice;
          if (outcome === 'accepted') {
            toast.show(t('toastAppInstalled'), 'success');
            installBtn.style.display = 'none';
          }
          deferredInstallPrompt = null;
        };
      }
    });

    window.addEventListener('appinstalled', () => {
      const installBtn = this.appEl.querySelector<HTMLButtonElement>('#nav-install-btn');
      if (installBtn) installBtn.style.display = 'none';
      toast.show(t('toastOfflineReady'), 'success');
    });

    window.addEventListener('offline', () => {
      toast.show(t('toastOfflineActive'), 'info');
    });

    window.addEventListener('online', () => {
      toast.show(t('toastOnlineActive'), 'info');
    });
  }

  // ==========================================
  // FILE INGESTION & THUMBNAIL PIPELINE
  // ==========================================
  private async handleFiles(files: File[]): Promise<void> {
    const isPdf = (f: File) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name);
    const isImage = (f: File) => f.type.startsWith('image/') || /\.(jpe?g|png|webp|avif|bmp|gif)$/i.test(f.name);

    const pdfFiles = files.filter(isPdf);
    const imageFiles = files.filter(isImage);

    if (pdfFiles.length === 0 && imageFiles.length === 0) {
      toast.show(t('toastUploadPdfOrImg'), 'error');
      return;
    }

    try {
      progressOverlay.show('Reading files...');

      // 1. Process image files directly into PDF pages
      if (imageFiles.length > 0) {
        progressOverlay.update({
          stage: 'Converting images to pages',
          current: 0,
          total: imageFiles.length,
          percent: 10,
        });
        const convertedBytes = await imagesToPdf(imageFiles, { pageSize: 'A4' });
        const virtualFile = new File([convertedBytes as unknown as BlobPart], 'Images_Combined.pdf', {
          type: 'application/pdf',
        });
        pdfFiles.push(virtualFile);
      }

      // 2. Process each PDF file
      for (let fIdx = 0; fIdx < pdfFiles.length; fIdx++) {
        const file = pdfFiles[fIdx]!;
        const docId = `doc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        const bytes = await readFileAsUint8Array(file);

        progressOverlay.show(`Loading ${file.name}...`);
        let pdfDoc: import('pdfjs-dist').PDFDocumentProxy;
        let enteredPassword: string | undefined;
        try {
          pdfDoc = await loadPdfDocument(bytes);
        } catch (err: unknown) {
          const isPassword =
            (err && typeof err === 'object' && 'name' in err && (err as { name?: string }).name === 'PasswordException') ||
            (err instanceof Error && /password/i.test(err.message));
          if (isPassword) {
            progressOverlay.hide();
            try {
              pdfDoc = await new Promise<import('pdfjs-dist').PDFDocumentProxy>((resolve, reject) => {
                modal.showPasswordPromptModal(
                  file.name,
                  async (pwd) => {
                    try {
                      const doc = await loadPdfDocument(bytes, pwd);
                      enteredPassword = pwd;
                      resolve(doc);
                    } catch {
                      throw new Error('Incorrect password');
                    }
                  },
                  () => reject(new Error('Password prompt cancelled'))
                );
              });
            } catch {
              toast.show(`Skipped ${file.name} (password required)`, 'info');
              continue;
            }
          } else {
            const msg = err instanceof Error ? err.message : String(err);
            toast.show(`Failed to load ${file.name}: ${msg}`, 'error');
            continue;
          }
        }

        try {
          const pageCount = pdfDoc.numPages;

          this.documents.set(docId, {
            id: docId,
            filename: file.name,
            size: file.size,
            pageCount,
            fileBytes: bytes,
            password: enteredPassword,
          });

          for (let pNum = 1; pNum <= pageCount; pNum++) {
            progressOverlay.update({
              stage: 'Generating thumbnails...',
              current: pNum,
              total: pageCount,
              percent: Math.round((pNum / pageCount) * 100),
            });

            const { dataUrl, width, height } = await renderPageThumbnail(pdfDoc, pNum, 0, 320, docId);

            const pageItem: PDFPageItem = {
              id: `page_${docId}_${pNum}_${Date.now()}_${Math.random().toString(36).slice(2, 4)}`,
              docId,
              docName: file.name,
              pageIndex: pNum - 1,
              displayPageNumber: pNum,
              rotation: 0,
              thumbnailDataUrl: dataUrl,
              width,
              height,
              selected: false,
            };

            this.pages.push(pageItem);
          }
        } finally {
          await destroyPdfDocument(pdfDoc);
        }
      }

      progressOverlay.hide();
      toast.show(t('toastImportSuccess', { count: this.pages.length }), 'success');
      
      if (!this.activePageId && this.pages.length > 0) {
        this.activePageId = this.pages[0]?.id || null;
      }
      this.updateUI();

      if (this.pendingAction) {
        const action = this.pendingAction;
        this.pendingAction = null;
        await this.handleTabSwitch(action);
      }
    } catch (err: unknown) {
      progressOverlay.hide();
      const msg = err instanceof Error ? err.message : String(err);
      toast.show(`Failed to load file: ${msg}`, 'error');
    }
  }

  // ==========================================
  // WORKSPACE ACTIONS & SYNCHRONIZATION
  // ==========================================
  private triggerAutoSave(): void {
    if (this.autoSaveTimer) {
      clearTimeout(this.autoSaveTimer);
    }
    this.autoSaveTimer = setTimeout(async () => {
      try {
        if (this.pages.length > 0) {
          await saveWorkspaceState(Array.from(this.documents.values()), this.pages);
        } else {
          await clearWorkspaceState();
        }
      } catch (err) {
        console.warn('Auto-save error:', err);
      }
    }, 400);
  }

  private updateUI(): void {
    const hasPages = this.pages.length > 0;
    const dropzoneArea = this.appEl.querySelector<HTMLElement>('#dropzone-area')!;
    const cockpitWorkspace = this.appEl.querySelector<HTMLElement>('#cockpit-workspace')!;
    const controlsContainer = this.appEl.querySelector<HTMLElement>('#workspace-controls')!;
    const gridContainer = this.appEl.querySelector<HTMLElement>('#workspace-grid')!;
    const exportBtn = this.appEl.querySelector<HTMLButtonElement>('#nav-export-btn')!;
    const exportLabel = this.appEl.querySelector<HTMLElement>('#nav-export-label')!;
    const ribbonDocInfo = this.appEl.querySelector<HTMLElement>('#ribbon-doc-info')!;
    const ribbonUndoBtn = this.appEl.querySelector<HTMLElement>('#ribbon-undo-btn')!;

    // Undo button visibility
    if (ribbonUndoBtn) {
      ribbonUndoBtn.style.display = this.undoStack.length > 0 ? 'inline-flex' : 'none';
    }

    if (hasPages) {
      dropzoneArea.style.display = 'none';
      exportBtn.disabled = false;
      exportBtn.style.opacity = '1';

      const selectedCount = this.pages.filter((p) => p.selected).length;
      exportLabel.textContent = t('navExportCount', { count: this.pages.length });

      // Update Ribbon Document Info Badge
      if (ribbonDocInfo) {
        ribbonDocInfo.style.display = 'inline-block';
        const distinctDocNames = Array.from(new Set(this.pages.map((p) => p.docName)));
        const primaryDoc = distinctDocNames.length === 1 ? distinctDocNames[0] : `${distinctDocNames.length} Documents`;
        ribbonDocInfo.textContent = `${primaryDoc} • ${this.pages.length}p`;
      }

      // Check activePageId validity
      if (!this.activePageId || !this.pages.some((p) => p.id === this.activePageId)) {
        this.activePageId = this.pages[0]?.id || null;
      }

      // Switch View Mode
      if (this.activeViewMode === 'cockpit') {
        cockpitWorkspace.style.display = 'grid';
        controlsContainer.style.display = 'none';
        gridContainer.style.display = 'none';

        this.cockpitFilmstrip?.setPages(this.pages, this.activePageId || undefined);
        this.syncCockpitCanvas();
        this.cockpitInspector?.setState({ selectedCount, totalPages: this.pages.length });
      } else {
        cockpitWorkspace.style.display = 'none';
        controlsContainer.style.display = 'block';
        gridContainer.style.display = 'block';

        this.toolbar?.updateState(this.pages.length, selectedCount);
        this.visualGrid?.setPages(this.pages);
      }
    } else {
      dropzoneArea.style.display = 'flex';
      cockpitWorkspace.style.display = 'none';
      controlsContainer.style.display = 'none';
      gridContainer.style.display = 'none';
      if (ribbonDocInfo) ribbonDocInfo.style.display = 'none';

      exportBtn.disabled = true;
      exportBtn.style.opacity = '0.5';
      exportLabel.textContent = t('navExport');

      this.activePageId = null;
      this.visualGrid?.setPages([]);
      this.cockpitFilmstrip?.setPages([]);
      this.cockpitCanvas?.setActivePage(null, 0, 0);
    }

    this.triggerAutoSave();
  }

  private toggleSelectAll(): void {
    const allSelected = this.pages.every((p) => p.selected);
    this.pages.forEach((p) => (p.selected = !allSelected));
    this.updateUI();
  }

  private selectAll(): void {
    this.pages.forEach((p) => (p.selected = true));
    this.updateUI();
  }

  private deselectAll(): void {
    this.pages.forEach((p) => (p.selected = false));
    this.updateUI();
  }

  private invertSelection(): void {
    this.pages.forEach((p) => (p.selected = !p.selected));
    this.updateUI();
  }

  private rotateAll(degrees: number): void {
    if (this.pages.length === 0) return;
    this.pages.forEach((p) => {
      p.rotation = (p.rotation + degrees) % 360;
    });
    toast.show(t('toastRotatedAll', { count: this.pages.length, deg: degrees }), 'info');
    this.updateUI();
  }

  private rotateSelected(degrees: number): void {
    const selectedPages = this.pages.filter((p) => p.selected);
    if (selectedPages.length === 0) {
      if (this.activePageId) {
        this.rotateSinglePage(this.activePageId, degrees);
      } else {
        this.rotateAll(degrees);
      }
      return;
    }

    selectedPages.forEach((p) => {
      p.rotation = (p.rotation + degrees) % 360;
    });

    toast.show(t('toastRotatedSelected', { count: selectedPages.length, deg: degrees }), 'info');
    this.updateUI();
  }

  private rotateSinglePage(pageId: string, degrees: number): void {
    const page = this.pages.find((p) => p.id === pageId);
    if (page) {
      page.rotation = (page.rotation + degrees) % 360;
      this.updateUI();
    }
  }

  private togglePageSelect(pageId: string): void {
    const page = this.pages.find((p) => p.id === pageId);
    if (page) {
      page.selected = !page.selected;
      this.updateUI();
    }
  }

  private pruneUnusedDocuments(): void {
    const activeDocIds = new Set(this.pages.map((p) => p.docId));
    for (const docId of this.documents.keys()) {
      if (!activeDocIds.has(docId)) {
        this.documents.delete(docId);
        removeDocThumbnails(docId);
      }
    }
  }

  private deleteSinglePage(pageId: string): void {
    const idx = this.pages.findIndex((p) => p.id === pageId);
    if (idx === -1) return;

    const deletedPage = this.pages[idx]!;
    const docMeta = this.documents.get(deletedPage.docId);

    if (this.activeUndoToast) {
      this.activeUndoToast.dismiss();
      this.activeUndoToast = null;
    }

    this.undoStack.push({
      pages: [{ page: { ...deletedPage, selected: false }, index: idx }],
      documents: docMeta ? [{ ...docMeta }] : [],
    });
    if (this.undoStack.length > 20) {
      this.undoStack.shift();
    }

    this.pages.splice(idx, 1);
    this.pruneUnusedDocuments();

    // Reset activePageId if deleted
    if (this.activePageId === pageId) {
      const nextItem = this.pages[Math.min(idx, this.pages.length - 1)];
      this.activePageId = nextItem ? nextItem.id : null;
    }

    this.updateUI();
    this.activeUndoToast = toast.showAction(t('toastPageRemoved'), t('toastUndo'), () => this.undoDelete());
  }

  private deleteSelected(): void {
    const selectedPagesWithIndices = this.pages
      .map((p, idx) => ({ page: { ...p, selected: false }, index: idx }))
      .filter((item) => {
        const orig = this.pages[item.index];
        return orig && orig.selected;
      });

    const selectedCount = selectedPagesWithIndices.length;
    if (selectedCount === 0) {
      if (this.activePageId) {
        this.deleteSinglePage(this.activePageId);
      }
      return;
    }

    const docIds = new Set(selectedPagesWithIndices.map((item) => item.page.docId));
    const docsToKeep = Array.from(docIds)
      .map((id) => this.documents.get(id))
      .filter((d): d is DocumentMetadata => Boolean(d));

    if (this.activeUndoToast) {
      this.activeUndoToast.dismiss();
      this.activeUndoToast = null;
    }

    this.undoStack.push({
      pages: selectedPagesWithIndices,
      documents: docsToKeep.map((d) => ({ ...d })),
    });
    if (this.undoStack.length > 20) {
      this.undoStack.shift();
    }

    const selectedIds = new Set(selectedPagesWithIndices.map((item) => item.page.id));
    this.pages = this.pages.filter((p) => !selectedIds.has(p.id));
    this.pruneUnusedDocuments();

    if (this.activePageId && selectedIds.has(this.activePageId)) {
      this.activePageId = this.pages.length > 0 ? (this.pages[0]?.id || null) : null;
    }

    this.updateUI();
    this.activeUndoToast = toast.showAction(
      `${selectedCount} pages removed`,
      t('toastUndo'),
      () => this.undoDelete()
    );
  }

  private undoDelete(): void {
    const lastAction = this.undoStack.pop();
    if (!lastAction) return;

    if (this.activeUndoToast) {
      this.activeUndoToast.dismiss();
      this.activeUndoToast = null;
    }

    for (const doc of lastAction.documents) {
      if (!this.documents.has(doc.id)) {
        this.documents.set(doc.id, doc);
      }
    }

    const sortedPages = [...lastAction.pages].sort((a, b) => a.index - b.index);
    for (const item of sortedPages) {
      const insertIdx = Math.min(item.index, this.pages.length);
      this.pages.splice(insertIdx, 0, item.page);
    }

    const count = sortedPages.length;
    this.updateUI();
    toast.show(t('toastPagesRestored', { count }), 'success');
  }

  private reorderPages(fromIndex: number, toIndex: number): void {
    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) return;
    const [movedItem] = this.pages.splice(fromIndex, 1);
    if (movedItem) {
      this.pages.splice(toIndex, 0, movedItem);
      this.updateUI();
    }
  }

  private clearAll(): void {
    if (this.pages.length === 0) return;
    modal.showConfirmModal(
      t('clearModalTitle'),
      t('clearModalDesc'),
      async () => {
        if (this.activeUndoToast) {
          this.activeUndoToast.dismiss();
          this.activeUndoToast = null;
        }
        this.pages = [];
        this.documents.clear();
        this.undoStack = [];
        this.activePageId = null;
        clearThumbnailCache();
        await clearWorkspaceState();
        this.updateUI();
        toast.show(t('toastWorkspaceCleared'), 'info');
      },
      t('clearModalConfirm'),
      true
    );
  }

  // ==========================================
  // EXPORT / SAVE PIPELINE
  // ==========================================
  private async exportCurrentDocument(): Promise<void> {
    if (this.pages.length === 0) {
      toast.show(t('toastNoPagesToExport'), 'info');
      return;
    }

    try {
      progressOverlay.show('Merging and building PDF...');
      const mergedBytes = await pdfWorker.mergePages(this.pages, this.documents, (info) => {
        progressOverlay.update(info);
      });
      progressOverlay.hide();

      let exportFilename = 'mepdf_merged.pdf';
      const distinctDocIds = new Set(this.pages.map((p) => p.docId));
      if (distinctDocIds.size === 1) {
        const docId = distinctDocIds.values().next().value;
        const doc = docId ? this.documents.get(docId) : null;
        if (doc?.filename) {
          exportFilename = `${doc.filename.replace(/\.pdf$/i, '')}_edited.pdf`;
        }
      }

      downloadBytes(mergedBytes, exportFilename);
      toast.show(t('toastExportSuccess', { count: this.pages.length }), 'success');
    } catch (err: unknown) {
      progressOverlay.hide();
      const msg = err instanceof Error ? err.message : String(err);
      toast.show(`Export failed: ${msg}`, 'error');
    }
  }

  private async handleSaveToCloud(): Promise<void> {
    if (this.pages.length === 0) {
      toast.show(t('toastNoPagesToExport'), 'info');
      return;
    }

    try {
      const { docBytes, docName } = await this.getActiveDocumentBytes();
      const firstPage = this.pages[0];
      saveToCloudModal.open({
        filename: docName,
        fileBytes: docBytes,
        pageCount: this.pages.length,
        thumbnailDataUrl: firstPage?.thumbnailDataUrl,
        onSuccess: () => {
          this.userAccountMenu?.render();
        },
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.show(`Could not prepare file: ${msg}`, 'error');
    }
  }

  private async loadCloudDocument(doc: CloudDocument, bytes: Uint8Array): Promise<void> {
    try {
      progressOverlay.show(`Loading ${doc.filename}...`);
      if (this.pages.length > 0) {
        this.pages = [];
        this.documents.clear();
        this.undoStack = [];
        clearThumbnailCache();
      }

      const virtualFile = new File([bytes as any], doc.filename, {
        type: 'application/pdf',
      });
      await this.handleFiles([virtualFile]);
      this.resetNavTabToStudio();
      toast.show(`Loaded "${doc.filename}" from cloud library`, 'success');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.show(`Failed to load cloud document: ${msg}`, 'error');
    } finally {
      progressOverlay.hide();
    }
  }

  private openSplitModal(): void {
    if (this.pages.length < 2) {
      toast.show(t('toastMinPagesToSplit'), 'info');
      this.resetNavTabToStudio();
      return;
    }
    let baseFilename = 'mepdf';
    const distinctDocIds = new Set(this.pages.map((p) => p.docId));
    if (distinctDocIds.size === 1) {
      const docId = distinctDocIds.values().next().value;
      const doc = docId ? this.documents.get(docId) : null;
      if (doc?.filename) {
        baseFilename = doc.filename.replace(/\.pdf$/i, '');
      }
    }
    modal.setOnClose(() => this.resetNavTabToStudio());
    modal.showSplitModal(this.pages, this.documents, baseFilename);
  }

  // ==========================================
  // COCKPIT DIRECT TOOL HANDLERS
  // ==========================================
  private async handleApplyWatermark(options: {
    text: string;
    fontSize: number;
    opacity: number;
    color: string;
    rotation: number;
    repeat: boolean;
  }): Promise<void> {
    try {
      progressOverlay.show('Applying watermark to PDF...');
      const { docBytes, docName } = await this.getActiveDocumentBytes();
      
      const watermarkedBytes = await pdfWorker.watermarkPdf(
        docBytes,
        {
          type: 'text',
          text: options.text,
          fontSize: options.fontSize,
          opacity: options.opacity,
          color: hexToRgb(options.color),
          rotation: options.rotation,
          position: 'center',
        },
        (info) => progressOverlay.update(info)
      );

      progressOverlay.hide();
      const outName = `${docName.replace(/\.pdf$/i, '')}_watermarked.pdf`;
      downloadBytes(watermarkedBytes, outName);
      toast.show('Watermark applied successfully!', 'success');
    } catch (err: unknown) {
      progressOverlay.hide();
      const msg = err instanceof Error ? err.message : String(err);
      toast.show(`Failed to apply watermark: ${msg}`, 'error');
    }
  }

  private async handleApplyPageNumbers(options: {
    format: string;
    position: 'bottom-center' | 'bottom-right' | 'bottom-left' | 'top-center' | 'top-right' | 'top-left';
    margin: number;
    fontSize: number;
    color: string;
  }): Promise<void> {
    try {
      progressOverlay.show('Adding page numbers...');
      const { docBytes, docName } = await this.getActiveDocumentBytes();

      let pnFormat: import('./core/types').PageNumberFormat = 'custom';
      if (options.format === '{n}') pnFormat = 'number_only';
      else if (options.format === 'Page {n}') pnFormat = 'page_n';
      else if (options.format === 'Page {n} of {total}') pnFormat = 'page_n_of_total';
      else if (options.format.includes('{total}')) pnFormat = 'n_slash_total';

      const numberedBytes = await pdfWorker.pageNumbers(
        docBytes,
        {
          position: options.position,
          format: pnFormat,
          customTemplate: pnFormat === 'custom' ? options.format : undefined,
          fontSize: options.fontSize,
          margin: options.margin,
          color: hexToRgb(options.color),
          startPageNumber: 1,
        },
        (info) => progressOverlay.update(info)
      );

      progressOverlay.hide();
      const outName = `${docName.replace(/\.pdf$/i, '')}_numbered.pdf`;
      downloadBytes(numberedBytes, outName);
      toast.show('Page numbers added successfully!', 'success');
    } catch (err: unknown) {
      progressOverlay.hide();
      const msg = err instanceof Error ? err.message : String(err);
      toast.show(`Failed to add page numbers: ${msg}`, 'error');
    }
  }

  private async handleApplyCompress(options: {
    engine: 'lossless' | 'scanned';
    quality: number;
    dpi: number;
  }): Promise<void> {
    try {
      progressOverlay.show('Compressing PDF...');
      const { docBytes, docName } = await this.getActiveDocumentBytes();

      let compressedBytes: Uint8Array;
      if (options.engine === 'lossless') {
        const res = await pdfWorker.compressLossless(docBytes, (info) => progressOverlay.update(info));
        compressedBytes = res.pdfBytes;
      } else {
        const res = await compressPdf(
          docBytes,
          {
            quality: options.quality / 100,
            dpi: options.dpi,
          },
          (info) => progressOverlay.update(info)
        );
        compressedBytes = res.pdfBytes;
      }

      progressOverlay.hide();
      const outName = `${docName.replace(/\.pdf$/i, '')}_compressed.pdf`;
      downloadBytes(compressedBytes, outName);
      toast.show('Document compressed successfully!', 'success');
    } catch (err: unknown) {
      progressOverlay.hide();
      const msg = err instanceof Error ? err.message : String(err);
      toast.show(`Compression failed: ${msg}`, 'error');
    }
  }

  private async handleApplyProtect(password: string): Promise<void> {
    try {
      progressOverlay.show('Encrypting PDF with 256-bit AES...');
      const { docBytes, docName } = await this.getActiveDocumentBytes();

      const protectedBytes = await pdfWorker.protectPdf(
        docBytes,
        password
      );

      progressOverlay.hide();
      const outName = `${docName.replace(/\.pdf$/i, '')}_protected.pdf`;
      downloadBytes(protectedBytes, outName);
      toast.show('PDF encrypted and protected!', 'success');
    } catch (err: unknown) {
      progressOverlay.hide();
      const msg = err instanceof Error ? err.message : String(err);
      toast.show(`Encryption failed: ${msg}`, 'error');
    }
  }

  private async handleApplyMetadata(meta: {
    title: string;
    author: string;
    subject: string;
    keywords: string;
  }): Promise<void> {
    try {
      progressOverlay.show('Updating document metadata...');
      const { docBytes, docName } = await this.getActiveDocumentBytes();

      const updatedBytes = await pdfWorker.updatePdfMetadata(
        docBytes,
        {
          title: meta.title || undefined,
          author: meta.author || undefined,
          subject: meta.subject || undefined,
          keywords: meta.keywords || undefined,
        }
      );

      progressOverlay.hide();
      const outName = `${docName.replace(/\.pdf$/i, '')}_meta.pdf`;
      downloadBytes(updatedBytes, outName);
      toast.show('Metadata updated successfully!', 'success');
    } catch (err: unknown) {
      progressOverlay.hide();
      const msg = err instanceof Error ? err.message : String(err);
      toast.show(`Metadata update failed: ${msg}`, 'error');
    }
  }

  private async handleSanitizeMetadata(): Promise<void> {
    try {
      progressOverlay.show('Sanitizing and purging metadata...');
      const { docBytes, docName } = await this.getActiveDocumentBytes();

      const sanitizedBytes = await pdfWorker.updatePdfMetadata(
        docBytes,
        {
          title: '',
          author: '',
          subject: '',
          keywords: '',
          creator: '',
          producer: 'mePDF Studio Pure Client-Side',
        },
        true
      );

      progressOverlay.hide();
      const outName = `${docName.replace(/\.pdf$/i, '')}_sanitized.pdf`;
      downloadBytes(sanitizedBytes, outName);
      toast.show('All metadata completely sanitized!', 'success');
    } catch (err: unknown) {
      progressOverlay.hide();
      const msg = err instanceof Error ? err.message : String(err);
      toast.show(`Sanitization failed: ${msg}`, 'error');
    }
  }

  // ==========================================
  // ACTIVE DOCUMENT RESOLVER
  // ==========================================
  private async getActiveDocumentBytes(): Promise<{ docBytes: Uint8Array; docName: string; password?: string }> {
    if (this.pages.length === 0) {
      throw new Error('No pages in workspace');
    }

    const firstDoc = this.documents.values().next().value as DocumentMetadata;
    const isSingleDoc = this.documents.size === 1;
    const isUnmodified =
      isSingleDoc &&
      this.pages.length === firstDoc.pageCount &&
      this.pages.every((p, idx) => p.pageIndex === idx && p.rotation === 0);

    if (isUnmodified) {
      return { docBytes: firstDoc.fileBytes, docName: firstDoc.filename, password: firstDoc.password };
    }

    progressOverlay.show('Preparing workspace document...');
    const mergedBytes = await pdfWorker.mergePages(this.pages, this.documents, (info) => {
      progressOverlay.update(info);
    });
    progressOverlay.hide();

    const baseName = isSingleDoc ? firstDoc.filename : 'mepdf_workspace.pdf';
    return { docBytes: mergedBytes, docName: baseName, password: isSingleDoc ? firstDoc.password : undefined };
  }

  // ==========================================
  // TOP NAV TAB ACTIONS & ROUTING
  // ==========================================
  private resetNavTabToStudio(): void {
    setHashRoute('studio');
    this.cockpitInspector?.setActiveTab('tools');
  }

  private async handleTabSwitch(tab: string | null): Promise<void> {
    if (!tab) return;

    if (tab === 'studio') {
      setHashRoute('studio');
      this.cockpitInspector?.setActiveTab('tools');
      return;
    }

    if (tab === 'account') {
      if (authService.isAuthenticated()) {
        cloudLibraryModal.open();
      } else {
        authModal.open({
          onClose: () => this.resetNavTabToStudio(),
        });
      }
      return;
    }

    if (tab === 'cloud-library') {
      cloudLibraryModal.open();
      return;
    }

    if (tab === 'split') {
      if (this.pages.length === 0) {
        this.pendingAction = 'split';
        toast.show(t('toastSelectDocFirst'), 'info');
        this.fileInput.click();
        return;
      }
      setHashRoute('split');
      this.openSplitModal();
      return;
    }

    if (tab === 'img2pdf') {
      setHashRoute('img2pdf');
      modal.setOnClose(() => this.resetNavTabToStudio());
      modal.showImagesToPdfModal(async (imageFiles, pageSize) => {
        progressOverlay.show('Converting images to PDF...');
        const convertedBytes = await imagesToPdf(imageFiles, { pageSize });
        progressOverlay.hide();
        const virtualFile = new File([convertedBytes as unknown as BlobPart], 'Images_Studio.pdf', {
          type: 'application/pdf',
        });
        await this.handleFiles([virtualFile]);
        toast.show(`Added ${imageFiles.length} images to Studio Cockpit!`, 'success');
      });
      return;
    }

    // Direct routing to Cockpit Inspector tabs
    if (['watermark', 'numbers', 'compress', 'protect', 'metadata'].includes(tab)) {
      if (this.pages.length === 0) {
        this.pendingAction = tab;
        toast.show(t('toastSelectDocFirst'), 'info');
        this.fileInput.click();
        return;
      }
      setHashRoute(tab as ToolRoute);
      this.activeViewMode = 'cockpit';
      this.cockpitInspector?.setActiveTab(tab as InspectorTab);
      this.updateUI();
      return;
    }

    // Legacy or Dialog-based tools
    if (this.pages.length === 0) {
      this.pendingAction = tab;
      toast.show(t('toastSelectDocFirst'), 'info');
      this.fileInput.click();
      return;
    }

    try {
      const { docBytes, docName, password } = await this.getActiveDocumentBytes();
      setHashRoute(tab as ToolRoute);
      modal.setOnClose(() => this.resetNavTabToStudio());

      if (tab === 'pdf2img') {
        modal.showPdfToImagesModal(docBytes, docName, password);
      } else if (tab === 'extract-text') {
        await modal.showExtractTextModal(docBytes, docName, password);
      }
    } catch (err: unknown) {
      this.resetNavTabToStudio();
      progressOverlay.hide();
      const msg = err instanceof Error ? err.message : String(err);
      toast.show(`Failed to prepare document: ${msg}`, 'error');
    }
  }

  // ==========================================
  // ROUTER, STORAGE & I18N SYNC
  // ==========================================
  private async initRouterAndStorage(): Promise<void> {
    onLanguageChange(() => {
      this.handleLanguageChanged();
    });

    onHashChange(async (route) => {
      await this.handleTabSwitch(route);
    });

    try {
      const restored = await loadWorkspaceState();
      if (restored && restored.pages.length > 0) {
        this.documents.clear();
        for (const doc of restored.documents) {
          this.documents.set(doc.id, doc);
        }
        this.pages = restored.pages;
        if (this.pages.length > 0) {
          this.activePageId = this.pages[0]?.id || null;
        }
        this.updateUI();
        toast.show(t('toastSessionRestored'), 'info');
      }
    } catch (err) {
      console.warn('Failed to restore workspace session:', err);
    }

    const initialRoute = getCurrentRoute();
    if (initialRoute && initialRoute !== 'studio') {
      await this.handleTabSwitch(initialRoute);
    }
  }

  private handleLanguageChanged(): void {
    const lang = getLanguage();

    const badge = this.appEl.querySelector('#brand-badge-el');
    if (badge) badge.textContent = 'STUDIO COCKPIT';

    const viewCockpitLabel = this.appEl.querySelector('#ribbon-label-cockpit');
    if (viewCockpitLabel) viewCockpitLabel.textContent = t('viewCockpit') || 'Cockpit';

    const viewGridLabel = this.appEl.querySelector('#ribbon-label-grid');
    if (viewGridLabel) viewGridLabel.textContent = t('viewGrid') || 'Grid';

    const addFilesLabel = this.appEl.querySelector('#ribbon-add-files-label');
    if (addFilesLabel) addFilesLabel.textContent = t('toolbarAddFiles') || 'Add';

    const thOpt = this.appEl.querySelector('#nav-lang-toggle-btn .lang-opt:first-of-type');
    const enOpt = this.appEl.querySelector('#nav-lang-toggle-btn .lang-opt:last-of-type');
    if (thOpt && enOpt) {
      thOpt.classList.toggle('active', lang === 'th');
      enOpt.classList.toggle('active', lang === 'en');
    }

    const installBtn = this.appEl.querySelector('#nav-install-btn');
    if (installBtn) {
      installBtn.setAttribute('title', t('navInstall'));
      const span = installBtn.querySelector('span');
      if (span) span.textContent = t('navInstall');
    }
    const exportLabel = this.appEl.querySelector('#nav-export-label');
    if (exportLabel) {
      exportLabel.textContent =
        this.pages.length > 0
          ? t('navExportCount', { count: this.pages.length })
          : t('navExport');
    }

    const dropzoneTitle = this.appEl.querySelector('#dropzone-title-el');
    if (dropzoneTitle) dropzoneTitle.textContent = t('dropzoneTitle');

    const dropzoneDesc = this.appEl.querySelector('#dropzone-desc-el');
    if (dropzoneDesc) dropzoneDesc.textContent = t('dropzoneDesc');

    const dropzoneSelect = this.appEl.querySelector('#dropzone-select-label');
    if (dropzoneSelect) dropzoneSelect.textContent = t('dropzoneSelectBtn');

    const dropzoneZero = this.appEl.querySelector('#dropzone-zero-upload-label');
    if (dropzoneZero) dropzoneZero.textContent = t('dropzoneZeroUpload');

    const dropzoneUnlimited = this.appEl.querySelector('#dropzone-unlimited-label');
    if (dropzoneUnlimited) dropzoneUnlimited.textContent = t('dropzoneUnlimitedSize');

    const dropzoneFormats = this.appEl.querySelector('#dropzone-formats-label');
    if (dropzoneFormats) dropzoneFormats.textContent = t('dropzoneSupportedFormats');

    this.cockpitFilmstrip?.render();
    this.cockpitCanvas?.render();
    this.cockpitInspector?.render();
    this.toolbar?.render();
    this.toolbar?.setAuthenticated(authService.isAuthenticated());
    this.visualGrid?.setPages(this.pages);
    this.userAccountMenu?.render();
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new MePdfApp();
});

if ('serviceWorker' in navigator) {
  registerSW({
    immediate: true,
    onNeedRefresh() {
      toast.show('New version available. Reload to update.', 'info');
    },
    onOfflineReady() {
      toast.show('mePDF is ready for offline use!', 'success');
    },
  });
}
