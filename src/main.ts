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

class MePdfApp {
  private appEl: HTMLElement;
  private documents = new Map<string, DocumentMetadata>();
  private pages: PDFPageItem[] = [];
  private toolbar: Toolbar | null = null;
  private visualGrid: VisualGrid | null = null;
  private fileInput: HTMLInputElement;
  private pendingAction: string | null = null;

  constructor() {
    this.appEl = document.querySelector<HTMLElement>('#app')!;
    this.fileInput = document.createElement('input');
    this.fileInput.type = 'file';
    this.fileInput.multiple = true;
    this.fileInput.accept = '.pdf,image/*';
    this.fileInput.style.display = 'none';
    document.body.appendChild(this.fileInput);

    this.renderShell();
    this.initEventListeners();
    this.updateUI();
  }

  private renderShell(): void {
    this.appEl.innerHTML = `
      <header class="navbar">
        <div class="brand-section">
          <div class="brand-logo">
            <span>mePDF</span>
          </div>
          <span class="brand-badge">Pure Client-Side</span>
        </div>

        <nav class="nav-tabs">
          <button class="nav-tab-btn active" data-tab="studio">
            <i data-lucide="layers" style="width: 15px; height: 15px;"></i>
            <span>Visual Studio</span>
          </button>
          <button class="nav-tab-btn" data-tab="compress">
            <i data-lucide="minimize-2" style="width: 15px; height: 15px;"></i>
            <span>Compress</span>
          </button>
          <button class="nav-tab-btn" data-tab="img2pdf">
            <i data-lucide="image" style="width: 15px; height: 15px;"></i>
            <span>Images to PDF</span>
          </button>
          <button class="nav-tab-btn" data-tab="pdf2img">
            <i data-lucide="image" style="width: 15px; height: 15px;"></i>
            <span>PDF to Images</span>
          </button>
          <button class="nav-tab-btn" data-tab="extract-text">
            <i data-lucide="file-text" style="width: 15px; height: 15px;"></i>
            <span>Extract Text</span>
          </button>
        </nav>

        <div class="nav-actions">
          <button class="btn btn-secondary" id="nav-install-btn" style="display: none;" title="Install mePDF Application">
            <i data-lucide="download-cloud" style="width: 15px; height: 15px;"></i>
            <span>Install App</span>
          </button>
          <button class="btn btn-primary" id="nav-export-btn" title="Save & Export PDF (Ctrl+S)">
            <i data-lucide="download" style="width: 16px; height: 16px;"></i>
            <span id="nav-export-label">Export PDF</span>
          </button>
        </div>
      </header>

      <main class="workspace-main" id="workspace-main">
        <div id="dropzone-area" class="dropzone-container">
          <div class="dropzone-icon">
            <i data-lucide="upload" style="width: 36px; height: 36px;"></i>
          </div>
          <h2 class="dropzone-title">Drop PDF or Image files here</h2>
          <p class="dropzone-desc">
            Organize, merge, rotate, split, or compress your documents instantly. All operations happen 100% in your browser.
          </p>
          <button class="btn btn-primary" id="dropzone-browse-btn">
            <i data-lucide="plus" style="width: 16px; height: 16px;"></i>
            <span>Select Files</span>
          </button>
          <div class="dropzone-pills">
            <span class="privacy-pill">
              <i data-lucide="shield-check" style="width: 13px; height: 13px; color: var(--success);"></i>
              Zero server upload • 100% Private
            </span>
            <span class="privacy-pill">Unlimited File Size</span>
            <span class="privacy-pill">PDF, JPG, PNG, WebP</span>
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

    // Keyboard shortcuts
    window.addEventListener('keydown', (e) => {
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
            toast.show('mePDF installed successfully!', 'success');
            installBtn.style.display = 'none';
          }
          deferredInstallPrompt = null;
        };
      }
    });

    window.addEventListener('appinstalled', () => {
      const installBtn = this.appEl.querySelector<HTMLButtonElement>('#nav-install-btn');
      if (installBtn) installBtn.style.display = 'none';
      toast.show('mePDF is installed and ready for offline use!', 'success');
    });

    window.addEventListener('offline', () => {
      toast.show('Offline mode active. All mePDF tools work 100% locally!', 'info');
    });

    window.addEventListener('online', () => {
      toast.show('Internet connection restored.', 'info');
    });

    // Initialize sub-components
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
    });

    this.visualGrid = new VisualGrid(gridContainer, {
      onToggleSelect: (pageId) => this.togglePageSelect(pageId),
      onRotatePage: (pageId, deg) => this.rotateSinglePage(pageId, deg),
      onDeletePage: (pageId) => this.deleteSinglePage(pageId),
      onReorder: (from, to) => this.reorderPages(from, to),
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
      toast.show('Please upload PDF or Image files.', 'error');
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
        let pdfDoc;
        try {
          pdfDoc = await loadPdfDocument(bytes);
        } catch (err: unknown) {
          const isPassword =
            (err && typeof err === 'object' && 'name' in err && (err as { name?: string }).name === 'PasswordException') ||
            (err instanceof Error && /password/i.test(err.message));
          if (isPassword) {
            progressOverlay.hide();
            const password = await new Promise<string>((resolve, reject) => {
              modal.showPasswordPromptModal(
                file.name,
                (pwd) => resolve(pwd),
                () => reject(new Error('Password prompt cancelled'))
              );
            });
            progressOverlay.show(`Unlocking ${file.name}...`);
            pdfDoc = await loadPdfDocument(bytes, password);
          } else {
            throw err;
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
      toast.show(`Imported ${this.pages.length} pages successfully!`, 'success');
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
      exportLabel.textContent = `Export PDF (${this.pages.length})`;
      this.toolbar?.updateState(this.pages.length, selectedCount);
      this.visualGrid?.setPages(this.pages);
    } else {
      dropzoneArea.style.display = 'flex';
      controlsContainer.style.display = 'none';
      gridContainer.style.display = 'none';
      exportBtn.disabled = true;
      exportBtn.style.opacity = '0.5';
      exportLabel.textContent = 'Export PDF';
      this.visualGrid?.setPages([]);
    }
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
    toast.show(`Rotated all ${this.pages.length} pages (+${degrees}°)`, 'info');
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

    toast.show(`Rotated ${selectedPages.length} selected ${selectedPages.length === 1 ? 'page' : 'pages'} (+${degrees}°)`, 'info');
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
    this.pages = this.pages.filter((p) => p.id !== pageId);
    this.pruneUnusedDocuments();
    toast.show('Page removed', 'info');
    this.updateUI();
  }

  private deleteSelected(): void {
    const selectedCount = this.pages.filter((p) => p.selected).length;
    if (selectedCount === 0) return;

    this.pages = this.pages.filter((p) => !p.selected);
    this.pruneUnusedDocuments();
    toast.show(`Removed ${selectedCount} ${selectedCount === 1 ? 'page' : 'pages'}`, 'info');
    this.updateUI();
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
      'Clear Workspace',
      'Are you sure you want to clear all pages from the workspace? All uploaded documents and edits will be removed.',
      () => {
        this.pages = [];
        this.documents.clear();
        clearThumbnailCache();
        this.updateUI();
        toast.show('Workspace cleared', 'info');
      },
      'Clear All',
      true
    );
  }

  // ==========================================
  // EXPORT / SAVE PIPELINE
  // ==========================================
  private async exportCurrentDocument(): Promise<void> {
    if (this.pages.length === 0) {
      toast.show('No pages to export.', 'info');
      return;
    }

    try {
      progressOverlay.show('Merging and building PDF...');
      const mergedBytes = await mergePages(this.pages, this.documents, (info) => {
        progressOverlay.update(info);
      });
      progressOverlay.hide();

      let exportFilename = 'mepdf_merged.pdf';
      if (this.documents.size === 1) {
        const doc = this.documents.values().next().value;
        if (doc?.filename) {
          exportFilename = `${doc.filename.replace(/\.pdf$/i, '')}_edited.pdf`;
        }
      }

      downloadBytes(mergedBytes, exportFilename);
      toast.show(`Exported ${this.pages.length} pages successfully!`, 'success');
    } catch (err: unknown) {
      progressOverlay.hide();
      const msg = err instanceof Error ? err.message : String(err);
      toast.show(`Export failed: ${msg}`, 'error');
    }
  }

  private openSplitModal(): void {
    if (this.pages.length < 2) {
      toast.show('At least 2 pages are required to split.', 'info');
      return;
    }
    modal.showSplitModal(this.pages, this.documents, 'mepdf');
  }

  // ==========================================
  // ACTIVE DOCUMENT RESOLVER
  // ==========================================
  private async getActiveDocumentBytes(): Promise<{ docBytes: Uint8Array; docName: string }> {
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
      return { docBytes: firstDoc.fileBytes, docName: firstDoc.filename };
    }

    // Generate exact merged document representing current workspace state
    progressOverlay.show('Preparing workspace document...');
    const mergedBytes = await mergePages(this.pages, this.documents, (info) => {
      progressOverlay.update(info);
    });
    progressOverlay.hide();

    const baseName = isSingleDoc ? firstDoc.filename : 'mepdf_workspace.pdf';
    return { docBytes: mergedBytes, docName: baseName };
  }

  // ==========================================
  // TOP NAV TAB ACTIONS
  // ==========================================
  private setActiveNavTab(tabName: string): void {
    const tabBtns = this.appEl.querySelectorAll<HTMLButtonElement>('.nav-tab-btn');
    tabBtns.forEach((btn) => {
      btn.classList.toggle('active', btn.getAttribute('data-tab') === tabName);
    });
  }

  private resetNavTabToStudio(): void {
    this.setActiveNavTab('studio');
  }

  private async handleTabSwitch(tab: string | null): Promise<void> {
    if (!tab) return;

    if (tab === 'studio') {
      this.setActiveNavTab('studio');
      return;
    }

    if (tab === 'img2pdf') {
      this.setActiveNavTab('img2pdf');
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
      toast.show('Please select a PDF document first.', 'info');
      this.fileInput.click();
      return;
    }

    try {
      const { docBytes, docName } = await this.getActiveDocumentBytes();
      this.setActiveNavTab(tab);
      modal.setOnClose(() => this.resetNavTabToStudio());

      if (tab === 'compress') {
        modal.showCompressModal(docBytes, docName);
      } else if (tab === 'pdf2img') {
        modal.showPdfToImagesModal(docBytes, docName);
      } else if (tab === 'extract-text') {
        await modal.showExtractTextModal(docBytes, docName);
      }
    } catch (err: unknown) {
      this.resetNavTabToStudio();
      progressOverlay.hide();
      const msg = err instanceof Error ? err.message : String(err);
      toast.show(`Failed to prepare document: ${msg}`, 'error');
    }
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
