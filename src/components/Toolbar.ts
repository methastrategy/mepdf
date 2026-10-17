import { createIcons, RotateCw, RotateCcw, Trash2, CheckSquare, Square, Scissors, Plus, RefreshCw, X } from 'lucide';

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
}

export class Toolbar {
  private container: HTMLElement;
  private events: ToolbarEvents;
  private selectionBadge: HTMLElement | null = null;
  private deleteBtn: HTMLButtonElement | null = null;
  private splitBtn: HTMLButtonElement | null = null;
  private selectAllBtn: HTMLButtonElement | null = null;
  private rotateSelectedBtn: HTMLButtonElement | null = null;

  constructor(container: HTMLElement, events: ToolbarEvents) {
    this.container = container;
    this.events = events;
    this.render();
  }

  private render(): void {
    this.container.innerHTML = `
      <div class="workspace-toolbar">
        <div class="toolbar-left">
          <span class="selection-badge" id="toolbar-selection-badge">0 pages</span>
          
          <div class="toolbar-divider"></div>

          <button class="btn btn-secondary" id="toolbar-btn-select-all" title="Select / Deselect All">
            <i data-lucide="check-square" style="width: 15px; height: 15px;"></i>
            <span>Select All</span>
          </button>

          <button class="btn btn-secondary" id="toolbar-btn-invert" title="Invert Selection">
            <i data-lucide="refresh-cw" style="width: 15px; height: 15px;"></i>
            <span>Invert</span>
          </button>

          <div class="toolbar-divider"></div>

          <button class="btn btn-secondary" id="toolbar-btn-rotate-all" title="Rotate all pages +90°">
            <i data-lucide="rotate-cw" style="width: 15px; height: 15px;"></i>
            <span>Rotate All</span>
          </button>

          <button class="btn btn-secondary" id="toolbar-btn-rotate-selected" title="Rotate selected pages +90°">
            <i data-lucide="rotate-cw" style="width: 15px; height: 15px;"></i>
            <span>Rotate Selected</span>
          </button>

          <button class="btn btn-secondary" id="toolbar-btn-split" title="Split document into multiple files">
            <i data-lucide="scissors" style="width: 15px; height: 15px;"></i>
            <span>Split</span>
          </button>

          <button class="btn btn-danger" id="toolbar-btn-delete" title="Delete selected pages">
            <i data-lucide="trash-2" style="width: 15px; height: 15px;"></i>
            <span>Delete Selected</span>
          </button>
        </div>

        <div class="toolbar-right">
          <button class="btn btn-secondary" id="toolbar-btn-add">
            <i data-lucide="plus" style="width: 15px; height: 15px;"></i>
            <span>Add Files</span>
          </button>

          <button class="btn btn-ghost" id="toolbar-btn-clear" title="Clear all files from workspace">
            <i data-lucide="x" style="width: 15px; height: 15px;"></i>
            <span>Clear All</span>
          </button>
        </div>
      </div>
    `;

    this.selectionBadge = this.container.querySelector('#toolbar-selection-badge');
    this.deleteBtn = this.container.querySelector('#toolbar-btn-delete');
    this.splitBtn = this.container.querySelector('#toolbar-btn-split');
    this.selectAllBtn = this.container.querySelector('#toolbar-btn-select-all');
    this.rotateSelectedBtn = this.container.querySelector('#toolbar-btn-rotate-selected');

    this.attachEventListeners();
    this.refreshIcons();
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

    this.container.querySelector('#toolbar-btn-add')?.addEventListener('click', () => {
      this.events.onAddFiles();
    });

    this.container.querySelector('#toolbar-btn-clear')?.addEventListener('click', () => {
      this.events.onClearAll();
    });
  }

  updateState(totalPages: number, selectedCount: number): void {
    if (this.selectionBadge) {
      if (selectedCount > 0) {
        this.selectionBadge.textContent = `${selectedCount} of ${totalPages} selected`;
      } else {
        this.selectionBadge.textContent = `${totalPages} ${totalPages === 1 ? 'page' : 'pages'}`;
      }
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
  }
}
