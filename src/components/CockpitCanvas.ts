import {
  createIcons,
  RotateCw,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  Maximize2,
  FileText,
} from 'lucide';
import type { PDFPageItem } from '../core/types';
import { escapeHtml } from '../utils/file-utils';
import { t } from '../core/i18n';

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
  format: string; // '{n}', '{n}/{total}', etc.
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
}

export class CockpitCanvas {
  private container: HTMLElement;
  private events: CockpitCanvasEvents;
  private activePage: PDFPageItem | null = null;
  private activeIndex = 0;
  private totalPages = 0;
  private zoom = 1.0;
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
  }

  setActivePage(page: PDFPageItem | null, index: number, total: number): void {
    this.activePage = page;
    this.activeIndex = index;
    this.totalPages = total;
    this.render();
  }

  setZoom(zoom: number): void {
    this.zoom = Math.max(0.25, Math.min(3.0, zoom));
    this.updateZoomTransform();
    this.events.onZoomChange?.(this.zoom);
  }

  getZoom(): number {
    return this.zoom;
  }

  setWatermarkPreview(state: Partial<WatermarkPreviewState>): void {
    this.watermarkPreview = { ...this.watermarkPreview, ...state };
    this.renderOverlays();
  }

  setPageNumberPreview(state: Partial<PageNumberPreviewState>): void {
    this.pageNumberPreview = { ...this.pageNumberPreview, ...state };
    this.renderOverlays();
  }

  render(): void {
    if (!this.activePage) {
      this.container.innerHTML = `
        <div class="canvas-empty-state">
          <i data-lucide="file-text" style="width: 48px; height: 48px; opacity: 0.3;"></i>
          <p>${t('dropzoneTitle') || 'No document loaded'}</p>
        </div>
      `;
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
            <button class="telemetry-btn" id="canvas-btn-prev" title="Previous Page" ${this.activeIndex <= 0 ? 'disabled' : ''}>
              <i data-lucide="chevron-left" style="width: 15px; height: 15px;"></i>
            </button>
            <span class="telemetry-page-indicator">${this.activeIndex + 1} / ${this.totalPages}</span>
            <button class="telemetry-btn" id="canvas-btn-next" title="Next Page" ${this.activeIndex >= this.totalPages - 1 ? 'disabled' : ''}>
              <i data-lucide="chevron-right" style="width: 15px; height: 15px;"></i>
            </button>
          </div>

          <div class="telemetry-right">
            <button class="telemetry-btn" id="canvas-btn-rotate" title="${t('cardRotateCw') || 'Rotate 90°'}">
              <i data-lucide="rotate-cw" style="width: 14px; height: 14px;"></i>
              <span class="btn-text-sm">90°</span>
            </button>
            <div class="telemetry-separator"></div>
            <button class="telemetry-btn" id="canvas-btn-zoom-out" title="Zoom Out">
              <i data-lucide="zoom-out" style="width: 14px; height: 14px;"></i>
            </button>
            <button class="telemetry-btn telemetry-zoom-val" id="canvas-btn-zoom-fit" title="Fit / Reset Zoom">
              ${Math.round(this.zoom * 100)}%
            </button>
            <button class="telemetry-btn" id="canvas-btn-zoom-in" title="Zoom In">
              <i data-lucide="zoom-in" style="width: 14px; height: 14px;"></i>
            </button>
          </div>
        </div>

        <!-- Canvas Viewport with ambient Neue Klasse glow -->
        <div class="canvas-viewport" id="canvas-viewport-stage">
          <div class="canvas-sheet-wrapper" id="canvas-sheet-wrapper" style="transform: scale(${this.zoom}); transform-origin: center center;">
            <div class="canvas-document-sheet" id="canvas-document-sheet" style="aspect-ratio: ${page.width} / ${page.height};">
              <img class="canvas-page-render" 
                   src="${page.thumbnailDataUrl}" 
                   alt="Active Page ${page.displayPageNumber}" 
                   style="transform: rotate(${rotation}deg);" />
              
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
      wrapper.style.transform = `scale(${this.zoom})`;
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

  private attachEventListeners(): void {
    const prevBtn = this.container.querySelector('#canvas-btn-prev');
    prevBtn?.addEventListener('click', () => this.events.onPrevPage());

    const nextBtn = this.container.querySelector('#canvas-btn-next');
    nextBtn?.addEventListener('click', () => this.events.onNextPage());

    const rotateBtn = this.container.querySelector('#canvas-btn-rotate');
    rotateBtn?.addEventListener('click', () => this.events.onRotateActive(90));

    const zoomInBtn = this.container.querySelector('#canvas-btn-zoom-in');
    zoomInBtn?.addEventListener('click', () => this.setZoom(this.zoom + 0.15));

    const zoomOutBtn = this.container.querySelector('#canvas-btn-zoom-out');
    zoomOutBtn?.addEventListener('click', () => this.setZoom(this.zoom - 0.15));

    const zoomFitBtn = this.container.querySelector('#canvas-btn-zoom-fit');
    zoomFitBtn?.addEventListener('click', () => this.setZoom(1.0));

    // Wheel zooming on viewport
    const viewport = this.container.querySelector<HTMLElement>('#canvas-viewport-stage');
    viewport?.addEventListener('wheel', (e) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const delta = e.deltaY < 0 ? 0.1 : -0.1;
        this.setZoom(this.zoom + delta);
      }
    }, { passive: false });
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
      },
      nameAttr: 'data-lucide',
    });
  }
}
