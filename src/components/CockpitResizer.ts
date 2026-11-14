/**
 * CockpitResizer.ts
 * High-performance pointer-based resizable gutters for 3-Pane Studio Cockpit.
 * Supports smooth drag-to-resize on left (Filmstrip) and right (Inspector) rails,
 * visual hover/active glowing indicators, localStorage persistence, and dblclick reset.
 */

export interface CockpitResizerOptions {
  workspaceEl: HTMLElement;
  leftResizerEl: HTMLElement;
  rightResizerEl: HTMLElement;
  minFilmstripWidth?: number;
  maxFilmstripWidth?: number;
  defaultFilmstripWidth?: number;
  minInspectorWidth?: number;
  maxInspectorWidth?: number;
  defaultInspectorWidth?: number;
  minCanvasWidth?: number;
  onResize?: (filmstripWidth: number, inspectorWidth: number) => void;
}

export class CockpitResizer {
  private workspaceEl: HTMLElement;
  private leftResizerEl: HTMLElement;
  private rightResizerEl: HTMLElement;

  private minFilmstripWidth: number;
  private maxFilmstripWidth: number;
  private defaultFilmstripWidth: number;

  private minInspectorWidth: number;
  private maxInspectorWidth: number;
  private defaultInspectorWidth: number;
  private minCanvasWidth: number;

  private currentFilmstripWidth: number;
  private currentInspectorWidth: number;

  private isDraggingLeft = false;
  private isDraggingRight = false;

  private onResizeCallback?: (fWidth: number, iWidth: number) => void;

  private safeGetStorage(key: string): string | null {
    try {
      if (typeof localStorage !== 'undefined') {
        return localStorage.getItem(key);
      }
    } catch {
      // Ignore security errors in sandboxes/mock environments
    }
    return null;
  }

  private safeSetStorage(key: string, val: string): void {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(key, val);
      }
    } catch {
      // Ignore
    }
  }

  private safeRemoveStorage(key: string): void {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(key);
      }
    } catch {
      // Ignore
    }
  }

  constructor(options: CockpitResizerOptions) {
    this.workspaceEl = options.workspaceEl;
    this.leftResizerEl = options.leftResizerEl;
    this.rightResizerEl = options.rightResizerEl;

    this.minFilmstripWidth = options.minFilmstripWidth ?? 180;
    this.maxFilmstripWidth = options.maxFilmstripWidth ?? 440;
    this.defaultFilmstripWidth = options.defaultFilmstripWidth ?? 260;

    this.minInspectorWidth = options.minInspectorWidth ?? 260;
    this.maxInspectorWidth = options.maxInspectorWidth ?? 500;
    this.defaultInspectorWidth = options.defaultInspectorWidth ?? 340;
    this.minCanvasWidth = options.minCanvasWidth ?? 320;

    this.onResizeCallback = options.onResize;

    // Load persisted widths from storage if present
    const savedFilmstrip = this.safeGetStorage('mepdf_cockpit_filmstrip_w');
    const parsedF = savedFilmstrip ? parseInt(savedFilmstrip, 10) : NaN;
    this.currentFilmstripWidth =
      !isNaN(parsedF) && parsedF >= this.minFilmstripWidth && parsedF <= this.maxFilmstripWidth
        ? parsedF
        : this.defaultFilmstripWidth;

    const savedInspector = this.safeGetStorage('mepdf_cockpit_inspector_w');
    const parsedI = savedInspector ? parseInt(savedInspector, 10) : NaN;
    this.currentInspectorWidth =
      !isNaN(parsedI) && parsedI >= this.minInspectorWidth && parsedI <= this.maxInspectorWidth
        ? parsedI
        : this.defaultInspectorWidth;

    this.applyWidths();
    this.initEvents();
  }

  private applyWidths(): void {
    this.workspaceEl.style.setProperty('--filmstrip-width', `${this.currentFilmstripWidth}px`);
    this.workspaceEl.style.setProperty('--inspector-width', `${this.currentInspectorWidth}px`);
    this.onResizeCallback?.(this.currentFilmstripWidth, this.currentInspectorWidth);
  }

  public getFilmstripWidth(): number {
    return this.currentFilmstripWidth;
  }

  public getInspectorWidth(): number {
    return this.currentInspectorWidth;
  }

  public resetWidths(): void {
    this.currentFilmstripWidth = this.defaultFilmstripWidth;
    this.currentInspectorWidth = this.defaultInspectorWidth;
    this.safeRemoveStorage('mepdf_cockpit_filmstrip_w');
    this.safeRemoveStorage('mepdf_cockpit_inspector_w');
    this.applyWidths();
  }

  private initEvents(): void {
    // 1. Left Resizer Pointer Events
    this.leftResizerEl.addEventListener('pointerdown', (e: PointerEvent) => {
      if (e.button !== 0) return; // Only primary button
      e.preventDefault();
      this.isDraggingLeft = true;
      this.leftResizerEl.setPointerCapture(e.pointerId);
      this.leftResizerEl.classList.add('is-dragging');
      document.body.classList.add('cockpit-resizing');
    });

    this.leftResizerEl.addEventListener('pointermove', (e: PointerEvent) => {
      if (!this.isDraggingLeft) return;
      e.preventDefault();
      const rect = this.workspaceEl.getBoundingClientRect();
      const rawWidth = e.clientX - rect.left;
      const maxAllowed = rect.width - this.currentInspectorWidth - this.minCanvasWidth;
      const effectiveMax = Math.min(this.maxFilmstripWidth, Math.max(this.minFilmstripWidth, maxAllowed));
      const clamped = Math.max(this.minFilmstripWidth, Math.min(rawWidth, effectiveMax));

      this.currentFilmstripWidth = Math.round(clamped);
      this.workspaceEl.style.setProperty('--filmstrip-width', `${this.currentFilmstripWidth}px`);
      this.onResizeCallback?.(this.currentFilmstripWidth, this.currentInspectorWidth);
    });

    const endLeftDrag = (e: PointerEvent) => {
      if (!this.isDraggingLeft) return;
      this.isDraggingLeft = false;
      try {
        this.leftResizerEl.releasePointerCapture(e.pointerId);
      } catch {
        // Pointer might have already been released
      }
      this.leftResizerEl.classList.remove('is-dragging');
      document.body.classList.remove('cockpit-resizing');
      this.safeSetStorage('mepdf_cockpit_filmstrip_w', String(this.currentFilmstripWidth));
    };

    this.leftResizerEl.addEventListener('pointerup', endLeftDrag);
    this.leftResizerEl.addEventListener('pointercancel', endLeftDrag);

    // Double-click left resizer to reset to default
    this.leftResizerEl.addEventListener('dblclick', () => {
      this.currentFilmstripWidth = this.defaultFilmstripWidth;
      this.safeSetStorage('mepdf_cockpit_filmstrip_w', String(this.currentFilmstripWidth));
      this.applyWidths();
    });

    // 2. Right Resizer Pointer Events
    this.rightResizerEl.addEventListener('pointerdown', (e: PointerEvent) => {
      if (e.button !== 0) return;
      e.preventDefault();
      this.isDraggingRight = true;
      this.rightResizerEl.setPointerCapture(e.pointerId);
      this.rightResizerEl.classList.add('is-dragging');
      document.body.classList.add('cockpit-resizing');
    });

    this.rightResizerEl.addEventListener('pointermove', (e: PointerEvent) => {
      if (!this.isDraggingRight) return;
      e.preventDefault();
      const rect = this.workspaceEl.getBoundingClientRect();
      const rawWidth = rect.right - e.clientX;
      const maxAllowed = rect.width - this.currentFilmstripWidth - this.minCanvasWidth;
      const effectiveMax = Math.min(this.maxInspectorWidth, Math.max(this.minInspectorWidth, maxAllowed));
      const clamped = Math.max(this.minInspectorWidth, Math.min(rawWidth, effectiveMax));

      this.currentInspectorWidth = Math.round(clamped);
      this.workspaceEl.style.setProperty('--inspector-width', `${this.currentInspectorWidth}px`);
      this.onResizeCallback?.(this.currentFilmstripWidth, this.currentInspectorWidth);
    });

    const endRightDrag = (e: PointerEvent) => {
      if (!this.isDraggingRight) return;
      this.isDraggingRight = false;
      try {
        this.rightResizerEl.releasePointerCapture(e.pointerId);
      } catch {
        // Pointer might have already been released
      }
      this.rightResizerEl.classList.remove('is-dragging');
      document.body.classList.remove('cockpit-resizing');
      this.safeSetStorage('mepdf_cockpit_inspector_w', String(this.currentInspectorWidth));
    };

    this.rightResizerEl.addEventListener('pointerup', endRightDrag);
    this.rightResizerEl.addEventListener('pointercancel', endRightDrag);

    // Double-click right resizer to reset to default
    this.rightResizerEl.addEventListener('dblclick', () => {
      this.currentInspectorWidth = this.defaultInspectorWidth;
      this.safeSetStorage('mepdf_cockpit_inspector_w', String(this.currentInspectorWidth));
      this.applyWidths();
    });
  }
}
