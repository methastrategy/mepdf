import {
  createIcons,
  RotateCw,
  Trash2,
  CheckSquare,
  Square,
  GripVertical,
} from 'lucide';
import type { PDFPageItem } from '../core/types';
import { escapeHtml } from '../utils/file-utils';
import { t } from '../core/i18n';

export interface CockpitFilmstripEvents {
  onSelectPage: (pageId: string) => void;
  onToggleSelect: (pageId: string) => void;
  onRotatePage: (pageId: string, degrees: number) => void;
  onDeletePage: (pageId: string) => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onRotateSelected: (degrees: number) => void;
  onDeleteSelected: () => void;
}

export class CockpitFilmstrip {
  private container: HTMLElement;
  private events: CockpitFilmstripEvents;
  private pages: PDFPageItem[] = [];
  private activePageId: string | null = null;
  private draggedIndex: number | null = null;

  constructor(container: HTMLElement, events: CockpitFilmstripEvents) {
    this.container = container;
    this.events = events;
  }

  setPages(pages: PDFPageItem[], activePageId?: string): void {
    this.pages = pages;
    if (activePageId !== undefined) {
      this.activePageId = activePageId;
    } else if (!this.activePageId && pages.length > 0) {
      this.activePageId = pages[0]?.id || null;
    } else if (pages.length > 0 && !pages.some((p) => p.id === this.activePageId)) {
      this.activePageId = pages[0]?.id || null;
    }
    this.render();
  }

  setActivePageId(pageId: string): void {
    if (this.activePageId === pageId) return;
    this.activePageId = pageId;
    const cards = this.container.querySelectorAll<HTMLElement>('.filmstrip-card');
    cards.forEach((card) => {
      const id = card.getAttribute('data-page-id');
      card.classList.toggle('active', id === pageId);
    });
  }

  getActivePageId(): string | null {
    return this.activePageId;
  }

  render(): void {
    const total = this.pages.length;
    const selectedCount = this.pages.filter((p) => p.selected).length;
    const allSelected = total > 0 && selectedCount === total;

    this.container.innerHTML = `
      <div class="cockpit-filmstrip-inner">
        <div class="filmstrip-header">
          <div class="filmstrip-title-row">
            <span class="filmstrip-title">${t('cockpitFilmstripTitle') || 'PAGES'}</span>
            <span class="filmstrip-counter">${total}</span>
          </div>
          <div class="filmstrip-actions-row">
            <button class="btn btn-ghost btn-sm btn-icon" id="filmstrip-btn-select-all" title="${allSelected ? (t('toolbarDeselectAll') || 'Deselect All') : (t('toolbarSelectAll') || 'Select All')}">
              <i data-lucide="${allSelected ? 'check-square' : 'square'}" style="width: 14px; height: 14px;"></i>
            </button>
            <button class="btn btn-ghost btn-sm btn-icon" id="filmstrip-btn-rotate-sel" title="${t('toolbarRotateSelected') || 'Rotate Selected'}" ${selectedCount === 0 ? 'disabled' : ''}>
              <i data-lucide="rotate-cw" style="width: 14px; height: 14px;"></i>
            </button>
            <button class="btn btn-ghost btn-sm btn-icon btn-danger-ghost" id="filmstrip-btn-delete-sel" title="${t('toolbarDeleteSelected') || 'Delete Selected'}" ${selectedCount === 0 ? 'disabled' : ''}>
              <i data-lucide="trash-2" style="width: 14px; height: 14px;"></i>
            </button>
          </div>
        </div>

        <div class="filmstrip-list" id="filmstrip-list-container">
          ${this.pages
            .map((page, index) => this.renderCard(page, index))
            .join('')}
        </div>
      </div>
    `;

    this.attachEventListeners();
    this.refreshIcons();
  }

  private renderCard(page: PDFPageItem, index: number): string {
    const isActive = page.id === this.activePageId;
    const isSelected = page.selected;
    const rotation = page.rotation % 360;
    const isTurned = rotation === 90 || rotation === 270;
    const minDim = Math.min(page.width, page.height);
    const maxDim = Math.max(page.width, page.height);
    const scale = isTurned && minDim > 0 && maxDim > 0 ? (minDim / maxDim).toFixed(3) : '1';

    return `
      <div class="filmstrip-card ${isActive ? 'active' : ''} ${isSelected ? 'selected' : ''}" 
           data-page-id="${page.id}" 
           data-index="${index}" 
           draggable="true"
           title="${escapeHtml(page.docName)} - P.${page.displayPageNumber}">
        
        <div class="filmstrip-card-rail">
          <input type="checkbox" class="filmstrip-checkbox" data-page-id="${page.id}" ${isSelected ? 'checked' : ''} />
          <span class="filmstrip-page-num">${index + 1}</span>
          <div class="filmstrip-drag-handle" title="${t('cardDragReorder') || 'Drag to reorder'}">
            <i data-lucide="grip-vertical" style="width: 12px; height: 12px;"></i>
          </div>
        </div>

        <div class="filmstrip-thumb-wrap">
          <img class="filmstrip-thumb-img" 
               src="${page.thumbnailDataUrl}" 
               alt="P.${page.displayPageNumber}" 
               style="transform: rotate(${rotation}deg) scale(${scale});" 
               loading="lazy" />
          ${rotation !== 0 ? `<span class="filmstrip-rotation-badge">${rotation}°</span>` : ''}
        </div>

        <div class="filmstrip-hover-actions">
          <button class="filmstrip-action-btn btn-rotate" data-page-id="${page.id}" title="${t('cardRotateCw') || 'Rotate 90°'}">
            <i data-lucide="rotate-cw" style="width: 12px; height: 12px;"></i>
          </button>
          <button class="filmstrip-action-btn btn-delete" data-page-id="${page.id}" title="${t('cardDeletePage') || 'Delete page'}">
            <i data-lucide="trash-2" style="width: 12px; height: 12px;"></i>
          </button>
        </div>
      </div>
    `;
  }

  private attachEventListeners(): void {
    // Header actions
    const selectAllBtn = this.container.querySelector('#filmstrip-btn-select-all');
    selectAllBtn?.addEventListener('click', () => {
      const allSelected = this.pages.length > 0 && this.pages.every((p) => p.selected);
      if (allSelected) {
        this.events.onDeselectAll();
      } else {
        this.events.onSelectAll();
      }
    });

    const rotateSelBtn = this.container.querySelector('#filmstrip-btn-rotate-sel');
    rotateSelBtn?.addEventListener('click', () => {
      this.events.onRotateSelected(90);
    });

    const deleteSelBtn = this.container.querySelector('#filmstrip-btn-delete-sel');
    deleteSelBtn?.addEventListener('click', () => {
      this.events.onDeleteSelected();
    });

    // Cards interactions
    const list = this.container.querySelector('#filmstrip-list-container');
    if (!list) return;

    list.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;

      // Handle rotate button
      const rotateBtn = target.closest<HTMLButtonElement>('.btn-rotate');
      if (rotateBtn) {
        e.stopPropagation();
        const pageId = rotateBtn.getAttribute('data-page-id');
        if (pageId) this.events.onRotatePage(pageId, 90);
        return;
      }

      // Handle delete button
      const deleteBtn = target.closest<HTMLButtonElement>('.btn-delete');
      if (deleteBtn) {
        e.stopPropagation();
        const pageId = deleteBtn.getAttribute('data-page-id');
        if (pageId) this.events.onDeletePage(pageId);
        return;
      }

      // Handle checkbox
      const checkbox = target.closest<HTMLInputElement>('.filmstrip-checkbox');
      if (checkbox) {
        e.stopPropagation();
        const pageId = checkbox.getAttribute('data-page-id');
        if (pageId) this.events.onToggleSelect(pageId);
        return;
      }

      // Handle card select
      const card = target.closest<HTMLElement>('.filmstrip-card');
      if (card) {
        const pageId = card.getAttribute('data-page-id');
        if (pageId) {
          this.setActivePageId(pageId);
          this.events.onSelectPage(pageId);
        }
      }
    });

    // HTML5 Drag and drop reordering
    const cards = list.querySelectorAll<HTMLElement>('.filmstrip-card');
    cards.forEach((card) => {
      card.addEventListener('dragstart', (e) => {
        const idx = Number(card.getAttribute('data-index'));
        this.draggedIndex = idx;
        card.classList.add('dragging');
        if (e.dataTransfer) {
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', String(idx));
        }
      });

      card.addEventListener('dragend', () => {
        card.classList.remove('dragging');
        cards.forEach((c) => c.classList.remove('drag-over-top', 'drag-over-bottom'));
        this.draggedIndex = null;
      });

      card.addEventListener('dragover', (e) => {
        e.preventDefault();
        if (this.draggedIndex === null) return;
        const targetIdx = Number(card.getAttribute('data-index'));
        if (targetIdx === this.draggedIndex) return;

        const rect = card.getBoundingClientRect();
        const midY = rect.top + rect.height / 2;
        if (e.clientY < midY) {
          card.classList.add('drag-over-top');
          card.classList.remove('drag-over-bottom');
        } else {
          card.classList.add('drag-over-bottom');
          card.classList.remove('drag-over-top');
        }
      });

      card.addEventListener('dragleave', () => {
        card.classList.remove('drag-over-top', 'drag-over-bottom');
      });

      card.addEventListener('drop', (e) => {
        e.preventDefault();
        card.classList.remove('drag-over-top', 'drag-over-bottom');
        if (this.draggedIndex === null) return;
        const targetIdx = Number(card.getAttribute('data-index'));
        if (targetIdx === this.draggedIndex) return;

        const rect = card.getBoundingClientRect();
        const midY = rect.top + rect.height / 2;
        const insertAfter = e.clientY >= midY;
        let finalIdx = insertAfter ? targetIdx : targetIdx;
        if (insertAfter && this.draggedIndex < targetIdx) {
          finalIdx = targetIdx;
        } else if (!insertAfter && this.draggedIndex > targetIdx) {
          finalIdx = targetIdx;
        }

        this.events.onReorder(this.draggedIndex, finalIdx);
        this.draggedIndex = null;
      });
    });
  }

  private refreshIcons(): void {
    createIcons({
      icons: {
        RotateCw,
        Trash2,
        CheckSquare,
        Square,
        GripVertical,
      },
      nameAttr: 'data-lucide',
    });
  }
}
