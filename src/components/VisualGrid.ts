import {
  createIcons,
  RotateCw,
  Trash2,
  GripVertical,
  ChevronLeft,
  ChevronRight,
  Maximize2,
} from 'lucide';
import type { PDFPageItem } from '../core/types';
import { escapeHtml } from '../utils/file-utils';
import { t } from '../core/i18n';

export interface VisualGridEvents {
  onToggleSelect: (pageId: string) => void;
  onRotatePage: (pageId: string, degrees: number) => void;
  onDeletePage: (pageId: string) => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
  onZoomPage?: (pageId: string) => void;
  onFilesDropped?: (files: File[]) => void;
}

export class VisualGrid {
  private container: HTMLElement;
  private events: VisualGridEvents;
  private pages: PDFPageItem[] = [];
  private draggedIndex: number | null = null;
  private lastTapTime = 0;
  private lastTapPageId = '';

  constructor(container: HTMLElement, events: VisualGridEvents) {
    this.container = container;
    this.events = events;
  }

  setPages(pages: PDFPageItem[]): void {
    this.pages = pages;
    this.render();
  }

  private render(): void {
    if (this.pages.length === 0) {
      this.container.innerHTML = '';
      return;
    }

    this.container.innerHTML = `
      <div class="pages-grid" id="pages-grid-container">
        ${this.pages
          .map((page, index) => this.renderCardHtml(page, index))
          .join('')}
      </div>
    `;

    this.attachCardEventListeners();
    this.refreshIcons();
  }

  private renderCardHtml(page: PDFPageItem, index: number): string {
    const isSelected = page.selected;
    const rotation = page.rotation % 360;
    const rotationBadge = rotation !== 0 ? `<span class="rotation-tag">${rotation}°</span>` : '';
    const isTurned = rotation === 90 || rotation === 270;
    const minDim = Math.min(page.width, page.height);
    const maxDim = Math.max(page.width, page.height);
    const scale = isTurned && minDim > 0 && maxDim > 0 
      ? (minDim / maxDim).toFixed(3) 
      : '1';

    const isFirst = index === 0;
    const isLast = index === this.pages.length - 1;

    return `
      <div class="page-card ${isSelected ? 'selected' : ''}" 
           data-page-id="${page.id}" 
           data-index="${index}" 
           draggable="true">
        
        <div class="page-card-header">
          <label class="page-card-label" title="${escapeHtml(page.docName)} - ${t('cardPagePrefix', { num: page.displayPageNumber })}">
            <input type="checkbox" class="page-select-checkbox" ${isSelected ? 'checked' : ''} data-page-id="${page.id}" />
            <span>${t('cardPagePrefix', { num: page.displayPageNumber })}</span>
          </label>
          <div style="display: flex; align-items: center; gap: 0.35rem; max-width: 120px;">
            <span class="doc-badge" title="${escapeHtml(page.docName)}">
              ${escapeHtml(page.docName)}
            </span>
            <span class="page-seq-badge">#${index + 1}</span>
          </div>
        </div>

        <div class="page-thumbnail-box" title="${t('cardZoomPreview')}">
          <img class="page-thumbnail-img" 
               src="${page.thumbnailDataUrl}" 
               alt="Page ${page.displayPageNumber}" 
               style="transform: rotate(${rotation}deg) scale(${scale});" 
               loading="lazy" />
          ${rotationBadge}
        </div>

        <div class="page-card-footer">
          <div style="display: flex; align-items: center; gap: 4px;">
            <button class="page-action-btn page-move-left-btn" data-index="${index}" ${isFirst ? 'disabled' : ''} title="${t('cardMoveLeft')}">
              <i data-lucide="chevron-left" style="width: 14px; height: 14px;"></i>
            </button>
            <button class="page-action-btn page-move-right-btn" data-index="${index}" ${isLast ? 'disabled' : ''} title="${t('cardMoveRight')}">
              <i data-lucide="chevron-right" style="width: 14px; height: 14px;"></i>
            </button>
          </div>

          <div style="display: flex; align-items: center; gap: 4px;">
            <button class="page-action-btn page-zoom-btn" data-page-id="${page.id}" title="${t('cardZoomPreview')}">
              <i data-lucide="maximize-2" style="width: 13px; height: 13px;"></i>
            </button>

            <button class="page-action-btn page-rotate-btn" data-page-id="${page.id}" title="${t('cardRotateCw')}">
              <i data-lucide="rotate-cw" style="width: 13px; height: 13px;"></i>
            </button>
            
            <span class="page-drag-handle" style="cursor: grab;" title="${t('cardDragReorder')}">
              <i data-lucide="grip-vertical" style="width: 13px; height: 13px; color: var(--text-muted);"></i>
            </span>

            <button class="page-action-btn delete-btn page-delete-btn" data-page-id="${page.id}" title="${t('cardDeletePage')}">
              <i data-lucide="trash-2" style="width: 13px; height: 13px;"></i>
            </button>
          </div>
        </div>

      </div>
    `;
  }

  private attachCardEventListeners(): void {
    const cards = this.container.querySelectorAll<HTMLElement>('.page-card');

    cards.forEach((card) => {
      const pageId = card.getAttribute('data-page-id')!;
      const index = parseInt(card.getAttribute('data-index')!, 10);

      // Checkbox click
      const checkbox = card.querySelector<HTMLInputElement>('.page-select-checkbox');
      checkbox?.addEventListener('change', (e) => {
        e.stopPropagation();
        this.events.onToggleSelect(pageId);
      });

      // Zoom preview button click
      const zoomBtn = card.querySelector('.page-zoom-btn');
      zoomBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.events.onZoomPage?.(pageId);
      });

      // Rotate click
      const rotateBtn = card.querySelector('.page-rotate-btn');
      rotateBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.events.onRotatePage(pageId, 90);
      });

      // Move left click
      const moveLeftBtn = card.querySelector('.page-move-left-btn');
      moveLeftBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        if (index > 0) this.events.onReorder(index, index - 1);
      });

      // Move right click
      const moveRightBtn = card.querySelector('.page-move-right-btn');
      moveRightBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        if (index < this.pages.length - 1) this.events.onReorder(index, index + 1);
      });

      // Delete click
      const deleteBtn = card.querySelector('.page-delete-btn');
      deleteBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.events.onDeletePage(pageId);
      });

      // Double-click on thumbnail box opens zoom lightbox
      const thumbBox = card.querySelector('.page-thumbnail-box');
      thumbBox?.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        this.events.onZoomPage?.(pageId);
      });

      // Touch double-tap support for mobile
      thumbBox?.addEventListener('touchend', (e) => {
        const currentTime = Date.now();
        const tapLength = currentTime - this.lastTapTime;
        if (tapLength < 350 && tapLength > 0 && this.lastTapPageId === pageId) {
          e.preventDefault();
          this.events.onZoomPage?.(pageId);
        }
        this.lastTapTime = currentTime;
        this.lastTapPageId = pageId;
      });

      // Card click for selection toggle (when not clicking buttons, inputs, labels, footer, or handles)
      card.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        if (
          target.closest('button') ||
          target.closest('input') ||
          target.closest('label') ||
          target.closest('.page-card-footer') ||
          target.closest('.page-drag-handle') ||
          target.closest('.page-action-btn')
        ) {
          return;
        }
        this.events.onToggleSelect(pageId);
      });

      // Double-click on card background also triggers zoom preview
      card.addEventListener('dblclick', (e) => {
        const target = e.target as HTMLElement;
        if (
          target.closest('button') ||
          target.closest('input') ||
          target.closest('.page-card-footer')
        ) {
          return;
        }
        this.events.onZoomPage?.(pageId);
      });

      // Drag and Drop
      card.addEventListener('dragstart', (e) => {
        this.draggedIndex = index;
        card.classList.add('dragging');
        if (e.dataTransfer) {
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', `${index}`);
        }
      });

      card.addEventListener('dragend', () => {
        card.classList.remove('dragging');
        this.clearDragOver();
        this.draggedIndex = null;
      });

      card.addEventListener('dragover', (e) => {
        e.preventDefault();
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
        if (this.draggedIndex !== null && this.draggedIndex !== index) {
          card.classList.add('drag-over');
        }
      });

      card.addEventListener('dragleave', () => {
        card.classList.remove('drag-over');
      });

      card.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        card.classList.remove('drag-over');

        // Check if external files were dropped on the card
        if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
          if (this.events.onFilesDropped) {
            this.events.onFilesDropped(Array.from(e.dataTransfer.files));
          }
          return;
        }

        // Internal card reorder
        if (this.draggedIndex !== null && this.draggedIndex !== index) {
          this.events.onReorder(this.draggedIndex, index);
        }
      });
    });
  }

  private clearDragOver(): void {
    const cards = this.container.querySelectorAll('.page-card');
    cards.forEach((c) => c.classList.remove('drag-over'));
  }

  private refreshIcons(): void {
    createIcons({
      icons: {
        RotateCw,
        Trash2,
        GripVertical,
        ChevronLeft,
        ChevronRight,
        Maximize2,
      },
      nameAttr: 'data-lucide',
    });
  }
}
