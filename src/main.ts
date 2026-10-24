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
  Scissors,
  Globe,
  Lock,
  Stamp,
  Hash,
  Tag,
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
import { mergePages, imagesToPdf } from './core/pdf-operations';
import { readFileAsUint8Array, downloadBytes } from './utils/file-utils';
import { Toolbar } from './components/Toolbar';
import { VisualGrid } from './components/VisualGrid';
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

class MePdfApp {
  private appEl: HTMLElement;
  private documents = new Map<string, DocumentMetadata>();
  private pages: PDFPageItem[] = [];
  private toolbar: Toolbar | null = null;
  private visualGrid: VisualGrid | null = null;
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

    this.renderShell();
    this.initEventListeners();
    this.initRouterAndStorage();
    this.updateUI();
  }

  private renderShell(): void {
    const lang = getLanguage();
    this.appEl.innerHTML = `
      <header class="navbar">
        <div class="brand-section">
          <div class="brand-logo">
            <span>mePDF</span>
          </div>
          <span class="brand-badge" id="brand-badge-el">${t('brandBadge')}</span>
        </div>

        <nav class="nav-tabs">
          <button class="nav-tab-btn active" data-tab="studio">
            <i data-lucide="layers" style="width: 15px; height: 15px;"></i>
            <span>${t('tabStudio')}</span>
          </button>
          <button class="nav-tab-btn" data-tab="split">
            <i data-lucide="scissors" style="width: 15px; height: 15px;"></i>
            <span>${t('tabSplit')}</span>
          </button>
          <button class="nav-tab-btn" data-tab="compress">
            <i data-lucide="minimize-2" style="width: 15px; height: 15px;"></i>
            <span>${t('tabCompress')}</span>
          </button>
          <button class="nav-tab-btn" data-tab="protect">
            <i data-lucide="lock" style="width: 15px; height: 15px;"></i>
            <span>${t('tabProtect')}</span>
          </button>
          <button class="nav-tab-btn" data-tab="watermark">
            <i data-lucide="stamp" style="width: 15px; height: 15px;"></i>
            <span>${t('tabWatermark')}</span>
          </button>
          <button class="nav-tab-btn" data-tab="page-numbers">
            <i data-lucide="hash" style="width: 15px; height: 15px;"></i>
            <span>${t('tabNumbering')}</span>
          </button>
          <button class="nav-tab-btn" data-tab="metadata">
            <i data-lucide="tag" style="width: 15px; height: 15px;"></i>
            <span>${t('tabMetadata')}</span>
          </button>
          <button class="nav-tab-btn" data-tab="img2pdf">
            <i data-lucide="image" style="width: 15px; height: 15px;"></i>
            <span>${t('tabImg2Pdf')}</span>
          </button>
          <button class="nav-tab-btn" data-tab="pdf2img">
            <i data-lucide="image" style="width: 15px; height: 15px;"></i>
            <span>${t('tabPdf2Img')}</span>
          </button>
          <button class="nav-tab-btn" data-tab="extract-text">
            <i data-lucide="file-text" style="width: 15px; height: 15px;"></i>
            <span>${t('tabExtractText')}</span>
          </button>
        </nav>

        <div class="nav-actions">
          <div id="nav-user-account-container"></div>

          <button class="lang-switcher-btn" id="nav-lang-toggle-btn" title="Switch Language / สลับภาษา">
            <i data-lucide="globe" style="width: 14px; height: 14px;"></i>
            <span class="lang-opt ${lang === 'th' ? 'active' : ''}">TH</span>
            <span class="lang-sep">/</span>
            <span class="lang-opt ${lang === 'en' ? 'active' : ''}">EN</span>
          </button>

          <button class="btn btn-secondary" id="nav-install-btn" style="display: none;" title="${t('navInstall')}">
            <i data-lucide="download-cloud" style="width: 15px; height: 15px;"></i>
            <span>${t('navInstall')}</span>
          </button>
          <button class="btn btn-primary" id="nav-export-btn" title="${t('navExport')} (Ctrl+S)">
            <i data-lucide="download" style="width: 16px; height: 16px;"></i>
            <span id="nav-export-label">${t('navExport')}</span>
          </button>
        </div>
      </header>

      <main class="workspace-main" id="workspace-main">
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

        <div id="workspace-controls" style="display: none;"></div>
        <div id="workspace-grid" style="display: none;"></div>
      </main>
    `;

    this.refreshIcons();
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
        Scissors,
        Globe,
        Lock,
        Stamp,
        Hash,
        Tag,
      },
      nameAttr: 'data-lucide',
    });
  }

  private initEventListeners(): void {
    // Browse buttons
    const browseBtn = this.appEl.querySelector('#dropzone-browse-btn');
    browseBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
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

    // Navigation tabs
    const tabBtns = this.appEl.querySelectorAll<HTMLButtonElement>('.nav-tab-btn');
    tabBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const tab = btn.getAttribute('data-tab');
        this.handleTabSwitch(tab);
      });
    });

    // Language toggle button
    const langToggleBtn = this.appEl.querySelector('#nav-lang-toggle-btn');
    langToggleBtn?.addEventListener('click', () => {
      const nextLang = getLanguage() === 'th' ? 'en' : 'th';
      setLanguage(nextLang);
      toast.show(t('toastLanguageSwitched'), 'info');
    });

    // Keyboard shortcuts
    window.addEventListener('keydown', (e) => {
      // Inhibit all workspace keyboard shortcuts when any modal dialog, progress overlay, or lightbox is active
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

    // PWA Install Prompt & Network Status Listeners
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

    // Initialize sub-components
    const accountContainer = this.appEl.querySelector<HTMLElement>('#nav-user-account-container');
    if (accountContainer) {
      this.userAccountMenu = new UserAccountMenu(accountContainer, {
        onOpenCloudLibrary: () => {
          cloudLibraryModal.open();
        },
        onOpenAuthModal: () => {
          authModal.open();
        },
      });
    }

    cloudLibraryModal.setOptions({
      onOpenInStudio: async (doc, bytes) => this.loadCloudDocument(doc, bytes),
      onClose: () => this.resetNavTabToStudio(),
    });

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

          // Render thumbnails for each page
          for (let pNum = 1; pNum <= pageCount; pNum++) {
            progressOverlay.update({
              stage: `Rendering thumbnails for ${file.name}`,
              current: pNum,
              total: pageCount,
              percent: Math.round((pNum / pageCount) * 100),
            });

            const { dataUrl, width, height } = await renderPageThumbnail(
              pdfDoc,
              pNum,
              0,
              320,
              docId
            );

            const pageItem: PDFPageItem = {
              id: `${docId}_p${pNum}`,
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
      this.updateUI();

      // Trigger any action that was pending file selection
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
  // WORKSPACE ACTIONS
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
    const controlsContainer = this.appEl.querySelector<HTMLElement>('#workspace-controls')!;
    const gridContainer = this.appEl.querySelector<HTMLElement>('#workspace-grid')!;
    const exportBtn = this.appEl.querySelector<HTMLButtonElement>('#nav-export-btn')!;
    const exportLabel = this.appEl.querySelector<HTMLElement>('#nav-export-label')!;

    if (hasPages) {
      dropzoneArea.style.display = 'none';
      controlsContainer.style.display = 'block';
      gridContainer.style.display = 'block';
      exportBtn.disabled = false;
      exportBtn.style.opacity = '1';

      const selectedCount = this.pages.filter((p) => p.selected).length;
      exportLabel.textContent = t('navExportCount', { count: this.pages.length });
      this.toolbar?.updateState(this.pages.length, selectedCount);
      this.visualGrid?.setPages(this.pages);
    } else {
      dropzoneArea.style.display = 'flex';
      controlsContainer.style.display = 'none';
      gridContainer.style.display = 'none';
      exportBtn.disabled = true;
      exportBtn.style.opacity = '0.5';
      exportLabel.textContent = t('navExport');
      this.visualGrid?.setPages([]);
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
      this.rotateAll(degrees);
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

    // Dismiss previous undo toast if active
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
    if (selectedCount === 0) return;

    const docIds = new Set(selectedPagesWithIndices.map((item) => item.page.docId));
    const docsToKeep = Array.from(docIds)
      .map((id) => this.documents.get(id))
      .filter((d): d is DocumentMetadata => Boolean(d));

    // Dismiss previous undo toast if active
    if (this.activeUndoToast) {
      this.activeUndoToast.dismiss();
      this.activeUndoToast = null;
    }

    this.undoStack.push({
      pages: selectedPagesWithIndices,
      documents: docsToKeep,
    });
    if (this.undoStack.length > 20) {
      this.undoStack.shift();
    }

    this.pages = this.pages.filter((p) => !p.selected);
    this.pruneUnusedDocuments();
    this.updateUI();

    this.activeUndoToast = toast.showAction(
      t('toastPagesRemoved', { count: selectedCount }),
      t('toastUndo'),
      () => this.undoDelete()
    );
  }

  private undoDelete(): void {
    if (this.activeUndoToast) {
      this.activeUndoToast.dismiss();
      this.activeUndoToast = null;
    }

    const state = this.undoStack.pop();
    if (!state || state.pages.length === 0) return;

    const { pages, documents } = state;

    // Restore document metadata if pruned
    for (const doc of documents) {
      if (!this.documents.has(doc.id)) {
        this.documents.set(doc.id, doc);
      }
    }

    // Restore pages at their indices, sorted ascending
    const sorted = [...pages].sort((a, b) => a.index - b.index);
    for (const { page, index } of sorted) {
      const insertAt = Math.min(Math.max(0, index), this.pages.length);
      this.pages.splice(insertAt, 0, page);
    }

    const count = sorted.length;
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
      const mergedBytes = await mergePages(this.pages, this.documents, (info) => {
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
      this.setActiveNavTab('studio');
      setHashRoute('studio');
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

    // Generate exact merged document representing current workspace state
    progressOverlay.show('Preparing workspace document...');
    const mergedBytes = await mergePages(this.pages, this.documents, (info) => {
      progressOverlay.update(info);
    });
    progressOverlay.hide();

    const baseName = isSingleDoc ? firstDoc.filename : 'mepdf_workspace.pdf';
    return { docBytes: mergedBytes, docName: baseName, password: isSingleDoc ? firstDoc.password : undefined };
  }

  // ==========================================
  // TOP NAV TAB ACTIONS & ROUTING
  // ==========================================
  private setActiveNavTab(tabName: string): void {
    const tabBtns = this.appEl.querySelectorAll<HTMLButtonElement>('.nav-tab-btn');
    tabBtns.forEach((btn) => {
      btn.classList.toggle('active', btn.getAttribute('data-tab') === tabName);
    });
  }

  private resetNavTabToStudio(): void {
    this.setActiveNavTab('studio');
    setHashRoute('studio');
  }

  private async handleTabSwitch(tab: string | null): Promise<void> {
    if (!tab) return;

    if (tab === 'studio') {
      this.setActiveNavTab('studio');
      setHashRoute('studio');
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
      this.setActiveNavTab('split');
      setHashRoute('split');
      this.openSplitModal();
      return;
    }

    if (tab === 'img2pdf') {
      this.setActiveNavTab('img2pdf');
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
        toast.show(`Added ${imageFiles.length} images to Visual Studio!`, 'success');
      });
      return;
    }

    // For tools requiring an existing document or file
    if (this.pages.length === 0) {
      this.pendingAction = tab;
      toast.show(t('toastSelectDocFirst'), 'info');
      this.fileInput.click();
      return;
    }

    try {
      const { docBytes, docName, password } = await this.getActiveDocumentBytes();
      this.setActiveNavTab(tab);
      setHashRoute(tab as ToolRoute);
      modal.setOnClose(() => this.resetNavTabToStudio());

      if (tab === 'compress') {
        modal.showCompressModal(docBytes, docName, password);
      } else if (tab === 'protect') {
        modal.showProtectModal(docBytes, docName);
      } else if (tab === 'watermark') {
        modal.showWatermarkModal(docBytes, docName);
      } else if (tab === 'page-numbers') {
        modal.showPageNumberModal(docBytes, docName);
      } else if (tab === 'metadata') {
        await modal.showMetadataModal(docBytes, docName);
      } else if (tab === 'pdf2img') {
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

    // Restore session from IndexedDB if available
    try {
      const restored = await loadWorkspaceState();
      if (restored && restored.pages.length > 0) {
        this.documents.clear();
        for (const doc of restored.documents) {
          this.documents.set(doc.id, doc);
        }
        this.pages = restored.pages;
        this.updateUI();
        toast.show(t('toastSessionRestored'), 'info');
      }
    } catch (err) {
      console.warn('Failed to restore workspace session:', err);
    }

    // Handle initial route on landing
    const initialRoute = getCurrentRoute();
    if (initialRoute && initialRoute !== 'studio') {
      await this.handleTabSwitch(initialRoute);
    }
  }

  private handleLanguageChanged(): void {
    const lang = getLanguage();

    // Update Brand badge
    const badge = this.appEl.querySelector('#brand-badge-el');
    if (badge) badge.textContent = t('brandBadge');

    // Update Navbar tab labels
    const tabMap: Record<string, string> = {
      studio: t('tabStudio'),
      split: t('tabSplit'),
      compress: t('tabCompress'),
      protect: t('tabProtect'),
      watermark: t('tabWatermark'),
      'page-numbers': t('tabNumbering'),
      metadata: t('tabMetadata'),
      img2pdf: t('tabImg2Pdf'),
      pdf2img: t('tabPdf2Img'),
      'extract-text': t('tabExtractText'),
    };
    this.appEl.querySelectorAll<HTMLButtonElement>('.nav-tab-btn').forEach((btn) => {
      const tab = btn.getAttribute('data-tab');
      const span = btn.querySelector('span');
      if (tab && span && tabMap[tab]) {
        span.textContent = tabMap[tab];
      }
    });

    // Update language toggle indicators
    const thOpt = this.appEl.querySelector('#nav-lang-toggle-btn .lang-opt:first-of-type');
    const enOpt = this.appEl.querySelector('#nav-lang-toggle-btn .lang-opt:last-of-type');
    if (thOpt && enOpt) {
      thOpt.classList.toggle('active', lang === 'th');
      enOpt.classList.toggle('active', lang === 'en');
    }

    // Update Install and Export buttons
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

    // Update Dropzone texts
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

    // Re-render Toolbar, VisualGrid, and UserAccountMenu
    this.toolbar?.render();
    this.toolbar?.setAuthenticated(authService.isAuthenticated());
    this.visualGrid?.setPages(this.pages);
    this.userAccountMenu?.render();
  }
}

// Initialize application on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  new MePdfApp();
});

// Register PWA Service Worker for 100% offline access
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
