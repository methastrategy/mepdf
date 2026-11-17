import {
  createIcons,
  RotateCw,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  Maximize2,
  FileText,
  FolderOpen,
  Upload,
  ShieldCheck,
  Image,
  Command,
  Move,
} from 'lucide';
import type { PDFPageItem } from '../core/types';
import { escapeHtml } from '../utils/file-utils';
import { t, getLanguage } from '../core/i18n';

export interface WatermarkPreviewState {
  enabled: boolean;
  text: string;
  fontSize: number;
  opacity: number;
  color: string;
  rotation: number;
  repeat: boolean;
}

export interface PageNumberPreviewState {
  enabled: boolean;
  format: string;
  position: 'bottom-center' | 'bottom-right' | 'bottom-left' | 'top-center' | 'top-right' | 'top-left';
  margin: number;
  fontSize: number;
  color: string;
}

export interface CockpitCanvasEvents {
  onPrevPage: () => void;
  onNextPage: () => void;
  onRotateActive: (degrees: number) => void;
  onZoomChange?: (zoom: number) => void;
  onOpenLightbox?: () => void;
  onOpenFile?: () => void;
  onImagesToPdf?: () => void;
  onFilesDropped?: (files: File[]) => void;
  maxZoom?: number;
}

export class CockpitCanvas {
  private container: HTMLElement;
  private events: CockpitCanvasEvents;
  private activePage: PDFPageItem | null = null;
  private activeIndex = 0;
  private totalPages = 0;
  private zoom = 1.0;
  private maxZoom = 3.0;
  private panX = 0;
  private panY = 0;

  // Pan & Drag gesture state
  private isPanning = false;
  private spacePressed = false;
  private startX = 0;
  private startY = 0;
  private initialPanX = 0;
  private initialPanY = 0;
  private isGlobalPanListenersBound = false;

  private watermarkPreview: WatermarkPreviewState = {
    enabled: false,
    text: 'CONFIDENTIAL',
    fontSize: 48,
    opacity: 0.25,
    color: '#000000',
    rotation: 45,
    repeat: false,
  };
  private pageNumberPreview: PageNumberPreviewState = {
    enabled: false,
    format: '{n}',
    position: 'bottom-center',
    margin: 30,
    fontSize: 12,
    color: '#000000',
  };

  constructor(container: HTMLElement, events: CockpitCanvasEvents) {
    this.container = container;
    this.events = events;
    if (typeof events.maxZoom === 'number') {
      this.maxZoom = events.maxZoom;
    }
    this.bindGlobalKeyTracking();
  }

  public setMaxZoom(max: number): void {
    this.maxZoom = max;
  }

  public setActivePage(page: PDFPageItem | null, index: number, total: number): void {
    const isDifferentPage = this.activePage?.id !== page?.id;
    this.activePage = page;
    this.activeIndex = index;
    this.totalPages = total;

    // Reset pan position on page change if needed
    if (isDifferentPage) {
      this.panX = 0;
      this.panY = 0;
    }

    this.render();
  }

  public setZoom(zoom: number, resetPan = false): void {
    this.zoom = Math.max(0.25, Math.min(this.maxZoom, zoom));
    if (resetPan) {
      this.panX = 0;
      this.panY = 0;
    }
    this.updateZoomTransform();
    this.events.onZoomChange?.(this.zoom);
  }

  public getZoom(): number {
    return this.zoom;
  }

  public resetPan(): void {
    this.panX = 0;
    this.panY = 0;
    this.updateZoomTransform();
  }

  public fitWidth(): void {
    const viewport = this.container.querySelector<HTMLElement>('#canvas-viewport-stage');
    const sheet = this.container.querySelector<HTMLElement>('#canvas-document-sheet');
    if (viewport && sheet && sheet.clientWidth > 0) {
      const targetZoom = Math.min(this.maxZoom, Math.max(0.25, (viewport.clientWidth - 64) / sheet.clientWidth));
      this.panX = 0;
      this.panY = 0;
      this.setZoom(targetZoom, false);
    } else {
      this.setZoom(1.0, true);
    }
  }

  public fitPage(): void {
    this.setZoom(1.0, true);
  }

  public setWatermarkPreview(state: Partial<WatermarkPreviewState>): void {
    this.watermarkPreview = { ...this.watermarkPreview, ...state };
    this.renderOverlays();
  }

  public setPageNumberPreview(state: Partial<PageNumberPreviewState>): void {
    this.pageNumberPreview = { ...this.pageNumberPreview, ...state };
    this.renderOverlays();
  }

  private bindGlobalKeyTracking(): void {
    if (typeof window === 'undefined' || this.isGlobalPanListenersBound) return;

    window.addEventListener('keydown', (e) => {
      const activeTag = typeof document !== 'undefined' ? document.activeElement?.tagName.toLowerCase() : '';
      if (activeTag === 'input' || activeTag === 'textarea') return;

      if (e.code === 'Space' && !this.spacePressed) {
        this.spacePressed = true;
        const viewport = this.container.querySelector<HTMLElement>('#canvas-viewport-stage');
        if (viewport && this.activePage) {
          viewport.style.cursor = 'grab';
        }
      }
    });

    window.addEventListener('keyup', (e) => {
      if (e.code === 'Space') {
        this.spacePressed = false;
        const viewport = this.container.querySelector<HTMLElement>('#canvas-viewport-stage');
        if (viewport && !this.isPanning) {
          viewport.style.cursor = 'default';
        }
      }
    });

    window.addEventListener('mousemove', (e) => {
      if (!this.isPanning) return;
      const dx = e.clientX - this.startX;
      const dy = e.clientY - this.startY;
      this.panX = this.initialPanX + dx;
      this.panY = this.initialPanY + dy;
      this.updateZoomTransform();
    });

    window.addEventListener('mouseup', () => {
      if (this.isPanning) {
        this.isPanning = false;
        const viewport = this.container.querySelector<HTMLElement>('#canvas-viewport-stage');
        if (viewport) {
          viewport.style.cursor = this.spacePressed ? 'grab' : 'default';
        }
      }
    });

    this.isGlobalPanListenersBound = true;
  }

  public render(): void {
    const lang = getLanguage();

    if (!this.activePage) {
      // IDE-style Desktop Studio Empty State (Startup Workbench)
      this.container.innerHTML = `
        <div class="cockpit-startup-workbench" id="canvas-startup-workbench">
          <div class="workbench-card">
            <div class="workbench-header">
              <div class="workbench-badge">
                <span class="pulse-dot"></span>
                <span>meCraft Studio Desktop</span>
              </div>
              <h2 class="workbench-title">${lang === 'th' ? 'โต๊ะทำงานเอกสาร (Workbench)' : 'Studio Workbench'}</h2>
              <p class="workbench-subtitle">
                ${lang === 'th' 
                  ? 'ระบบจัดการและปรับแต่ง PDF ระดับมืออาชีพ ทำงานในเครื่อง 100% ไร้การส่งข้อมูลออกภายนอก' 
                  : 'High-performance client-side PDF engineering suite. Zero server uploads, maximum privacy.'}
              </p>
            </div>

            <div class="workbench-actions">
              <button class="btn btn-primary btn-lg workbench-btn-main" id="workbench-btn-open">
                <i data-lucide="folder-open" style="width: 18px; height: 18px;"></i>
                <span>${lang === 'th' ? 'เปิดเอกสาร PDF' : 'Open PDF Document'}</span>
                <kbd class="shortcut-tag">Ctrl+O</kbd>
              </button>

              <button class="btn btn-secondary workbench-btn-sub" id="workbench-btn-images">
                <i data-lucide="image" style="width: 16px; height: 16px;"></i>
                <span>${lang === 'th' ? 'แปลงรูปภาพเป็น PDF' : 'Convert Images to PDF'}</span>
              </button>
            </div>

            <!-- Drag & Drop Target Inside Workbench -->
            <div class="workbench-dropzone" id="workbench-dropzone">
              <div class="dropzone-pulse-circle">
                <i data-lucide="upload" style="width: 28px; height: 28px;"></i>
              </div>
              <span class="dropzone-text">
                ${lang === 'th' ? 'หรือลากไฟล์ PDF หรือรูปภาพมาวางที่นี่' : 'or drag & drop PDF files directly anywhere'}
              </span>
              <div class="workbench-guarantee">
                <i data-lucide="shield-check" style="width: 14px; height: 14px; color: var(--success, #10b981);"></i>
                <span>${lang === 'th' ? 'ประมวลผลบนเครื่อง 100% ไร้กังวลเรื่องข้อมูลรั่วไหล' : '100% Private Offline Processing'}</span>
              </div>
            </div>

            <!-- Quick Navigation Hints -->
            <div class="workbench-hints-grid">
              <div class="hint-item">
                <div class="hint-kbd-combo"><kbd>Space</kbd> + <kbd>Drag</kbd></div>
                <span>${lang === 'th' ? 'เลื่อนผืนผ้าใบอิสระ' : 'Pan Canvas'}</span>
              </div>
              <div class="hint-item">
                <div class="hint-kbd-combo"><kbd>Ctrl</kbd> + <kbd>Wheel</kbd></div>
                <span>${lang === 'th' ? 'ซูมเนียนตามจุดเมาส์' : 'Cursor-Focused Zoom'}</span>
              </div>
              <div class="hint-item">
                <div class="hint-kbd-combo"><kbd>Ctrl</kbd> + <kbd>S</kbd></div>
                <span>${lang === 'th' ? 'บันทึกเอกสาร' : 'Save Document'}</span>
              </div>
              <div class="hint-item">
                <div class="hint-kbd-combo"><kbd>F1</kbd> / <kbd>F2</kbd></div>
                <span>${lang === 'th' ? 'สลับมุมมอง Cockpit/Grid' : 'Toggle Views'}</span>
              </div>
            </div>
          </div>
        </div>
      `;

      this.attachStartupEvents();
      this.refreshIcons();
      return;
    }

    const page = this.activePage;
    const rotation = page.rotation % 360;
    const isRotated = rotation === 90 || rotation === 270;
    const pageWidth = isRotated ? page.height : page.width;
    const pageHeight = isRotated ? page.width : page.height;

    // Detect standard page format
    let formatLabel = `${Math.round(pageWidth)} × ${Math.round(pageHeight)} pt`;
    if (Math.abs(pageWidth - 595) < 5 && Math.abs(pageHeight - 842) < 5) {
      formatLabel = 'A4 Portrait';
    } else if (Math.abs(pageWidth - 842) < 5 && Math.abs(pageHeight - 595) < 5) {
      formatLabel = 'A4 Landscape';
    } else if (Math.abs(pageWidth - 612) < 5 && Math.abs(pageHeight - 792) < 5) {
      formatLabel = 'Letter Portrait';
    } else if (Math.abs(pageWidth - 792) < 5 && Math.abs(pageHeight - 612) < 5) {
      formatLabel = 'Letter Landscape';
    }

    const minDim = Math.min(page.width, page.height);
    const maxDim = Math.max(page.width, page.height);
    const imgScale = isRotated && minDim > 0 && maxDim > 0 ? (minDim / maxDim).toFixed(3) : '1';
    const isPortrait = pageHeight >= pageWidth;

    this.container.innerHTML = `
      <div class="cockpit-canvas-inner">
        <!-- Canvas Stage Telemetry Header -->
        <div class="canvas-telemetry-header">
          <div class="telemetry-left">
            <span class="telemetry-badge telemetry-page">
              ${t('cockpitCanvasPage', { current: this.activeIndex + 1, total: this.totalPages }) || `Page ${this.activeIndex + 1} of ${this.totalPages}`}
            </span>
            <span class="telemetry-badge telemetry-format" title="Page Dimensions">
              ${formatLabel}
            </span>
            <span class="telemetry-badge telemetry-doc" title="${escapeHtml(page.docName)}">
              ${escapeHtml(page.docName)}
            </span>
          </div>

          <div class="telemetry-center">
            <button class="telemetry-btn" id="canvas-btn-prev" title="Previous Page (Left Arrow)" ${this.activeIndex <= 0 ? 'disabled' : ''}>
              <i data-lucide="chevron-left" style="width: 15px; height: 15px;"></i>
            </button>
            <span class="telemetry-page-indicator">${this.activeIndex + 1} / ${this.totalPages}</span>
            <button class="telemetry-btn" id="canvas-btn-next" title="Next Page (Right Arrow)" ${this.activeIndex >= this.totalPages - 1 ? 'disabled' : ''}>
              <i data-lucide="chevron-right" style="width: 15px; height: 15px;"></i>
            </button>
          </div>

          <div class="telemetry-right">
            <button class="telemetry-btn" id="canvas-btn-pan-reset" title="Reset Pan Position" style="font-size: 11px;">
              <i data-lucide="move" style="width: 13px; height: 13px;"></i>
            </button>
            <button class="telemetry-btn" id="canvas-btn-rotate" title="${t('cardRotateCw') || 'Rotate 90° (Ctrl+R)'}">
              <i data-lucide="rotate-cw" style="width: 14px; height: 14px;"></i>
              <span class="btn-text-sm">90°</span>
            </button>
            <div class="telemetry-separator"></div>
            <button class="telemetry-btn" id="canvas-btn-zoom-out" title="Zoom Out (Ctrl+-)">
              <i data-lucide="zoom-out" style="width: 14px; height: 14px;"></i>
            </button>
            <button class="telemetry-btn telemetry-zoom-val" id="canvas-btn-zoom-fit" title="Actual Size 100% (Ctrl+0)">
              ${Math.round(this.zoom * 100)}%
            </button>
            <button class="telemetry-btn" id="canvas-btn-zoom-in" title="Zoom In (Ctrl++)">
              <i data-lucide="zoom-in" style="width: 14px; height: 14px;"></i>
            </button>
            <div class="telemetry-separator"></div>
            <button class="telemetry-btn" id="canvas-btn-lightbox" title="${t('lightboxTitle') || 'High-Resolution Vector Preview'}">
              <i data-lucide="maximize-2" style="width: 14px; height: 14px;"></i>
            </button>
          </div>
        </div>

        <!-- Canvas Viewport with ambient Neue Klasse glow -->
        <div class="canvas-viewport" id="canvas-viewport-stage">
          <div class="canvas-sheet-wrapper" id="canvas-sheet-wrapper" style="transform: translate(${this.panX}px, ${this.panY}px) scale(${this.zoom}); transform-origin: center center;">
            <div class="canvas-document-sheet ${isPortrait ? 'is-portrait' : ''}" id="canvas-document-sheet" style="aspect-ratio: ${pageWidth} / ${pageHeight};">
              <img class="canvas-page-render" 
                   src="${page.thumbnailDataUrl}" 
                   alt="Active Page ${page.displayPageNumber}" 
                   style="transform: rotate(${rotation}deg) scale(${imgScale});" />
              
              <!-- Real-time Live Overlays -->
              <div class="canvas-overlay-watermark" id="canvas-overlay-watermark"></div>
              <div class="canvas-overlay-numbers" id="canvas-overlay-numbers"></div>
            </div>
          </div>
        </div>
      </div>
    `;

    this.attachEventListeners();
    this.renderOverlays();
    this.refreshIcons();
  }

  private updateZoomTransform(): void {
    const wrapper = this.container.querySelector<HTMLElement>('#canvas-sheet-wrapper');
    const zoomVal = this.container.querySelector<HTMLElement>('#canvas-btn-zoom-fit');
    if (wrapper) {
      wrapper.style.transform = `translate(${this.panX}px, ${this.panY}px) scale(${this.zoom})`;
    }
    if (zoomVal) {
      zoomVal.textContent = `${Math.round(this.zoom * 100)}%`;
    }
  }

  private renderOverlays(): void {
    const wmEl = this.container.querySelector<HTMLElement>('#canvas-overlay-watermark');
    const numEl = this.container.querySelector<HTMLElement>('#canvas-overlay-numbers');

    // Watermark overlay
    if (wmEl) {
      if (this.watermarkPreview.enabled && this.watermarkPreview.text.trim()) {
        const { text, fontSize, opacity, color, rotation, repeat } = this.watermarkPreview;
        wmEl.style.display = 'flex';
        wmEl.style.opacity = String(opacity);
        wmEl.style.color = color;

        if (repeat) {
          wmEl.className = 'canvas-overlay-watermark watermark-tile-grid';
          const items = Array.from({ length: 9 })
            .map(() => `<span class="wm-tile-item" style="font-size: ${Math.max(14, fontSize * 0.55)}px; transform: rotate(${rotation}deg);">${escapeHtml(text)}</span>`)
            .join('');
          wmEl.innerHTML = items;
        } else {
          wmEl.className = 'canvas-overlay-watermark watermark-center-single';
          wmEl.innerHTML = `
            <span class="wm-single-item" style="font-size: ${fontSize}px; transform: rotate(${rotation}deg);">
              ${escapeHtml(text)}
            </span>
          `;
        }
      } else {
        wmEl.style.display = 'none';
        wmEl.innerHTML = '';
      }
    }

    // Page Number overlay
    if (numEl) {
      if (this.pageNumberPreview.enabled) {
        const { format, position, margin, fontSize, color } = this.pageNumberPreview;
        const pageNum = this.activeIndex + 1;
        const total = this.totalPages;
        const renderedText = format
          .replace(/\{n\}/g, String(pageNum))
          .replace(/\{total\}/g, String(total));

        numEl.style.display = 'block';
        numEl.style.fontSize = `${fontSize}px`;
        numEl.style.color = color;
        numEl.style.padding = `${margin}px`;
        numEl.className = `canvas-overlay-numbers pos-${position}`;
        numEl.textContent = renderedText;
      } else {
        numEl.style.display = 'none';
        numEl.textContent = '';
      }
    }
  }

  private attachStartupEvents(): void {
    const openBtn = this.container.querySelector('#workbench-btn-open');
    openBtn?.addEventListener('click', () => {
      this.events.onOpenFile?.();
    });

    const imgBtn = this.container.querySelector('#workbench-btn-images');
    imgBtn?.addEventListener('click', () => {
      this.events.onImagesToPdf?.();
    });

    const dropzone = this.container.querySelector('#workbench-dropzone');
    dropzone?.addEventListener('click', () => {
      this.events.onOpenFile?.();
    });

    dropzone?.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzone.classList.add('drag-active');
    });

    dropzone?.addEventListener('dragleave', () => {
      dropzone.classList.remove('drag-active');
    });

    dropzone?.addEventListener('drop', (e) => {
      const dragEvent = e as DragEvent;
      dragEvent.preventDefault();
      dropzone.classList.remove('drag-active');
      if (dragEvent.dataTransfer && dragEvent.dataTransfer.files.length > 0) {
        this.events.onFilesDropped?.(Array.from(dragEvent.dataTransfer.files));
      }
    });
  }

  private attachEventListeners(): void {
    const prevBtn = this.container.querySelector('#canvas-btn-prev');
    prevBtn?.addEventListener('click', () => this.events.onPrevPage());

    const nextBtn = this.container.querySelector('#canvas-btn-next');
    nextBtn?.addEventListener('click', () => this.events.onNextPage());

    const rotateBtn = this.container.querySelector('#canvas-btn-rotate');
    rotateBtn?.addEventListener('click', () => this.events.onRotateActive(90));

    const panResetBtn = this.container.querySelector('#canvas-btn-pan-reset');
    panResetBtn?.addEventListener('click', () => this.resetPan());

    const zoomInBtn = this.container.querySelector('#canvas-btn-zoom-in');
    zoomInBtn?.addEventListener('click', () => this.setZoom(this.zoom + 0.15));

    const zoomOutBtn = this.container.querySelector('#canvas-btn-zoom-out');
    zoomOutBtn?.addEventListener('click', () => this.setZoom(this.zoom - 0.15));

    const zoomFitBtn = this.container.querySelector('#canvas-btn-zoom-fit');
    zoomFitBtn?.addEventListener('click', () => this.setZoom(1.0, true));

    const lightboxBtn = this.container.querySelector('#canvas-btn-lightbox');
    lightboxBtn?.addEventListener('click', () => {
      this.events.onOpenLightbox?.();
    });

    const wrapper = this.container.querySelector('#canvas-sheet-wrapper');
    wrapper?.addEventListener('dblclick', () => {
      this.events.onOpenLightbox?.();
    });

    // Panning & dragging handlers
    const viewport = this.container.querySelector<HTMLElement>('#canvas-viewport-stage');
    if (viewport) {
      viewport.addEventListener('mousedown', (e) => {
        // Space + Left Click OR Middle Mouse Click (button === 1)
        if (this.spacePressed || e.button === 1) {
          e.preventDefault();
          this.isPanning = true;
          this.startX = e.clientX;
          this.startY = e.clientY;
          this.initialPanX = this.panX;
          this.initialPanY = this.panY;
          viewport.style.cursor = 'grabbing';
        }
      });

      // Smooth cursor-focused wheel zoom (Ctrl+Wheel) OR smooth canvas pan
      viewport.addEventListener('wheel', (e) => {
        e.preventDefault();
        if (e.ctrlKey || e.metaKey) {
          const rect = viewport.getBoundingClientRect();
          const mouseX = e.clientX - rect.left - rect.width / 2;
          const mouseY = e.clientY - rect.top - rect.height / 2;

          const factor = e.deltaY < 0 ? 1.15 : 0.87;
          const nextZoom = Math.max(0.25, Math.min(this.maxZoom, this.zoom * factor));

          // Adjust pan around mouse anchor
          const zoomRatio = nextZoom / this.zoom;
          this.panX = mouseX - (mouseX - this.panX) * zoomRatio;
          this.panY = mouseY - (mouseY - this.panY) * zoomRatio;
          this.zoom = nextZoom;

          this.updateZoomTransform();
          this.events.onZoomChange?.(this.zoom);
        } else {
          // Natural mouse wheel panning (vertical, or horizontal if Shift held)
          if (e.shiftKey) {
            this.panX -= e.deltaY;
          } else {
            this.panY -= e.deltaY;
            if (e.deltaX) {
              this.panX -= e.deltaX;
            }
          }
          this.updateZoomTransform();
        }
      }, { passive: false });
    }
  }

  private refreshIcons(): void {
    createIcons({
      icons: {
        RotateCw,
        ChevronLeft,
        ChevronRight,
        ZoomIn,
        ZoomOut,
        Maximize2,
        FileText,
        FolderOpen,
        Upload,
        ShieldCheck,
        Image,
        Command,
        Move,
      },
      nameAttr: 'data-lucide',
    });
  }
}
