import { createIcons, RotateCw, RotateCcw, Trash2, CheckSquare, Square, Scissors, Plus, RefreshCw, X, Cloud } from 'lucide';
import { t } from '../core/i18n';

export interface ToolbarEvents {
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onInvertSelection: () => void;
  onRotateSelected: (degrees: number) => void;
  onRotateAll: (degrees: number) => void;
  onDeleteSelected: () => void;
  onOpenSplit: () => void;
  onAddFiles: () => void;
  onClearAll: () => void;
  onSaveToCloud?: () => void;
}

export class Toolbar {
  private container: HTMLElement;
  private events: ToolbarEvents;
  private selectionBadge: HTMLElement | null = null;
  private deleteBtn: HTMLButtonElement | null = null;
  private splitBtn: HTMLButtonElement | null = null;
  private selectAllBtn: HTMLButtonElement | null = null;
  private rotateSelectedBtn: HTMLButtonElement | null = null;
  private saveCloudBtn: HTMLButtonElement | null = null;
  private totalPages = 0;
  private selectedCount = 0;
  private isAuthenticated = false;

  constructor(container: HTMLElement, events: ToolbarEvents) {
    this.container = container;
    this.events = events;
    this.render();
  }

  render(): void {
    this.container.innerHTML = `
      <div class="workspace-toolbar">
        <div class="toolbar-left">
          <span class="selection-badge" id="toolbar-selection-badge">0 pages</span>
          
          <div class="toolbar-divider"></div>

          <button class="btn btn-secondary" id="toolbar-btn-select-all" title="${t('toolbarSelectAll')}">
            <i data-lucide="check-square" style="width: 15px; height: 15px;"></i>
            <span id="toolbar-select-all-label">${t('toolbarSelectAll')}</span>
          </button>

          <button class="btn btn-secondary" id="toolbar-btn-invert" title="${t('toolbarInvert')}">
            <i data-lucide="refresh-cw" style="width: 15px; height: 15px;"></i>
            <span>${t('toolbarInvert')}</span>
          </button>

          <div class="toolbar-divider"></div>

          <button class="btn btn-secondary" id="toolbar-btn-rotate-all" title="${t('toolbarRotateAll')}">
            <i data-lucide="rotate-cw" style="width: 15px; height: 15px;"></i>
            <span>${t('toolbarRotateAll')}</span>
          </button>

          <button class="btn btn-secondary" id="toolbar-btn-rotate-selected" title="${t('toolbarRotateSelected')}">
            <i data-lucide="rotate-cw" style="width: 15px; height: 15px;"></i>
            <span>${t('toolbarRotateSelected')}</span>
          </button>

          <button class="btn btn-secondary" id="toolbar-btn-split" title="${t('toolbarSplit')}">
            <i data-lucide="scissors" style="width: 15px; height: 15px;"></i>
            <span>${t('toolbarSplit')}</span>
          </button>

          <button class="btn btn-danger" id="toolbar-btn-delete" title="${t('toolbarDeleteSelected')}">
            <i data-lucide="trash-2" style="width: 15px; height: 15px;"></i>
            <span>${t('toolbarDeleteSelected')}</span>
          </button>
        </div>

        <div class="toolbar-right">
          <button class="btn btn-secondary btn-save-cloud" id="toolbar-btn-save-cloud" title="${t('saveCloudBtnToolbar')}">
            <i data-lucide="cloud" style="width: 15px; height: 15px; color: var(--primary);"></i>
            <span>${t('saveCloudBtnToolbar')}</span>
          </button>

          <button class="btn btn-secondary" id="toolbar-btn-add">
            <i data-lucide="plus" style="width: 15px; height: 15px;"></i>
            <span>${t('toolbarAddFiles')}</span>
          </button>

          <button class="btn btn-ghost" id="toolbar-btn-clear" title="${t('toolbarClearAll')}">
            <i data-lucide="x" style="width: 15px; height: 15px;"></i>
            <span>${t('toolbarClearAll')}</span>
          </button>
        </div>
      </div>
    `;

    this.selectionBadge = this.container.querySelector('#toolbar-selection-badge');
    this.deleteBtn = this.container.querySelector('#toolbar-btn-delete');
    this.splitBtn = this.container.querySelector('#toolbar-btn-split');
    this.selectAllBtn = this.container.querySelector('#toolbar-btn-select-all');
    this.rotateSelectedBtn = this.container.querySelector('#toolbar-btn-rotate-selected');
    this.saveCloudBtn = this.container.querySelector('#toolbar-btn-save-cloud');

    this.attachEventListeners();
    this.refreshIcons();
    this.updateCloudButtonVisibility();
    this.updateState(this.totalPages, this.selectedCount);
  }

  private refreshIcons(): void {
    createIcons({
      icons: {
        RotateCw,
        RotateCcw,
        Trash2,
        CheckSquare,
        Square,
        Scissors,
        Plus,
        RefreshCw,
        X,
        Cloud,
      },
      nameAttr: 'data-lucide',
    });
  }

  private attachEventListeners(): void {
    this.selectAllBtn?.addEventListener('click', () => {
      this.events.onSelectAll();
    });

    this.container.querySelector('#toolbar-btn-invert')?.addEventListener('click', () => {
      this.events.onInvertSelection();
    });

    this.container.querySelector('#toolbar-btn-rotate-all')?.addEventListener('click', () => {
      this.events.onRotateAll(90);
    });

    this.rotateSelectedBtn?.addEventListener('click', () => {
      this.events.onRotateSelected(90);
    });

    this.splitBtn?.addEventListener('click', () => {
      this.events.onOpenSplit();
    });

    this.deleteBtn?.addEventListener('click', () => {
      this.events.onDeleteSelected();
    });

    this.container.querySelector('#toolbar-btn-save-cloud')?.addEventListener('click', () => {
      this.events.onSaveToCloud?.();
    });

    this.container.querySelector('#toolbar-btn-add')?.addEventListener('click', () => {
      this.events.onAddFiles();
    });

    this.container.querySelector('#toolbar-btn-clear')?.addEventListener('click', () => {
      this.events.onClearAll();
    });
  }

  updateState(totalPages: number, selectedCount: number): void {
    this.totalPages = totalPages;
    this.selectedCount = selectedCount;

    if (this.selectionBadge) {
      if (selectedCount > 0) {
        this.selectionBadge.textContent = t('toolbarSelectedOfTotal', {
          selected: selectedCount,
          total: totalPages,
        });
      } else {
        this.selectionBadge.textContent =
          totalPages === 1
            ? t('toolbarSinglePage')
            : t('toolbarPagesCount', { count: totalPages });
      }
    }

    if (this.selectAllBtn) {
      const isAllSelected = selectedCount === totalPages && totalPages > 0;
      this.selectAllBtn.disabled = totalPages === 0;
      const labelText = isAllSelected ? t('toolbarDeselectAll') : t('toolbarSelectAll');
      this.selectAllBtn.innerHTML = `
        <i data-lucide="${isAllSelected ? 'square' : 'check-square'}" style="width: 15px; height: 15px;"></i>
        <span>${labelText}</span>
      `;
      this.selectAllBtn.title = labelText;
      this.refreshIcons();
    }

    if (this.deleteBtn) {
      this.deleteBtn.disabled = selectedCount === 0;
      this.deleteBtn.style.opacity = selectedCount === 0 ? '0.5' : '1';
      this.deleteBtn.style.pointerEvents = selectedCount === 0 ? 'none' : 'auto';
    }

    if (this.rotateSelectedBtn) {
      this.rotateSelectedBtn.disabled = selectedCount === 0;
      this.rotateSelectedBtn.style.opacity = selectedCount === 0 ? '0.5' : '1';
      this.rotateSelectedBtn.style.pointerEvents = selectedCount === 0 ? 'none' : 'auto';
    }

    if (this.splitBtn) {
      this.splitBtn.disabled = totalPages < 2;
      this.splitBtn.style.opacity = totalPages < 2 ? '0.5' : '1';
      this.splitBtn.style.pointerEvents = totalPages < 2 ? 'none' : 'auto';
    }

    this.updateCloudButtonVisibility();
  }

  setAuthenticated(isAuthenticated: boolean): void {
    this.isAuthenticated = isAuthenticated;
    this.updateCloudButtonVisibility();
  }

  private updateCloudButtonVisibility(): void {
    if (this.saveCloudBtn) {
      this.saveCloudBtn.style.display = this.isAuthenticated ? 'inline-flex' : 'none';
    }
  }
}
