import {
  createIcons,
  X,
  ZoomIn,
  ZoomOut,
  RotateCw,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Minimize2,
  FileText,
} from 'lucide';
import type { PDFPageItem, DocumentMetadata } from '../core/types';
import { loadPdfDocument, destroyPdfDocument, renderPageToCanvas } from '../core/pdf-renderer';
import { t } from '../core/i18n';

export class LightboxModal {
  private overlay: HTMLElement | null = null;
  private canvasContainer: HTMLElement | null = null;
  private currentCanvas: HTMLCanvasElement | null = null;
  private pages: PDFPageItem[] = [];
  private documents: Map<string, DocumentMetadata> = new Map();
  private currentIndex = 0;
  private currentZoom = 1.0;
  private currentRotation = 0;
  private isRendering = false;
  private isOpenState = false;

  // Panning state
  private isPanning = false;
  private startX = 0;
  private startY = 0;
  private translateX = 0;
  private translateY = 0;

  constructor() {
    this.ensureElements();
  }

  private ensureElements(): boolean {
    if (typeof document === 'undefined') return false;
    if (!this.overlay) {
      let el = document.querySelector<HTMLElement>('#app-lightbox-overlay');
      if (!el) {
        el = document.createElement('div');
        el.id = 'app-lightbox-overlay';
        el.className = 'lightbox-overlay';
        el.innerHTML = `
          <div class="lightbox-header">
            <div class="lightbox-title-section">
              <i data-lucide="file-text" style="width: 18px; height: 18px; color: var(--primary);"></i>
              <span id="lightbox-doc-title" class="lightbox-doc-name"></span>
              <span class="lightbox-hi-res-tag">High-Res Vector</span>
            </div>
            
            <div class="lightbox-toolbar">
              <button class="btn btn-secondary btn-icon-only lightbox-tool-btn" id="lightbox-zoom-out-btn" title="${t('lightboxZoomOut')}">
                <i data-lucide="zoom-out" style="width: 16px; height: 16px;"></i>
              </button>
              <span id="lightbox-zoom-level" class="lightbox-zoom-label">100%</span>
              <button class="btn btn-secondary btn-icon-only lightbox-tool-btn" id="lightbox-zoom-in-btn" title="${t('lightboxZoomIn')}">
                <i data-lucide="zoom-in" style="width: 16px; height: 16px;"></i>
              </button>
              <button class="btn btn-secondary btn-icon-only lightbox-tool-btn" id="lightbox-fit-btn" title="${t('lightboxFitPage')}">
                <i data-lucide="maximize-2" style="width: 16px; height: 16px;"></i>
              </button>
              <div class="toolbar-divider" style="height: 20px;"></div>
              <button class="btn btn-secondary btn-icon-only lightbox-tool-btn" id="lightbox-rotate-btn" title="${t('lightboxRotate')}">
                <i data-lucide="rotate-cw" style="width: 16px; height: 16px;"></i>
              </button>
              <div class="toolbar-divider" style="height: 20px;"></div>
              <button class="btn btn-ghost btn-icon-only lightbox-close-btn" id="lightbox-close-btn" title="${t('lightboxClose')}">
                <i data-lucide="x" style="width: 20px; height: 20px;"></i>
              </button>
            </div>
          </div>

          <div class="lightbox-viewport" id="lightbox-viewport">
            <button class="lightbox-nav-btn prev-btn" id="lightbox-prev-btn" title="${t('lightboxPrevPage')}">
              <i data-lucide="chevron-left" style="width: 24px; height: 24px;"></i>
            </button>

            <div class="lightbox-canvas-wrapper" id="lightbox-canvas-wrapper">
              <div class="lightbox-spinner" id="lightbox-spinner">
                <div class="spinner-circle"></div>
              </div>
            </div>

            <button class="lightbox-nav-btn next-btn" id="lightbox-next-btn" title="${t('lightboxNextPage')}">
              <i data-lucide="chevron-right" style="width: 24px; height: 24px;"></i>
            </button>
          </div>

          <div class="lightbox-footer">
            <span id="lightbox-page-counter">Page 1 of 1</span>
            <span class="lightbox-hint-text">${t('lightboxFineTextHint')}</span>
          </div>
        `;
        document.body.appendChild(el);
      }

      this.overlay = el;
      this.canvasContainer = el.querySelector('#lightbox-canvas-wrapper');

      this.attachEvents();
      this.refreshIcons();
    }
    return true;
  }

  private refreshIcons(): void {
    if (typeof document === 'undefined') return;
    createIcons({
      icons: {
        X,
        ZoomIn,
        ZoomOut,
        RotateCw,
        ChevronLeft,
        ChevronRight,
        Maximize2,
        Minimize2,
        FileText,
      },
      nameAttr: 'data-lucide',
    });
  }

  private attachEvents(): void {
    if (!this.overlay) return;

    // Close button
    this.overlay.querySelector('#lightbox-close-btn')?.addEventListener('click', () => this.close());

    // Navigation buttons
    this.overlay.querySelector('#lightbox-prev-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.prevPage();
    });
    this.overlay.querySelector('#lightbox-next-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.nextPage();
    });

    // Zoom buttons
    this.overlay.querySelector('#lightbox-zoom-in-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.zoom(0.25);
    });
    this.overlay.querySelector('#lightbox-zoom-out-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.zoom(-0.25);
    });
    this.overlay.querySelector('#lightbox-fit-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.resetZoom();
    });
    this.overlay.querySelector('#lightbox-rotate-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.rotate(90);
    });

    // Background click to close when clicking outside the canvas
    this.overlay.addEventListener('click', (e) => {
      const viewport = this.overlay?.querySelector('#lightbox-viewport');
      if (e.target === this.overlay || (viewport && e.target === viewport)) {
        this.close();
      }
    });

    // Mouse wheel zoom
    this.overlay.addEventListener('wheel', (e) => {
      if (!this.isOpenState) return;
      e.preventDefault();
      const delta = e.deltaY < 0 ? 0.15 : -0.15;
      this.zoom(delta);
    }, { passive: false });

    // Drag to pan when zoomed
    const viewport = this.overlay.querySelector<HTMLElement>('#lightbox-viewport');
    if (viewport) {
      viewport.addEventListener('mousedown', (e) => {
        if (e.target === this.currentCanvas || e.target === this.canvasContainer) {
          this.isPanning = true;
          this.startX = e.clientX - this.translateX;
          this.startY = e.clientY - this.translateY;
          if (viewport) viewport.style.cursor = 'grabbing';
        }
      });

      window.addEventListener('mousemove', (e) => {
        if (!this.isPanning) return;
        this.translateX = e.clientX - this.startX;
        this.translateY = e.clientY - this.startY;
        this.updateTransform();
      });

      window.addEventListener('mouseup', () => {
        if (this.isPanning) {
          this.isPanning = false;
          if (viewport) viewport.style.cursor = 'default';
        }
      });
    }

    // Keyboard shortcuts
    window.addEventListener('keydown', (e) => {
      if (!this.isOpenState) return;

      if (e.key === 'Escape') {
        e.preventDefault();
        this.close();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        this.prevPage();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        this.nextPage();
      } else if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        this.zoom(0.25);
      } else if (e.key === '-' || e.key === '_') {
        e.preventDefault();
        this.zoom(-0.25);
      } else if (e.key === '0') {
        e.preventDefault();
        this.resetZoom();
      } else if (e.key.toLowerCase() === 'r') {
        e.preventDefault();
        this.rotate(90);
      }
    });
  }

  isOpen(): boolean {
    return this.isOpenState;
  }

  open(pageId: string, pages: PDFPageItem[], documents: Map<string, DocumentMetadata>): void {
    if (!this.ensureElements() || pages.length === 0) return;

    this.pages = pages;
    this.documents = documents;

    const targetIdx = pages.findIndex((p) => p.id === pageId);
    this.currentIndex = targetIdx >= 0 ? targetIdx : 0;

    const activePage = this.pages[this.currentIndex];
    this.currentRotation = activePage ? activePage.rotation : 0;
    this.currentZoom = 1.0;
    this.translateX = 0;
    this.translateY = 0;

    this.isOpenState = true;
    this.overlay?.classList.add('active');
    this.renderCurrentPage();
  }

  close(): void {
    if (this.overlay) {
      this.overlay.classList.remove('active');
    }
    this.isOpenState = false;
    this.cleanupCanvas();
  }

  private prevPage(): void {
    if (this.currentIndex > 0) {
      this.currentIndex--;
      const activePage = this.pages[this.currentIndex];
      this.currentRotation = activePage ? activePage.rotation : 0;
      this.currentZoom = 1.0;
      this.translateX = 0;
      this.translateY = 0;
      this.renderCurrentPage();
    }
  }

  private nextPage(): void {
    if (this.currentIndex < this.pages.length - 1) {
      this.currentIndex++;
      const activePage = this.pages[this.currentIndex];
      this.currentRotation = activePage ? activePage.rotation : 0;
      this.currentZoom = 1.0;
      this.translateX = 0;
      this.translateY = 0;
      this.renderCurrentPage();
    }
  }

  private zoom(delta: number): void {
    const newZoom = Math.min(Math.max(0.4, this.currentZoom + delta), 4.0);
    this.currentZoom = Math.round(newZoom * 100) / 100;
    this.updateZoomLabel();
    this.updateTransform();
  }

  private resetZoom(): void {
    this.currentZoom = 1.0;
    this.translateX = 0;
    this.translateY = 0;
    this.updateZoomLabel();
    this.updateTransform();
  }

  private rotate(deg: number): void {
    this.currentRotation = (this.currentRotation + deg) % 360;
    this.renderCurrentPage();
  }

  private updateZoomLabel(): void {
    const label = this.overlay?.querySelector('#lightbox-zoom-level');
    if (label) {
      label.textContent = `${Math.round(this.currentZoom * 100)}%`;
    }
  }

  private updateTransform(): void {
    if (this.currentCanvas) {
      this.currentCanvas.style.transform = `translate(${this.translateX}px, ${this.translateY}px) scale(${this.currentZoom})`;
    }
  }

  private cleanupCanvas(): void {
    if (this.currentCanvas) {
      this.currentCanvas.width = 0;
      this.currentCanvas.height = 0;
      this.currentCanvas.remove();
      this.currentCanvas = null;
    }
  }

  private async renderCurrentPage(): Promise<void> {
    if (this.isRendering || !this.overlay) return;
    const page = this.pages[this.currentIndex];
    if (!page) return;

    const doc = this.documents.get(page.docId);
    if (!doc) return;

    this.isRendering = true;

    // Update UI elements
    const titleEl = this.overlay.querySelector('#lightbox-doc-title');
    if (titleEl) {
      titleEl.textContent = `${page.docName} — ${t('cardPagePrefix', { num: page.displayPageNumber })}`;
    }

    const counterEl = this.overlay.querySelector('#lightbox-page-counter');
    if (counterEl) {
      counterEl.textContent = t('lightboxPageCounter', {
        current: this.currentIndex + 1,
        total: this.pages.length,
      });
    }

    const prevBtn = this.overlay.querySelector<HTMLButtonElement>('#lightbox-prev-btn');
    if (prevBtn) prevBtn.disabled = this.currentIndex === 0;

    const nextBtn = this.overlay.querySelector<HTMLButtonElement>('#lightbox-next-btn');
    if (nextBtn) nextBtn.disabled = this.currentIndex === this.pages.length - 1;

    const spinner = this.overlay.querySelector<HTMLElement>('#lightbox-spinner');
    if (spinner) spinner.style.display = 'flex';

    this.updateZoomLabel();

    try {
      const pdfDoc = await loadPdfDocument(doc.fileBytes, doc.password);
      try {
        // High-resolution scale: 2.5x base resolution for fine print readability
        const canvas = await renderPageToCanvas(
          pdfDoc,
          page.displayPageNumber,
          2.5,
          this.currentRotation
        );

        this.cleanupCanvas();

        canvas.className = 'lightbox-canvas';
        this.currentCanvas = canvas;
        this.canvasContainer?.appendChild(canvas);

        this.updateTransform();
      } finally {
        await destroyPdfDocument(pdfDoc);
      }
    } catch (err) {
      console.error('Failed to render lightbox high-res page:', err);
    } finally {
      if (spinner) spinner.style.display = 'none';
      this.isRendering = false;
    }
  }
}

export const lightbox = new LightboxModal();
