import {
  createIcons,
  Crop,
  RotateCw,
  FlipHorizontal,
  FlipVertical,
  Sparkles,
  Wand2,
  Sliders,
  FileText,
  Image as ImageIcon,
  Download,
  Plus,
  Check,
  X,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Eye,
  Undo,
} from 'lucide';
import {
  createDefaultAdjustmentRecipe,
  renderRecipeToCanvas,
  processPhoto,
  clampCrop,
  resizeCropRect,
  type PhotoAdjustmentRecipe,
  type PhotoFilterPreset,
  type CropRect,
  type ProcessedPhotoResult,
} from '../../core/photo-processor';
import { downloadBlob } from '../../utils/file-utils';
import { getLanguage } from '../../core/i18n';

export type AspectRatioPreset =
  | 'free'
  | '1:1'
  | 'a4-portrait'
  | 'a4-landscape'
  | '4:3'
  | '16:9'
  | 'passport';

export interface PhotoStudioApplyResult extends ProcessedPhotoResult {
  action: 'apply-page' | 'insert-new' | 'download';
  format: 'image/png' | 'image/jpeg' | 'image/webp';
  targetPageIndex?: number;
  docId?: string;
  docName?: string;
}

export interface PhotoStudioModalEvents {
  onApplyToCurrentPage?: (result: PhotoStudioApplyResult) => Promise<void> | void;
  onInsertAsNewPage?: (result: PhotoStudioApplyResult) => Promise<void> | void;
  onDownload?: (result: PhotoStudioApplyResult) => void;
  onClose?: () => void;
}

export class PhotoStudioModal {
  private overlay: HTMLElement | null = null;
  private events: PhotoStudioModalEvents;

  // Source & processing state
  private sourceImage: HTMLImageElement | HTMLCanvasElement | null = null;
  private recipe: PhotoAdjustmentRecipe = createDefaultAdjustmentRecipe();
  private originalWidth = 0;
  private originalHeight = 0;
  private coarseRotation = 0; // 0, 90, 180, 270
  private fineAngle = 0; // -45..+45 deskew angle

  // Navigation / page info
  private pageIndex?: number;
  private totalPages?: number;
  private docName?: string;
  private docId?: string;

  // Viewport & Pan/Zoom
  private zoom = 1.0;
  private panX = 0;
  private panY = 0;
  private isPanning = false;
  private startPanX = 0;
  private startPanY = 0;

  // Crop Interaction
  private isCropActive = false;
  private activeAspectRatio: AspectRatioPreset = 'free';
  private cropNormalized: CropRect = { x: 0.05, y: 0.05, width: 0.9, height: 0.9 };
  private activeHandle: string | null = null;
  private dragStartX = 0;
  private dragStartY = 0;
  private dragStartCrop: CropRect = { x: 0, y: 0, width: 0, height: 0 };

  // Inspector & Export state
  private activeInspectorTab: 'presets' | 'adjust' | 'export' = 'presets';
  private exportFormat: 'image/png' | 'image/jpeg' | 'image/webp' = 'image/png';
  private exportQuality = 0.92;

  // Render throttle
  private renderPending = false;
  private isOpenState = false;

  constructor(events: PhotoStudioModalEvents = {}) {
    this.events = events;
    this.ensureElements();
  }

  private ensureElements(): boolean {
    if (typeof document === 'undefined') return false;
    if (!this.overlay) {
      let el = document.querySelector<HTMLElement>('#app-photo-studio-overlay');
      if (!el) {
        el = document.createElement('div');
        el.id = 'app-photo-studio-overlay';
        el.className = 'photo-studio-overlay';
        document.body.appendChild(el);
      }
      this.overlay = el;
    }
    return true;
  }

  public async open(options: {
    imageSource: string | HTMLCanvasElement | Blob;
    pageIndex?: number;
    totalPages?: number;
    docName?: string;
    docId?: string;
  }): Promise<void> {
    if (!this.ensureElements() || !this.overlay) return;

    this.pageIndex = options.pageIndex;
    this.totalPages = options.totalPages;
    this.docName = options.docName;
    this.docId = options.docId;

    // Reset recipe and state
    this.recipe = createDefaultAdjustmentRecipe();
    this.coarseRotation = 0;
    this.fineAngle = 0;
    this.zoom = 1.0;
    this.panX = 0;
    this.panY = 0;
    this.isCropActive = false;
    this.activeAspectRatio = 'free';
    this.cropNormalized = { x: 0.05, y: 0.05, width: 0.9, height: 0.9 };
    this.activeInspectorTab = 'presets';
    this.exportFormat = 'image/png';
    this.exportQuality = 0.92;

    // Load source image
    if (options.imageSource instanceof HTMLCanvasElement) {
      this.sourceImage = options.imageSource;
      this.originalWidth = options.imageSource.width;
      this.originalHeight = options.imageSource.height;
    } else {
      const srcUrl =
        typeof options.imageSource === 'string'
          ? options.imageSource
          : URL.createObjectURL(options.imageSource);

      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = (err: unknown) => reject(err);
        img.src = srcUrl;
      });

      this.sourceImage = img;
      this.originalWidth = img.naturalWidth || img.width;
      this.originalHeight = img.naturalHeight || img.height;
    }

    this.isOpenState = true;
    this.overlay.classList.add('active');
    window.addEventListener('keydown', this.handleKeyDown);
    this.render();
    this.bindEvents();
    this.requestRender();
    this.fitToViewport();
  }

  public close(): void {
    if (!this.overlay) return;
    this.isOpenState = false;
    window.removeEventListener('keydown', this.handleKeyDown);
    this.overlay.classList.remove('active');
    this.overlay.innerHTML = '';
    this.events.onClose?.();
  }

  private handleKeyDown = (e: KeyboardEvent): void => {
    if (!this.isOpenState) return;
    if (e.key === 'Escape') {
      this.close();
    }
  };

  public isOpen(): boolean {
    return this.isOpenState;
  }

  private render(): void {
    if (!this.overlay) return;
    const lang = getLanguage();

    const pageBadge =
      typeof this.pageIndex === 'number'
        ? `<span class="studio-badge-page">Page ${this.pageIndex + 1}${
            this.totalPages ? ` of ${this.totalPages}` : ''
          }</span>`
        : '';

    const dimBadge = `<span class="studio-badge-dim">${this.originalWidth} × ${this.originalHeight} px</span>`;

    const canApplyToPage = typeof this.pageIndex === 'number';

    this.overlay.innerHTML = `
      <div class="studio-shell">
        <!-- TOP APP BAR -->
        <header class="studio-topbar">
          <div class="studio-brand-group">
            <div class="studio-icon-brand">
              <i data-lucide="sparkles" style="width: 18px; height: 18px;"></i>
            </div>
            <div class="studio-title-block">
              <span class="studio-title">${lang === 'th' ? 'mePDF สตูดิโอแต่งภาพ' : 'mePDF Photo Studio'}</span>
              <span class="studio-subtitle">${this.docName ? this.escape(this.docName) : 'Document Image'}</span>
            </div>
            <div class="studio-badges">
              ${pageBadge}
              ${dimBadge}
            </div>
          </div>

          <div class="studio-topbar-tools">
            <button class="btn btn-secondary btn-icon-only studio-tool-btn" id="studio-zoom-out" title="Zoom Out">
              <i data-lucide="zoom-out" style="width: 15px; height: 15px;"></i>
            </button>
            <span class="studio-zoom-readout" id="studio-zoom-val">${Math.round(this.zoom * 100)}%</span>
            <button class="btn btn-secondary btn-icon-only studio-tool-btn" id="studio-zoom-in" title="Zoom In">
              <i data-lucide="zoom-in" style="width: 15px; height: 15px;"></i>
            </button>
            <button class="btn btn-secondary btn-icon-only studio-tool-btn" id="studio-fit-btn" title="Fit to Screen">
              <i data-lucide="maximize-2" style="width: 15px; height: 15px;"></i>
            </button>
            <div class="studio-v-divider"></div>
            <button class="btn btn-ghost studio-tool-btn" id="studio-reset-all-btn" title="Reset All Adjustments">
              <i data-lucide="undo" style="width: 15px; height: 15px;"></i>
              <span>${lang === 'th' ? 'รีเซ็ตทั้งหมด' : 'Reset All'}</span>
            </button>
            <div class="studio-v-divider"></div>
            <button class="btn btn-ghost btn-icon-only studio-close-btn" id="studio-close-btn" title="Close Studio (Esc)">
              <i data-lucide="x" style="width: 18px; height: 18px;"></i>
            </button>
          </div>
        </header>

        <!-- MAIN WORKSPACE: LEFT TOOLS + VIEWPORT + RIGHT INSPECTOR -->
        <div class="studio-main-body">
          <!-- 1. LEFT TOOL DOCK -->
          <aside class="studio-tool-dock">
            <!-- CROP & RATIOS -->
            <div class="dock-section">
              <div class="dock-section-header">
                <span class="dock-section-title">${lang === 'th' ? 'ครอปและตัดขอบ' : 'Crop & Bounds'}</span>
                <button class="btn btn-xs ${this.isCropActive ? 'btn-primary' : 'btn-secondary'}" id="studio-toggle-crop-btn">
                  <i data-lucide="crop" style="width: 13px; height: 13px;"></i>
                  <span>${this.isCropActive ? (lang === 'th' ? 'เปิดอยู่' : 'Active') : (lang === 'th' ? 'ครอป' : 'Crop')}</span>
                </button>
              </div>

              <div class="dock-aspect-grid">
                <button class="dock-ratio-btn ${this.activeAspectRatio === 'free' ? 'active' : ''}" data-ratio="free">Free</button>
                <button class="dock-ratio-btn ${this.activeAspectRatio === '1:1' ? 'active' : ''}" data-ratio="1:1">1:1</button>
                <button class="dock-ratio-btn ${this.activeAspectRatio === 'a4-portrait' ? 'active' : ''}" data-ratio="a4-portrait">A4 Port</button>
                <button class="dock-ratio-btn ${this.activeAspectRatio === 'a4-landscape' ? 'active' : ''}" data-ratio="a4-landscape">A4 Land</button>
                <button class="dock-ratio-btn ${this.activeAspectRatio === '4:3' ? 'active' : ''}" data-ratio="4:3">4:3</button>
                <button class="dock-ratio-btn ${this.activeAspectRatio === '16:9' ? 'active' : ''}" data-ratio="16:9">16:9</button>
                <button class="dock-ratio-btn ${this.activeAspectRatio === 'passport' ? 'active' : ''}" data-ratio="passport">Passport</button>
              </div>
              ${
                this.recipe.crop
                  ? `<button class="btn btn-ghost btn-xs w-full text-danger mt-1" id="studio-clear-crop-btn">
                      ${lang === 'th' ? 'ล้างขอบเขตครอป' : 'Reset Crop'}
                    </button>`
                  : ''
              }
            </div>

            <!-- STRAIGHTEN & ROTATION -->
            <div class="dock-section">
              <div class="dock-section-header">
                <span class="dock-section-title">${lang === 'th' ? 'หมุนระนาบ (Deskew)' : 'Straighten & Deskew'}</span>
                <span class="dock-val-label" id="studio-angle-readout">${this.recipe.rotation.toFixed(1)}°</span>
              </div>
              <div class="dock-slider-row">
                <input type="range" class="studio-slider" id="studio-straighten-slider" min="-45" max="45" step="0.5" value="${this.recipe.rotation % 90}" />
              </div>
              <div class="dock-quick-btns">
                <button class="btn btn-secondary btn-xs flex-1" id="studio-zero-angle-btn">0° Level</button>
              </div>
            </div>

            <!-- ORIENTATION & FLIP -->
            <div class="dock-section">
              <div class="dock-section-header">
                <span class="dock-section-title">${lang === 'th' ? 'กลับทิศทาง' : 'Orientation'}</span>
              </div>
              <div class="dock-tool-btn-grid">
                <button class="btn btn-secondary btn-sm" id="studio-rot-90-btn" title="Rotate 90° Clockwise">
                  <i data-lucide="rotate-cw" style="width: 14px; height: 14px;"></i>
                  <span>+90°</span>
                </button>
                <button class="btn btn-secondary btn-sm ${this.recipe.flipH ? 'active' : ''}" id="studio-flip-h-btn" title="Flip Horizontally">
                  <i data-lucide="flip-horizontal" style="width: 14px; height: 14px;"></i>
                  <span>Flip H</span>
                </button>
                <button class="btn btn-secondary btn-sm ${this.recipe.flipV ? 'active' : ''}" id="studio-flip-v-btn" title="Flip Vertically">
                  <i data-lucide="flip-vertical" style="width: 14px; height: 14px;"></i>
                  <span>Flip V</span>
                </button>
              </div>
            </div>
          </aside>

          <!-- 2. CENTER INTERACTIVE VIEWPORT -->
          <main class="studio-viewport" id="studio-viewport">
            <div class="studio-canvas-stage" id="studio-canvas-stage">
              <div class="studio-canvas-anchor" id="studio-canvas-anchor">
                <canvas id="studio-render-canvas" class="studio-canvas"></canvas>
                <!-- CROP OVERLAY FRAME -->
                <div class="studio-crop-overlay ${this.isCropActive ? 'visible' : ''}" id="studio-crop-overlay">
                  <div class="studio-crop-box" id="studio-crop-box">
                    <div class="studio-crop-grid-lines">
                      <div class="grid-line horizontal-1"></div>
                      <div class="grid-line horizontal-2"></div>
                      <div class="grid-line vertical-1"></div>
                      <div class="grid-line vertical-2"></div>
                    </div>
                    <!-- 8 Resize Drag Handles -->
                    <div class="crop-handle handle-nw" data-handle="nw"></div>
                    <div class="crop-handle handle-n" data-handle="n"></div>
                    <div class="crop-handle handle-ne" data-handle="ne"></div>
                    <div class="crop-handle handle-e" data-handle="e"></div>
                    <div class="crop-handle handle-se" data-handle="se"></div>
                    <div class="crop-handle handle-s" data-handle="s"></div>
                    <div class="crop-handle handle-sw" data-handle="sw"></div>
                    <div class="crop-handle handle-w" data-handle="w"></div>
                  </div>
                </div>
              </div>
            </div>
          </main>

          <!-- 3. RIGHT INSPECTOR: PRESETS & MANUAL TUNING -->
          <aside class="studio-inspector">
            <!-- TABS -->
            <div class="studio-inspector-tabs">
              <button class="studio-tab-btn ${this.activeInspectorTab === 'presets' ? 'active' : ''}" data-tab="presets">
                ${lang === 'th' ? 'พรีเซ็ต' : 'Presets'}
              </button>
              <button class="studio-tab-btn ${this.activeInspectorTab === 'adjust' ? 'active' : ''}" data-tab="adjust">
                ${lang === 'th' ? 'ปรับแต่ง' : 'Adjust'}
              </button>
              <button class="studio-tab-btn ${this.activeInspectorTab === 'export' ? 'active' : ''}" data-tab="export">
                ${lang === 'th' ? 'ส่งออก' : 'Export'}
              </button>
            </div>

            <!-- TAB CONTENT -->
            <div class="studio-tab-body">
              ${this.renderInspectorTabContent()}
            </div>
          </aside>
        </div>

        <!-- BOTTOM ACTION FOOTER -->
        <footer class="studio-footer">
          <div class="studio-footer-left">
            <button class="btn btn-ghost" id="studio-cancel-btn">
              ${lang === 'th' ? 'ยกเลิก' : 'Cancel'}
            </button>
          </div>

          <div class="studio-footer-right">
            <button class="btn btn-secondary" id="studio-download-btn">
              <i data-lucide="download" style="width: 15px; height: 15px;"></i>
              <span>${lang === 'th' ? 'ดาวน์โหลดรูปภาพ' : 'Download Image'}</span>
            </button>

            <button class="btn btn-secondary" id="studio-insert-page-btn">
              <i data-lucide="plus" style="width: 15px; height: 15px;"></i>
              <span>${lang === 'th' ? 'แทรกเป็นหน้าใหม่' : 'Insert as New Page'}</span>
            </button>

            ${
              canApplyToPage
                ? `<button class="btn btn-primary" id="studio-apply-page-btn">
                    <i data-lucide="check" style="width: 15px; height: 15px;"></i>
                    <span>${lang === 'th' ? 'นำไปใช้กับหน้านี้' : 'Apply to Current Page'}</span>
                  </button>`
                : ''
            }
          </div>
        </footer>
      </div>
    `;

    this.refreshIcons();
    this.updateCropBoxOverlay();
  }

  private renderInspectorTabContent(): string {
    const lang = getLanguage();

    if (this.activeInspectorTab === 'presets') {
      const presets: { id: PhotoFilterPreset; label: string; desc: string; icon: string }[] = [
        {
          id: 'none',
          label: lang === 'th' ? 'ภาพต้นฉบับ' : 'Original',
          desc: lang === 'th' ? 'ไม่ใช้ฟิลเตอร์ใดๆ' : 'Natural raw image colors',
          icon: 'image',
        },
        {
          id: 'magic-color',
          label: lang === 'th' ? '🪄 เมจิกคัลเลอร์ (ล้างกระดาษขาว)' : '🪄 Magic Color (CamScanner)',
          desc: lang === 'th' ? 'ลบพื้นเทา ขาวสะอาด หมึกคมชัด' : 'Whitens background paper, enhances ink',
          icon: 'wand-2',
        },
        {
          id: 'bw-clean',
          label: lang === 'th' ? '📄 ขาวดำเอกสาร (Otsu Binary)' : '📄 B&W Clean (Otsu)',
          desc: lang === 'th' ? 'ขาวดำกริบ ตัดสัญญาณรบกวน 100%' : 'High-contrast clean binary document',
          icon: 'file-text',
        },
        {
          id: 'grayscale',
          label: lang === 'th' ? '🖤 เกรย์สเกล (Grayscale)' : '🖤 Grayscale',
          desc: lang === 'th' ? 'โทนเทานุ่มนวล คงระดับเฉดสี' : 'Smooth 256-level monochrome tones',
          icon: 'sliders',
        },
        {
          id: 'sepia',
          label: lang === 'th' ? '☕ ซีเปีย (Sepia Vintage)' : '☕ Sepia Vintage',
          desc: lang === 'th' ? 'โทนกระดาษคลาสสิก อบอุ่น' : 'Warm nostalgic parchment tone',
          icon: 'sparkles',
        },
        {
          id: 'invert',
          label: lang === 'th' ? '🔄 เนกาทีฟ (Invert)' : '🔄 Invert (Negative Film)',
          desc: lang === 'th' ? 'กลับสีดำเป็นขาว เหมาะกับฟิล์ม/เอ็กซเรย์' : 'Inverted negative contrast',
          icon: 'eye',
        },
      ];

      return `
        <div class="preset-list">
          ${presets
            .map(
              (p) => `
            <div class="preset-card ${this.recipe.filterPreset === p.id ? 'active' : ''}" data-preset="${p.id}">
              <div class="preset-card-head">
                <span class="preset-name">${p.label}</span>
                ${this.recipe.filterPreset === p.id ? '<span class="preset-active-dot"></span>' : ''}
              </div>
              <p class="preset-desc">${p.desc}</p>
            </div>
          `
            )
            .join('')}
        </div>
      `;
    }

    if (this.activeInspectorTab === 'adjust') {
      return `
        <div class="adjust-panel">
          <!-- BRIGHTNESS -->
          <div class="adjust-row">
            <div class="adjust-label-row">
              <span class="adjust-label">${lang === 'th' ? 'ความสว่าง (Brightness)' : 'Brightness'}</span>
              <span class="adjust-val" id="val-brightness">${this.recipe.brightness > 0 ? `+${this.recipe.brightness}` : this.recipe.brightness}</span>
            </div>
            <input type="range" class="studio-slider" id="slider-brightness" min="-100" max="100" value="${this.recipe.brightness}" />
          </div>

          <!-- CONTRAST -->
          <div class="adjust-row">
            <div class="adjust-label-row">
              <span class="adjust-label">${lang === 'th' ? 'ความคมชัดจัดจ้าน (Contrast)' : 'Contrast'}</span>
              <span class="adjust-val" id="val-contrast">${this.recipe.contrast > 0 ? `+${this.recipe.contrast}` : this.recipe.contrast}</span>
            </div>
            <input type="range" class="studio-slider" id="slider-contrast" min="-100" max="100" value="${this.recipe.contrast}" />
          </div>

          <!-- SATURATION -->
          <div class="adjust-row">
            <div class="adjust-label-row">
              <span class="adjust-label">${lang === 'th' ? 'ความอิ่มตัวของสี (Saturation)' : 'Saturation'}</span>
              <span class="adjust-val" id="val-saturation">${this.recipe.saturation > 0 ? `+${this.recipe.saturation}` : this.recipe.saturation}</span>
            </div>
            <input type="range" class="studio-slider" id="slider-saturation" min="-100" max="100" value="${this.recipe.saturation}" />
          </div>

          <!-- SHARPNESS -->
          <div class="adjust-row">
            <div class="adjust-label-row">
              <span class="adjust-label">${lang === 'th' ? 'ความคมชัดตัวอักษร (Sharpness)' : 'Text Sharpness'}</span>
              <span class="adjust-val" id="val-sharpness">${this.recipe.sharpness}</span>
            </div>
            <input type="range" class="studio-slider" id="slider-sharpness" min="0" max="100" value="${this.recipe.sharpness}" />
          </div>

          <div class="studio-divider"></div>

          <button class="btn btn-secondary btn-sm w-full" id="studio-reset-sliders-btn">
            ${lang === 'th' ? 'คืนค่าสไลเดอร์ทั้งหมด' : 'Reset Sliders'}
          </button>
        </div>
      `;
    }

    // EXPORT TAB
    return `
      <div class="export-panel">
        <label class="studio-field-label">${lang === 'th' ? 'ฟอร์แมตรูปภาพ' : 'Image Format'}</label>
        <div class="export-format-grid">
          <button class="export-format-btn ${this.exportFormat === 'image/png' ? 'active' : ''}" data-fmt="image/png">PNG (Lossless)</button>
          <button class="export-format-btn ${this.exportFormat === 'image/jpeg' ? 'active' : ''}" data-fmt="image/jpeg">JPG (Compact)</button>
          <button class="export-format-btn ${this.exportFormat === 'image/webp' ? 'active' : ''}" data-fmt="image/webp">WebP (Modern)</button>
        </div>

        ${
          this.exportFormat !== 'image/png'
            ? `
          <div class="adjust-row mt-3">
            <div class="adjust-label-row">
              <span class="adjust-label">${lang === 'th' ? 'คุณภาพการบีบอัด' : 'Quality'}</span>
              <span class="adjust-val" id="val-export-quality">${Math.round(this.exportQuality * 100)}%</span>
            </div>
            <input type="range" class="studio-slider" id="slider-export-quality" min="50" max="100" value="${Math.round(this.exportQuality * 100)}" />
          </div>
        `
            : ''
        }

        <div class="studio-info-card">
          <i data-lucide="sparkles" style="width: 14px; height: 14px; color: var(--primary);"></i>
          <span>${
            lang === 'th'
              ? 'ประมวลผลความเร็วสูงบนอุปกรณ์ 100% ปลอดภัย ไร้การส่งข้อมูลออก'
              : 'Full hardware accelerated client-side render with 0% data loss.'
          }</span>
        </div>
      </div>
    `;
  }

  private bindEvents(): void {
    if (!this.overlay) return;

    // Close button & escape
    this.overlay.querySelector('#studio-close-btn')?.addEventListener('click', () => this.close());
    this.overlay.querySelector('#studio-cancel-btn')?.addEventListener('click', () => this.close());

    // Zoom Controls
    this.overlay.querySelector('#studio-zoom-in')?.addEventListener('click', () => {
      this.setZoom(this.zoom * 1.25);
    });
    this.overlay.querySelector('#studio-zoom-out')?.addEventListener('click', () => {
      this.setZoom(this.zoom / 1.25);
    });
    this.overlay.querySelector('#studio-fit-btn')?.addEventListener('click', () => {
      this.fitToViewport();
    });

    // Straighten Slider
    const straightenSlider = this.overlay.querySelector<HTMLInputElement>('#studio-straighten-slider');

    // Reset All
    this.overlay.querySelector('#studio-reset-all-btn')?.addEventListener('click', () => {
      this.recipe = createDefaultAdjustmentRecipe();
      this.coarseRotation = 0;
      this.fineAngle = 0;
      this.isCropActive = false;
      this.activeAspectRatio = 'free';
      if (straightenSlider) straightenSlider.value = '0';
      const angleReadout = this.overlay?.querySelector('#studio-angle-readout');
      if (angleReadout) angleReadout.textContent = '0.0°';
      this.overlay?.querySelector('#studio-flip-h-btn')?.classList.remove('active');
      this.overlay?.querySelector('#studio-flip-v-btn')?.classList.remove('active');
      this.overlay?.querySelectorAll('.dock-ratio-btn').forEach((b) => {
        b.classList.toggle('active', (b as HTMLElement).dataset.ratio === 'free');
      });
      this.updateCropUI();
      this.updateInspectorTab();
      this.requestRender();
    });

    // Crop Toggle
    this.overlay.querySelector('#studio-toggle-crop-btn')?.addEventListener('click', () => {
      this.isCropActive = !this.isCropActive;
      if (this.isCropActive && !this.recipe.crop) {
        this.recipe.crop = { ...this.cropNormalized };
      }
      this.updateCropUI();
      this.requestRender();
    });

    // Clear Crop
    this.overlay.querySelector('#studio-clear-crop-btn')?.addEventListener('click', () => {
      this.recipe.crop = undefined;
      this.isCropActive = false;
      this.updateCropUI();
      this.requestRender();
    });

    // Aspect Ratio Buttons
    this.overlay.querySelectorAll<HTMLElement>('.dock-ratio-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const ratio = btn.dataset.ratio as AspectRatioPreset;
        if (ratio) {
          this.setAspectRatio(ratio);
        }
      });
    });

    // Straighten Slider
    straightenSlider?.addEventListener('input', () => {
      this.fineAngle = parseFloat(straightenSlider.value);
      this.recipe.rotation = (this.coarseRotation + this.fineAngle + 360) % 360;
      const readout = this.overlay?.querySelector('#studio-angle-readout');
      if (readout) readout.textContent = `${this.recipe.rotation.toFixed(1)}°`;
      this.requestRender();
    });

    // Zero Angle Button
    this.overlay.querySelector('#studio-zero-angle-btn')?.addEventListener('click', () => {
      this.fineAngle = 0;
      if (straightenSlider) straightenSlider.value = '0';
      this.recipe.rotation = this.coarseRotation;
      const readout = this.overlay?.querySelector('#studio-angle-readout');
      if (readout) readout.textContent = `${this.recipe.rotation.toFixed(1)}°`;
      this.requestRender();
    });

    // Rotate 90° CW
    this.overlay.querySelector('#studio-rot-90-btn')?.addEventListener('click', () => {
      this.coarseRotation = (this.coarseRotation + 90) % 360;
      this.recipe.rotation = (this.coarseRotation + this.fineAngle + 360) % 360;
      const readout = this.overlay?.querySelector('#studio-angle-readout');
      if (readout) readout.textContent = `${this.recipe.rotation.toFixed(1)}°`;
      this.requestRender();
    });

    // Flip H
    this.overlay.querySelector('#studio-flip-h-btn')?.addEventListener('click', () => {
      this.recipe.flipH = !this.recipe.flipH;
      this.overlay?.querySelector('#studio-flip-h-btn')?.classList.toggle('active', this.recipe.flipH);
      this.requestRender();
    });

    // Flip V
    this.overlay.querySelector('#studio-flip-v-btn')?.addEventListener('click', () => {
      this.recipe.flipV = !this.recipe.flipV;
      this.overlay?.querySelector('#studio-flip-v-btn')?.classList.toggle('active', this.recipe.flipV);
      this.requestRender();
    });

    // Inspector Tabs
    this.overlay.querySelectorAll<HTMLElement>('.studio-tab-btn').forEach((tabBtn) => {
      tabBtn.addEventListener('click', () => {
        const tab = tabBtn.dataset.tab as 'presets' | 'adjust' | 'export';
        if (tab && this.activeInspectorTab !== tab) {
          this.activeInspectorTab = tab;
          this.updateInspectorTab();
        }
      });
    });

    // Preset cards
    this.bindPresetEvents();

    // Adjust Sliders
    this.bindAdjustSliderEvents();

    // Export Options
    this.bindExportEvents();

    // Mouse Pan & Zoom on Viewport
    this.bindViewportPanZoom();

    // Crop box interaction
    this.bindCropHandles();

    // Bottom Action Buttons
    this.bindActionButtons();
  }

  private updateInspectorTab(): void {
    if (!this.overlay) return;
    this.overlay.querySelectorAll<HTMLElement>('.studio-tab-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.tab === this.activeInspectorTab);
    });

    const body = this.overlay.querySelector<HTMLElement>('.studio-tab-body');
    if (body) {
      body.innerHTML = this.renderInspectorTabContent();
      this.refreshIcons();
      this.bindPresetEvents();
      this.bindAdjustSliderEvents();
      this.bindExportEvents();
    }
  }

  private bindPresetEvents(): void {
    if (!this.overlay) return;
    this.overlay.querySelectorAll<HTMLElement>('.preset-card').forEach((card) => {
      card.addEventListener('click', () => {
        const preset = card.dataset.preset as PhotoFilterPreset;
        if (preset) {
          this.recipe.filterPreset = preset;
          this.overlay?.querySelectorAll('.preset-card').forEach((c) => c.classList.remove('active'));
          card.classList.add('active');
          this.requestRender();
        }
      });
    });
  }

  private bindAdjustSliderEvents(): void {
    if (!this.overlay) return;

    const bindSlider = (id: string, prop: 'brightness' | 'contrast' | 'saturation' | 'sharpness') => {
      const slider = this.overlay?.querySelector<HTMLInputElement>(`#slider-${id}`);
      const valLabel = this.overlay?.querySelector<HTMLElement>(`#val-${id}`);
      slider?.addEventListener('input', () => {
        const num = parseInt(slider.value, 10);
        this.recipe[prop] = num;
        if (valLabel) {
          valLabel.textContent = num > 0 && prop !== 'sharpness' ? `+${num}` : String(num);
        }
        this.requestRender();
      });
    };

    bindSlider('brightness', 'brightness');
    bindSlider('contrast', 'contrast');
    bindSlider('saturation', 'saturation');
    bindSlider('sharpness', 'sharpness');

    this.overlay.querySelector('#studio-reset-sliders-btn')?.addEventListener('click', () => {
      this.recipe.brightness = 0;
      this.recipe.contrast = 0;
      this.recipe.saturation = 0;
      this.recipe.sharpness = 0;
      this.updateInspectorTab();
      this.requestRender();
    });
  }

  private bindExportEvents(): void {
    if (!this.overlay) return;

    this.overlay.querySelectorAll<HTMLElement>('.export-format-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const fmt = btn.dataset.fmt as 'image/png' | 'image/jpeg' | 'image/webp';
        if (fmt) {
          this.exportFormat = fmt;
          this.updateInspectorTab();
        }
      });
    });

    const qSlider = this.overlay.querySelector<HTMLInputElement>('#slider-export-quality');
    qSlider?.addEventListener('input', () => {
      const q = parseInt(qSlider.value, 10) / 100;
      this.exportQuality = q;
      const qLabel = this.overlay?.querySelector('#val-export-quality');
      if (qLabel) qLabel.textContent = `${Math.round(q * 100)}%`;
    });
  }

  private bindViewportPanZoom(): void {
    const viewport = this.overlay?.querySelector<HTMLElement>('#studio-viewport');
    if (!viewport) return;

    viewport.addEventListener('wheel', (e) => {
      e.preventDefault();
      const zoomFactor = e.deltaY < 0 ? 1.15 : 0.85;
      this.setZoom(this.zoom * zoomFactor);
    });

    viewport.addEventListener('pointerdown', (e) => {
      // Ignore if clicking on crop box handles
      if ((e.target as HTMLElement).closest('.studio-crop-box')) return;
      this.isPanning = true;
      this.startPanX = e.clientX - this.panX;
      this.startPanY = e.clientY - this.panY;
      viewport.setPointerCapture(e.pointerId);
    });

    viewport.addEventListener('pointermove', (e) => {
      if (!this.isPanning) return;
      this.panX = e.clientX - this.startPanX;
      this.panY = e.clientY - this.startPanY;
      this.updateTransform();
    });

    viewport.addEventListener('pointerup', (e) => {
      if (this.isPanning) {
        this.isPanning = false;
        try {
          viewport.releasePointerCapture(e.pointerId);
        } catch {
          // pointer capture release fallback
        }
      }
    });
  }

  private bindCropHandles(): void {
    const cropBox = this.overlay?.querySelector<HTMLElement>('#studio-crop-box');
    if (!cropBox) return;

    cropBox.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      const handleEl = (e.target as HTMLElement).closest<HTMLElement>('.crop-handle');
      this.activeHandle = handleEl ? handleEl.dataset.handle || null : 'move';
      this.dragStartX = e.clientX;
      this.dragStartY = e.clientY;
      this.dragStartCrop = { ...(this.recipe.crop || this.cropNormalized) };
      cropBox.setPointerCapture(e.pointerId);
    });

    cropBox.addEventListener('pointermove', (e) => {
      if (!this.activeHandle) return;
      e.stopPropagation();

      const canvas = this.overlay?.querySelector<HTMLCanvasElement>('#studio-render-canvas');
      if (!canvas || canvas.clientWidth <= 0 || canvas.clientHeight <= 0) return;

      const deltaX = (e.clientX - this.dragStartX) / (canvas.clientWidth * this.zoom);
      const deltaY = (e.clientY - this.dragStartY) / (canvas.clientHeight * this.zoom);

      const ratioVal = this.getAspectRatioValue();
      const canvasAspect = canvas.width / canvas.height;
      const rNorm = ratioVal ? ratioVal / canvasAspect : null;

      this.cropNormalized = resizeCropRect(this.dragStartCrop, {
        handle: this.activeHandle,
        deltaX,
        deltaY,
        rNorm,
      });

      this.recipe.crop = { ...this.cropNormalized };
      this.updateCropBoxOverlay();
    });

    cropBox.addEventListener('pointerup', (e) => {
      if (this.activeHandle) {
        this.activeHandle = null;
        try {
          cropBox.releasePointerCapture(e.pointerId);
        } catch {
          // ignore
        }
        this.requestRender();
      }
    });
  }

  private setAspectRatio(ratio: AspectRatioPreset): void {
    this.activeAspectRatio = ratio;
    this.isCropActive = true;

    this.overlay?.querySelectorAll('.dock-ratio-btn').forEach((b) => {
      b.classList.toggle('active', (b as HTMLElement).dataset.ratio === ratio);
    });

    const ratioVal = this.getAspectRatioValue();
    if (!ratioVal) {
      this.cropNormalized = { x: 0.05, y: 0.05, width: 0.9, height: 0.9 };
    } else {
      const canvas = this.overlay?.querySelector<HTMLCanvasElement>('#studio-render-canvas');
      const canvasAspect = canvas && canvas.height > 0 ? canvas.width / canvas.height : 1;
      let w = 0.85;
      let h = (w * canvasAspect) / ratioVal;
      if (h > 0.85) {
        h = 0.85;
        w = (h * ratioVal) / canvasAspect;
      }
      const x = (1 - w) / 2;
      const y = (1 - h) / 2;
      this.cropNormalized = clampCrop({ x, y, width: w, height: h })!;
    }

    this.recipe.crop = { ...this.cropNormalized };
    this.updateCropBoxOverlay();
    this.requestRender();
  }

  private getAspectRatioValue(): number | null {
    switch (this.activeAspectRatio) {
      case '1:1':
        return 1.0;
      case 'a4-portrait':
        return 1 / 1.4142;
      case 'a4-landscape':
        return 1.4142;
      case '4:3':
        return 4 / 3;
      case '16:9':
        return 16 / 9;
      case 'passport':
        return 35 / 45;
      case 'free':
      default:
        return null;
    }
  }

  private updateCropUI(): void {
    if (!this.overlay) return;
    const lang = getLanguage();
    const toggleBtn = this.overlay.querySelector<HTMLElement>('#studio-toggle-crop-btn');
    if (toggleBtn) {
      toggleBtn.className = `btn btn-xs ${this.isCropActive ? 'btn-primary' : 'btn-secondary'}`;
      const span = toggleBtn.querySelector('span');
      if (span) {
        span.textContent = this.isCropActive
          ? lang === 'th'
            ? 'เปิดอยู่'
            : 'Active'
          : lang === 'th'
          ? 'ครอป'
          : 'Crop';
      }
    }

    // Toggle reset crop button visibility if present
    const resetCropBtn = this.overlay.querySelector<HTMLElement>('#studio-clear-crop-btn');
    if (resetCropBtn) {
      resetCropBtn.style.display = this.recipe.crop ? 'block' : 'none';
    }

    this.updateCropBoxOverlay();
  }

  private updateCropBoxOverlay(): void {
    const overlayEl = this.overlay?.querySelector<HTMLElement>('#studio-crop-overlay');
    const cropBoxEl = this.overlay?.querySelector<HTMLElement>('#studio-crop-box');
    if (!overlayEl || !cropBoxEl) return;

    overlayEl.classList.toggle('visible', this.isCropActive);

    const c = this.recipe.crop || this.cropNormalized;
    cropBoxEl.style.left = `${(c.x * 100).toFixed(2)}%`;
    cropBoxEl.style.top = `${(c.y * 100).toFixed(2)}%`;
    cropBoxEl.style.width = `${(c.width * 100).toFixed(2)}%`;
    cropBoxEl.style.height = `${(c.height * 100).toFixed(2)}%`;
  }

  private setZoom(newZoom: number): void {
    this.zoom = Math.max(0.2, Math.min(4.0, newZoom));
    const readout = this.overlay?.querySelector('#studio-zoom-val');
    if (readout) readout.textContent = `${Math.round(this.zoom * 100)}%`;
    this.updateTransform();
  }

  private fitToViewport(): void {
    const viewport = this.overlay?.querySelector<HTMLElement>('#studio-viewport');
    if (!viewport || this.originalWidth <= 0 || this.originalHeight <= 0) {
      this.setZoom(1.0);
      return;
    }

    const availableW = viewport.clientWidth - 80;
    const availableH = viewport.clientHeight - 80;
    const zoomW = availableW / this.originalWidth;
    const zoomH = availableH / this.originalHeight;
    const targetZoom = Math.min(zoomW, zoomH, 1.0);

    this.panX = 0;
    this.panY = 0;
    this.setZoom(targetZoom);
  }

  private updateTransform(): void {
    const anchor = this.overlay?.querySelector<HTMLElement>('#studio-canvas-anchor');
    if (anchor) {
      anchor.style.transform = `translate(${this.panX}px, ${this.panY}px) scale(${this.zoom})`;
    }
  }

  private requestRender(): void {
    if (this.renderPending) return;
    this.renderPending = true;

    requestAnimationFrame(() => {
      this.renderPending = false;
      this.renderCanvas();
    });
  }

  private renderCanvas(): void {
    if (!this.sourceImage || !this.overlay) return;

    const displayCanvas = this.overlay.querySelector<HTMLCanvasElement>('#studio-render-canvas');
    if (!displayCanvas) return;

    // Render non-destructive preview
    // Note: When crop is active, display the full transformed image with crop frame on top
    const renderRecipe: PhotoAdjustmentRecipe = {
      ...this.recipe,
      crop: undefined, // Viewport shows full canvas with overlay frame
    };

    const rendered = renderRecipeToCanvas(this.sourceImage, renderRecipe);

    displayCanvas.width = rendered.width;
    displayCanvas.height = rendered.height;
    const ctx = displayCanvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(rendered, 0, 0);
    }

    // Free intermediate rendered canvas
    rendered.width = 0;
    rendered.height = 0;

    this.updateCropBoxOverlay();
    this.updateTransform();
  }

  private bindActionButtons(): void {
    if (!this.overlay) return;

    // 1. Download
    this.overlay.querySelector('#studio-download-btn')?.addEventListener('click', async () => {
      if (!this.sourceImage) return;
      const result = await processPhoto(this.sourceImage, this.recipe, {
        format: this.exportFormat,
        quality: this.exportQuality,
      });

      const ext = this.exportFormat === 'image/jpeg' ? 'jpg' : this.exportFormat === 'image/webp' ? 'webp' : 'png';
      const filename = `mepdf_photo_${Date.now()}.${ext}`;

      downloadBlob(result.blob, filename);

      this.events.onDownload?.({
        ...result,
        action: 'download',
        format: this.exportFormat,
        targetPageIndex: this.pageIndex,
        docId: this.docId,
        docName: this.docName,
      });
    });

    // 2. Insert as New Page
    this.overlay.querySelector('#studio-insert-page-btn')?.addEventListener('click', async () => {
      if (!this.sourceImage) return;
      const result = await processPhoto(this.sourceImage, this.recipe, {
        format: this.exportFormat,
        quality: this.exportQuality,
      });

      await this.events.onInsertAsNewPage?.({
        ...result,
        action: 'insert-new',
        format: this.exportFormat,
        targetPageIndex: this.pageIndex,
        docId: this.docId,
        docName: this.docName,
      });

      this.close();
    });

    // 3. Apply to Current Page
    this.overlay.querySelector('#studio-apply-page-btn')?.addEventListener('click', async () => {
      if (!this.sourceImage) return;
      const result = await processPhoto(this.sourceImage, this.recipe, {
        format: this.exportFormat,
        quality: this.exportQuality,
      });

      await this.events.onApplyToCurrentPage?.({
        ...result,
        action: 'apply-page',
        format: this.exportFormat,
        targetPageIndex: this.pageIndex,
        docId: this.docId,
        docName: this.docName,
      });

      this.close();
    });
  }

  private refreshIcons(): void {
    if (typeof document !== 'undefined') {
      createIcons({
        icons: {
          Crop,
          RotateCw,
          FlipHorizontal,
          FlipVertical,
          Sparkles,
          Wand2,
          Sliders,
          FileText,
          Image: ImageIcon,
          Download,
          Plus,
          Check,
          X,
          ZoomIn,
          ZoomOut,
          Maximize2,
          Eye,
          Undo,
        },
      });
    }
  }

  private escape(str: string): string {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
}
