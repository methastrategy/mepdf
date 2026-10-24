import {
  createIcons,
  Layers,
  Stamp,
  Hash,
  Minimize2,
  Lock,
  Tag,
  Scissors,
  RotateCw,
  Trash2,
  Copy,
  ChevronRight,
  ChevronLeft,
  Sparkles,
  Download,
  ShieldCheck,
  FileText,
  Image,
} from 'lucide';
import type { WatermarkPreviewState, PageNumberPreviewState } from './CockpitCanvas';
import { escapeHtml } from '../utils/file-utils';

export type InspectorTab = 'tools' | 'watermark' | 'numbers' | 'compress' | 'protect' | 'metadata' | 'convert';

export interface CockpitInspectorEvents {
  onTabChange: (tab: InspectorTab) => void;
  onRotateSelected: (degrees: number) => void;
  onRotateAll: (degrees: number) => void;
  onDeleteSelected: () => void;
  onDuplicateActive: () => void;
  onOpenSplit: () => void;
  // Watermark
  onWatermarkPreviewChange: (state: Partial<WatermarkPreviewState>) => void;
  onApplyWatermark: (options: {
    text: string;
    fontSize: number;
    opacity: number;
    color: string;
    rotation: number;
    repeat: boolean;
  }) => void;
  // Page Numbers
  onPageNumberPreviewChange: (state: Partial<PageNumberPreviewState>) => void;
  onApplyPageNumbers: (options: {
    format: string;
    position: 'bottom-center' | 'bottom-right' | 'bottom-left' | 'top-center' | 'top-right' | 'top-left';
    margin: number;
    fontSize: number;
    color: string;
  }) => void;
  // Compress
  onApplyCompress: (options: {
    engine: 'lossless' | 'scanned';
    quality: number;
    dpi: number;
  }) => void;
  // Protect
  onApplyProtect: (password: string) => void;
  // Metadata
  onApplyMetadata: (meta: { title: string; author: string; subject: string; keywords: string }) => void;
  onSanitizeMetadata: () => void;
  // Convert
  onImagesToPdf: () => void;
  onPdfToImages: () => void;
  onExtractText: () => void;
}

export class CockpitInspector {
  private container: HTMLElement;
  private events: CockpitInspectorEvents;
  private activeTab: InspectorTab = 'tools';
  private isCollapsed = false;
  private selectedCount = 0;
  private totalPages = 0;

  // Local form state for reactive updates
  private wmText = 'CONFIDENTIAL';
  private wmFontSize = 48;
  private wmOpacity = 0.25;
  private wmColor = '#000000';
  private wmRotation = 45;
  private wmRepeat = false;

  private pnFormat = '{n} / {total}';
  private pnPosition: 'bottom-center' | 'bottom-right' | 'bottom-left' | 'top-center' | 'top-right' | 'top-left' = 'bottom-center';
  private pnMargin = 30;
  private pnFontSize = 12;
  private pnColor = '#000000';

  private compEngine: 'lossless' | 'scanned' = 'lossless';
  private compQuality = 75;
  private compDpi = 150;

  constructor(container: HTMLElement, events: CockpitInspectorEvents) {
    this.container = container;
    this.events = events;
  }

  setState(options: { selectedCount: number; totalPages: number }): void {
    this.selectedCount = options.selectedCount;
    this.totalPages = options.totalPages;
    this.render();
  }

  setActiveTab(tab: InspectorTab): void {
    this.activeTab = tab;
    this.isCollapsed = false;
    this.render();
    this.notifyPreviewUpdates();
  }

  getActiveTab(): InspectorTab {
    return this.activeTab;
  }

  setCollapsed(collapsed: boolean): void {
    this.isCollapsed = collapsed;
    this.container.classList.toggle('collapsed', collapsed);
    this.render();
  }

  isPanelCollapsed(): boolean {
    return this.isCollapsed;
  }

  render(): void {
    if (this.isCollapsed) {
      this.container.innerHTML = `
        <div class="cockpit-inspector-collapsed">
          <button class="btn btn-ghost btn-icon-only" id="inspector-btn-expand" title="Expand Inspector">
            <i data-lucide="chevron-left" style="width: 16px; height: 16px;"></i>
          </button>
        </div>
      `;
      this.container.querySelector('#inspector-btn-expand')?.addEventListener('click', () => {
        this.setCollapsed(false);
      });
      this.refreshIcons();
      return;
    }

    this.container.innerHTML = `
      <div class="cockpit-inspector-inner">
        <!-- Inspector Header & Tab Navigation -->
        <div class="inspector-header">
          <div class="inspector-header-top">
            <span class="inspector-badge">
              <i data-lucide="sparkles" style="width: 12px; height: 12px; color: var(--primary);"></i>
              <span>INSPECTOR</span>
            </span>
            <button class="btn btn-ghost btn-sm btn-icon" id="inspector-btn-collapse" title="Collapse panel">
              <i data-lucide="chevron-right" style="width: 14px; height: 14px;"></i>
            </button>
          </div>

          <!-- Horizontal icon tab strip -->
          <div class="inspector-tabs-nav">
            <button class="inspector-nav-btn ${this.activeTab === 'tools' ? 'active' : ''}" data-tab="tools" title="Page Tools">
              <i data-lucide="layers" style="width: 14px; height: 14px;"></i>
              <span>Tools</span>
            </button>
            <button class="inspector-nav-btn ${this.activeTab === 'watermark' ? 'active' : ''}" data-tab="watermark" title="Watermark">
              <i data-lucide="stamp" style="width: 14px; height: 14px;"></i>
              <span>Watermark</span>
            </button>
            <button class="inspector-nav-btn ${this.activeTab === 'numbers' ? 'active' : ''}" data-tab="numbers" title="Page Numbers">
              <i data-lucide="hash" style="width: 14px; height: 14px;"></i>
              <span>Numbers</span>
            </button>
            <button class="inspector-nav-btn ${this.activeTab === 'compress' ? 'active' : ''}" data-tab="compress" title="Compress PDF">
              <i data-lucide="minimize-2" style="width: 14px; height: 14px;"></i>
              <span>Compress</span>
            </button>
            <button class="inspector-nav-btn ${this.activeTab === 'protect' ? 'active' : ''}" data-tab="protect" title="Protect & Encrypt">
              <i data-lucide="lock" style="width: 14px; height: 14px;"></i>
              <span>Protect</span>
            </button>
            <button class="inspector-nav-btn ${this.activeTab === 'metadata' ? 'active' : ''}" data-tab="metadata" title="Metadata">
              <i data-lucide="tag" style="width: 14px; height: 14px;"></i>
              <span>Metadata</span>
            </button>
            <button class="inspector-nav-btn ${this.activeTab === 'convert' ? 'active' : ''}" data-tab="convert" title="Convert & OCR">
              <i data-lucide="file-text" style="width: 14px; height: 14px;"></i>
              <span>Convert</span>
            </button>
          </div>
        </div>

        <!-- Inspector Scrollable Body -->
        <div class="inspector-content" id="inspector-content-pane">
          ${this.renderTabContent()}
        </div>
      </div>
    `;

    this.attachEventListeners();
    this.refreshIcons();
  }

  private renderTabContent(): string {
    switch (this.activeTab) {
      case 'tools':
        return this.renderToolsTab();
      case 'watermark':
        return this.renderWatermarkTab();
      case 'numbers':
        return this.renderNumbersTab();
      case 'compress':
        return this.renderCompressTab();
      case 'protect':
        return this.renderProtectTab();
      case 'metadata':
        return this.renderMetadataTab();
      case 'convert':
        return this.renderConvertTab();
      default:
        return this.renderToolsTab();
    }
  }

  private renderToolsTab(): string {
    return `
      <div class="inspector-section">
        <h4 class="inspector-section-title">Page Manipulation</h4>
        <p class="inspector-help-text">Rotate, duplicate, or split pages directly in the cockpit.</p>
        
        <div class="inspector-btn-grid">
          <button class="btn btn-secondary" id="insp-btn-rotate-sel" ${this.selectedCount === 0 ? 'disabled' : ''}>
            <i data-lucide="rotate-cw" style="width: 14px; height: 14px;"></i>
            <span>Rotate Selected (${this.selectedCount})</span>
          </button>
          <button class="btn btn-secondary" id="insp-btn-rotate-all">
            <i data-lucide="rotate-cw" style="width: 14px; height: 14px;"></i>
            <span>Rotate All (${this.totalPages})</span>
          </button>
          <button class="btn btn-secondary" id="insp-btn-duplicate">
            <i data-lucide="copy" style="width: 14px; height: 14px;"></i>
            <span>Duplicate Active Page</span>
          </button>
          <button class="btn btn-secondary" id="insp-btn-split">
            <i data-lucide="scissors" style="width: 14px; height: 14px;"></i>
            <span>Split Document...</span>
          </button>
        </div>

        <div class="inspector-divider"></div>

        <h4 class="inspector-section-title">Selection Cleanup</h4>
        <button class="btn btn-danger-outline w-full" id="insp-btn-del-sel" ${this.selectedCount === 0 ? 'disabled' : ''}>
          <i data-lucide="trash-2" style="width: 14px; height: 14px;"></i>
          <span>Delete ${this.selectedCount > 0 ? `${this.selectedCount} Selected Pages` : 'Selected Pages'}</span>
        </button>
      </div>
    `;
  }

  private renderWatermarkTab(): string {
    return `
      <div class="inspector-section">
        <div class="inspector-section-header">
          <h4 class="inspector-section-title">Real-Time Watermark</h4>
          <span class="live-pill">LIVE PREVIEW</span>
        </div>
        <p class="inspector-help-text">Changes render dynamically on the center canvas stage.</p>

        <div class="form-group">
          <label class="form-label" for="insp-wm-text">Watermark Text</label>
          <input type="text" id="insp-wm-text" class="input-text" value="${escapeHtml(this.wmText)}" placeholder="e.g. CONFIDENTIAL" />
        </div>

        <div class="form-group">
          <div class="form-label-row">
            <label class="form-label" for="insp-wm-size">Font Size</label>
            <span class="val-badge" id="insp-wm-size-val">${this.wmFontSize} pt</span>
          </div>
          <input type="range" id="insp-wm-size" class="slider" min="16" max="96" step="2" value="${this.wmFontSize}" />
        </div>

        <div class="form-group">
          <div class="form-label-row">
            <label class="form-label" for="insp-wm-opacity">Opacity</label>
            <span class="val-badge" id="insp-wm-opacity-val">${Math.round(this.wmOpacity * 100)}%</span>
          </div>
          <input type="range" id="insp-wm-opacity" class="slider" min="0.05" max="0.9" step="0.05" value="${this.wmOpacity}" />
        </div>

        <div class="form-group">
          <div class="form-label-row">
            <label class="form-label" for="insp-wm-rot">Rotation Angle</label>
            <span class="val-badge" id="insp-wm-rot-val">${this.wmRotation}°</span>
          </div>
          <input type="range" id="insp-wm-rot" class="slider" min="-90" max="90" step="5" value="${this.wmRotation}" />
          <div class="slider-presets-row">
            <button class="chip-preset" data-wm-angle="0">0°</button>
            <button class="chip-preset" data-wm-angle="45">45° (Diagonal)</button>
            <button class="chip-preset" data-wm-angle="-45">-45°</button>
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">Color Preset</label>
          <div class="color-presets-row">
            <button class="color-swatch ${this.wmColor === '#000000' ? 'active' : ''}" data-color="#000000" style="background: #000000;"></button>
            <button class="color-swatch ${this.wmColor === '#ef4444' ? 'active' : ''}" data-color="#ef4444" style="background: #ef4444;"></button>
            <button class="color-swatch ${this.wmColor === '#1c69d4' ? 'active' : ''}" data-color="#1c69d4" style="background: #1c69d4;"></button>
            <button class="color-swatch ${this.wmColor === '#10b981' ? 'active' : ''}" data-color="#10b981" style="background: #10b981;"></button>
            <button class="color-swatch ${this.wmColor === '#888888' ? 'active' : ''}" data-color="#888888" style="background: #888888;"></button>
          </div>
        </div>

        <div class="form-group">
          <label class="checkbox-label">
            <input type="checkbox" id="insp-wm-repeat" ${this.wmRepeat ? 'checked' : ''} />
            <span>Tile / Repeat Across Page</span>
          </label>
        </div>

        <div class="inspector-divider"></div>

        <button class="btn btn-primary w-full" id="insp-wm-apply-btn">
          <i data-lucide="download" style="width: 15px; height: 15px;"></i>
          <span>Apply Watermark & Export</span>
        </button>
      </div>
    `;
  }

  private renderNumbersTab(): string {
    return `
      <div class="inspector-section">
        <div class="inspector-section-header">
          <h4 class="inspector-section-title">Page Numbering</h4>
          <span class="live-pill">LIVE PREVIEW</span>
        </div>
        <p class="inspector-help-text">Real-time overlay on the center canvas stage.</p>

        <div class="form-group">
          <label class="form-label" for="insp-pn-format">Number Format</label>
          <select id="insp-pn-format" class="input-select">
            <option value="{n}" ${this.pnFormat === '{n}' ? 'selected' : ''}>Page 1, 2, 3... ({n})</option>
            <option value="Page {n}" ${this.pnFormat === 'Page {n}' ? 'selected' : ''}>Page {n}</option>
            <option value="{n} / {total}" ${this.pnFormat === '{n} / {total}' ? 'selected' : ''}>1 / ${this.totalPages} ({n} / {total})</option>
            <option value="Page {n} of {total}" ${this.pnFormat === 'Page {n} of {total}' ? 'selected' : ''}>Page {n} of {total}</option>
            <option value="- {n} -" ${this.pnFormat === '- {n} -' ? 'selected' : ''}>- {n} -</option>
          </select>
        </div>

        <div class="form-group">
          <label class="form-label">Position Grid</label>
          <div class="position-matrix">
            <button class="pos-cell ${this.pnPosition === 'top-left' ? 'active' : ''}" data-pos="top-left">Top Left</button>
            <button class="pos-cell ${this.pnPosition === 'top-center' ? 'active' : ''}" data-pos="top-center">Top Center</button>
            <button class="pos-cell ${this.pnPosition === 'top-right' ? 'active' : ''}" data-pos="top-right">Top Right</button>
            <button class="pos-cell ${this.pnPosition === 'bottom-left' ? 'active' : ''}" data-pos="bottom-left">Bottom Left</button>
            <button class="pos-cell ${this.pnPosition === 'bottom-center' ? 'active' : ''}" data-pos="bottom-center">Bottom Center</button>
            <button class="pos-cell ${this.pnPosition === 'bottom-right' ? 'active' : ''}" data-pos="bottom-right">Bottom Right</button>
          </div>
        </div>

        <div class="form-group">
          <div class="form-label-row">
            <label class="form-label" for="insp-pn-margin">Margin</label>
            <span class="val-badge" id="insp-pn-margin-val">${this.pnMargin} pt</span>
          </div>
          <input type="range" id="insp-pn-margin" class="slider" min="10" max="60" step="5" value="${this.pnMargin}" />
        </div>

        <div class="form-group">
          <div class="form-label-row">
            <label class="form-label" for="insp-pn-size">Font Size</label>
            <span class="val-badge" id="insp-pn-size-val">${this.pnFontSize} pt</span>
          </div>
          <input type="range" id="insp-pn-size" class="slider" min="8" max="24" step="1" value="${this.pnFontSize}" />
        </div>

        <div class="inspector-divider"></div>

        <button class="btn btn-primary w-full" id="insp-pn-apply-btn">
          <i data-lucide="download" style="width: 15px; height: 15px;"></i>
          <span>Apply Numbers & Export</span>
        </button>
      </div>
    `;
  }

  private renderCompressTab(): string {
    return `
      <div class="inspector-section">
        <h4 class="inspector-section-title">Lossless & Smart Compression</h4>
        <p class="inspector-help-text">Optimize file size directly with the Web Worker pipeline.</p>

        <div class="engine-toggle-cards">
          <div class="engine-card ${this.compEngine === 'lossless' ? 'active' : ''}" data-engine="lossless">
            <div class="engine-card-header">
              <span class="engine-title">Lossless Vector</span>
              <span class="engine-badge">Recommended</span>
            </div>
            <p class="engine-desc">100% text vector preservation & Ctrl+F searchability. Deflates PDF object streams.</p>
          </div>

          <div class="engine-card ${this.compEngine === 'scanned' ? 'active' : ''}" data-engine="scanned">
            <div class="engine-card-header">
              <span class="engine-title">Scanned Paper Mode</span>
            </div>
            <p class="engine-desc">Downsamples high-DPI scanned graphics and photos to target DPI.</p>
          </div>
        </div>

        ${this.compEngine === 'scanned' ? `
          <div class="form-group">
            <div class="form-label-row">
              <label class="form-label" for="insp-comp-quality">JPEG Quality</label>
              <span class="val-badge">${this.compQuality}%</span>
            </div>
            <input type="range" id="insp-comp-quality" class="slider" min="20" max="95" step="5" value="${this.compQuality}" />
          </div>

          <div class="form-group">
            <label class="form-label">Target Resolution</label>
            <div class="slider-presets-row">
              <button class="chip-preset ${this.compDpi === 96 ? 'active' : ''}" data-dpi="96">Screen (96 DPI)</button>
              <button class="chip-preset ${this.compDpi === 150 ? 'active' : ''}" data-dpi="150">Ebook (150 DPI)</button>
              <button class="chip-preset ${this.compDpi === 300 ? 'active' : ''}" data-dpi="300">Print (300 DPI)</button>
            </div>
          </div>
        ` : ''}

        <div class="inspector-divider"></div>

        <button class="btn btn-primary w-full" id="insp-comp-apply-btn">
          <i data-lucide="minimize-2" style="width: 15px; height: 15px;"></i>
          <span>Compress & Download</span>
        </button>
      </div>
    `;
  }

  private renderProtectTab(): string {
    return `
      <div class="inspector-section">
        <h4 class="inspector-section-title">Document Security</h4>
        <p class="inspector-help-text">Client-side 256-bit AES encryption with zero server transmission.</p>

        <div class="form-group">
          <label class="form-label" for="insp-protect-pass">Password</label>
          <input type="password" id="insp-protect-pass" class="input-text" placeholder="Enter secure password" />
        </div>

        <div class="form-group">
          <label class="form-label" for="insp-protect-confirm">Confirm Password</label>
          <input type="password" id="insp-protect-confirm" class="input-text" placeholder="Repeat password" />
        </div>

        <div class="inspector-divider"></div>

        <button class="btn btn-primary w-full" id="insp-protect-apply-btn">
          <i data-lucide="lock" style="width: 15px; height: 15px;"></i>
          <span>Encrypt & Download PDF</span>
        </button>
      </div>
    `;
  }

  private renderMetadataTab(): string {
    return `
      <div class="inspector-section">
        <h4 class="inspector-section-title">Document Metadata</h4>
        <p class="inspector-help-text">View and edit document tags or sanitize hidden tracking info.</p>

        <div class="form-group">
          <label class="form-label" for="insp-meta-title">Title</label>
          <input type="text" id="insp-meta-title" class="input-text" placeholder="Document Title" />
        </div>

        <div class="form-group">
          <label class="form-label" for="insp-meta-author">Author</label>
          <input type="text" id="insp-meta-author" class="input-text" placeholder="Author Name" />
        </div>

        <div class="form-group">
          <label class="form-label" for="insp-meta-subject">Subject</label>
          <input type="text" id="insp-meta-subject" class="input-text" placeholder="Subject" />
        </div>

        <div class="form-group">
          <label class="form-label" for="insp-meta-keywords">Keywords</label>
          <input type="text" id="insp-meta-keywords" class="input-text" placeholder="tag1, tag2, tag3" />
        </div>

        <div class="inspector-divider"></div>

        <div class="inspector-btn-stack">
          <button class="btn btn-primary w-full" id="insp-meta-apply-btn">
            <i data-lucide="download" style="width: 15px; height: 15px;"></i>
            <span>Save Metadata & Export</span>
          </button>
          <button class="btn btn-danger-outline w-full" id="insp-meta-sanitize-btn" title="Remove all author, creation dates, and metadata">
            <i data-lucide="shield-check" style="width: 15px; height: 15px;"></i>
            <span>Sanitize All Metadata</span>
          </button>
        </div>
      </div>
    `;
  }

  private renderConvertTab(): string {
    return `
      <div class="inspector-section">
        <h4 class="inspector-section-title">Convert & Extract</h4>
        <p class="inspector-help-text">Interchange formats smoothly.</p>

        <div class="inspector-btn-stack">
          <button class="btn btn-secondary w-full text-left" id="insp-conv-pdf2img">
            <i data-lucide="image" style="width: 16px; height: 16px; color: var(--primary);"></i>
            <div>
              <strong>PDF to Images (ZIP)</strong>
              <div class="btn-subtext">Render every page into high-res PNG/JPG</div>
            </div>
          </button>

          <button class="btn btn-secondary w-full text-left" id="insp-conv-extract-txt">
            <i data-lucide="file-text" style="width: 16px; height: 16px; color: var(--primary);"></i>
            <div>
              <strong>Extract Text & Copy</strong>
              <div class="btn-subtext">Extract full text from all pages</div>
            </div>
          </button>

          <button class="btn btn-secondary w-full text-left" id="insp-conv-img2pdf">
            <i data-lucide="layers" style="width: 16px; height: 16px; color: var(--primary);"></i>
            <div>
              <strong>Images to PDF</strong>
              <div class="btn-subtext">Convert photos/images into a single PDF</div>
            </div>
          </button>
        </div>
      </div>
    `;
  }

  private notifyPreviewUpdates(): void {
    if (this.activeTab === 'watermark') {
      this.events.onWatermarkPreviewChange({
        enabled: true,
        text: this.wmText,
        fontSize: this.wmFontSize,
        opacity: this.wmOpacity,
        color: this.wmColor,
        rotation: this.wmRotation,
        repeat: this.wmRepeat,
      });
      this.events.onPageNumberPreviewChange({ enabled: false });
    } else if (this.activeTab === 'numbers') {
      this.events.onPageNumberPreviewChange({
        enabled: true,
        format: this.pnFormat,
        position: this.pnPosition,
        margin: this.pnMargin,
        fontSize: this.pnFontSize,
        color: this.pnColor,
      });
      this.events.onWatermarkPreviewChange({ enabled: false });
    } else {
      this.events.onWatermarkPreviewChange({ enabled: false });
      this.events.onPageNumberPreviewChange({ enabled: false });
    }
  }

  private attachEventListeners(): void {
    // Tab switching
    const navBtns = this.container.querySelectorAll<HTMLButtonElement>('.inspector-nav-btn');
    navBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const tab = btn.getAttribute('data-tab') as InspectorTab;
        if (tab) {
          this.activeTab = tab;
          this.events.onTabChange(tab);
          this.render();
          this.notifyPreviewUpdates();
        }
      });
    });

    // Collapse panel
    const collapseBtn = this.container.querySelector('#inspector-btn-collapse');
    collapseBtn?.addEventListener('click', () => {
      this.setCollapsed(true);
    });

    // Tab-specific handlers
    if (this.activeTab === 'tools') {
      this.container.querySelector('#insp-btn-rotate-sel')?.addEventListener('click', () => {
        this.events.onRotateSelected(90);
      });
      this.container.querySelector('#insp-btn-rotate-all')?.addEventListener('click', () => {
        this.events.onRotateAll(90);
      });
      this.container.querySelector('#insp-btn-duplicate')?.addEventListener('click', () => {
        this.events.onDuplicateActive();
      });
      this.container.querySelector('#insp-btn-split')?.addEventListener('click', () => {
        this.events.onOpenSplit();
      });
      this.container.querySelector('#insp-btn-del-sel')?.addEventListener('click', () => {
        this.events.onDeleteSelected();
      });
    }

    if (this.activeTab === 'watermark') {
      const textInput = this.container.querySelector<HTMLInputElement>('#insp-wm-text');
      textInput?.addEventListener('input', () => {
        this.wmText = textInput.value;
        this.notifyPreviewUpdates();
      });

      const sizeInput = this.container.querySelector<HTMLInputElement>('#insp-wm-size');
      const sizeVal = this.container.querySelector('#insp-wm-size-val');
      sizeInput?.addEventListener('input', () => {
        this.wmFontSize = Number(sizeInput.value);
        if (sizeVal) sizeVal.textContent = `${this.wmFontSize} pt`;
        this.notifyPreviewUpdates();
      });

      const opInput = this.container.querySelector<HTMLInputElement>('#insp-wm-opacity');
      const opVal = this.container.querySelector('#insp-wm-opacity-val');
      opInput?.addEventListener('input', () => {
        this.wmOpacity = Number(opInput.value);
        if (opVal) opVal.textContent = `${Math.round(this.wmOpacity * 100)}%`;
        this.notifyPreviewUpdates();
      });

      const rotInput = this.container.querySelector<HTMLInputElement>('#insp-wm-rot');
      const rotVal = this.container.querySelector('#insp-wm-rot-val');
      rotInput?.addEventListener('input', () => {
        this.wmRotation = Number(rotInput.value);
        if (rotVal) rotVal.textContent = `${this.wmRotation}°`;
        this.notifyPreviewUpdates();
      });

      this.container.querySelectorAll<HTMLButtonElement>('.chip-preset[data-wm-angle]').forEach((btn) => {
        btn.addEventListener('click', () => {
          this.wmRotation = Number(btn.getAttribute('data-wm-angle'));
          if (rotInput) rotInput.value = String(this.wmRotation);
          if (rotVal) rotVal.textContent = `${this.wmRotation}°`;
          this.notifyPreviewUpdates();
        });
      });

      this.container.querySelectorAll<HTMLButtonElement>('.color-swatch').forEach((btn) => {
        btn.addEventListener('click', () => {
          this.wmColor = btn.getAttribute('data-color') || '#000000';
          this.container.querySelectorAll('.color-swatch').forEach((s) => s.classList.remove('active'));
          btn.classList.add('active');
          this.notifyPreviewUpdates();
        });
      });

      const repeatInput = this.container.querySelector<HTMLInputElement>('#insp-wm-repeat');
      repeatInput?.addEventListener('change', () => {
        this.wmRepeat = repeatInput.checked;
        this.notifyPreviewUpdates();
      });

      this.container.querySelector('#insp-wm-apply-btn')?.addEventListener('click', () => {
        this.events.onApplyWatermark({
          text: this.wmText,
          fontSize: this.wmFontSize,
          opacity: this.wmOpacity,
          color: this.wmColor,
          rotation: this.wmRotation,
          repeat: this.wmRepeat,
        });
      });
    }

    if (this.activeTab === 'numbers') {
      const formatSelect = this.container.querySelector<HTMLSelectElement>('#insp-pn-format');
      formatSelect?.addEventListener('change', () => {
        this.pnFormat = formatSelect.value;
        this.notifyPreviewUpdates();
      });

      this.container.querySelectorAll<HTMLButtonElement>('.pos-cell').forEach((cell) => {
        cell.addEventListener('click', () => {
          this.pnPosition = (cell.getAttribute('data-pos') as any) || 'bottom-center';
          this.container.querySelectorAll('.pos-cell').forEach((c) => c.classList.remove('active'));
          cell.classList.add('active');
          this.notifyPreviewUpdates();
        });
      });

      const marginInput = this.container.querySelector<HTMLInputElement>('#insp-pn-margin');
      const marginVal = this.container.querySelector('#insp-pn-margin-val');
      marginInput?.addEventListener('input', () => {
        this.pnMargin = Number(marginInput.value);
        if (marginVal) marginVal.textContent = `${this.pnMargin} pt`;
        this.notifyPreviewUpdates();
      });

      const sizeInput = this.container.querySelector<HTMLInputElement>('#insp-pn-size');
      const sizeVal = this.container.querySelector('#insp-pn-size-val');
      sizeInput?.addEventListener('input', () => {
        this.pnFontSize = Number(sizeInput.value);
        if (sizeVal) sizeVal.textContent = `${this.pnFontSize} pt`;
        this.notifyPreviewUpdates();
      });

      this.container.querySelector('#insp-pn-apply-btn')?.addEventListener('click', () => {
        this.events.onApplyPageNumbers({
          format: this.pnFormat,
          position: this.pnPosition,
          margin: this.pnMargin,
          fontSize: this.pnFontSize,
          color: this.pnColor,
        });
      });
    }

    if (this.activeTab === 'compress') {
      this.container.querySelectorAll<HTMLElement>('.engine-card').forEach((card) => {
        card.addEventListener('click', () => {
          this.compEngine = (card.getAttribute('data-engine') as any) || 'lossless';
          this.render();
        });
      });

      this.container.querySelectorAll<HTMLButtonElement>('.chip-preset[data-dpi]').forEach((btn) => {
        btn.addEventListener('click', () => {
          this.compDpi = Number(btn.getAttribute('data-dpi'));
          this.container.querySelectorAll('.chip-preset[data-dpi]').forEach((b) => b.classList.remove('active'));
          btn.classList.add('active');
        });
      });

      this.container.querySelector('#insp-comp-apply-btn')?.addEventListener('click', () => {
        this.events.onApplyCompress({
          engine: this.compEngine,
          quality: this.compQuality,
          dpi: this.compDpi,
        });
      });
    }

    if (this.activeTab === 'protect') {
      this.container.querySelector('#insp-protect-apply-btn')?.addEventListener('click', () => {
        const pass = (this.container.querySelector('#insp-protect-pass') as HTMLInputElement)?.value;
        const confirm = (this.container.querySelector('#insp-protect-confirm') as HTMLInputElement)?.value;
        if (!pass) {
          alert('Please enter a password');
          return;
        }
        if (pass !== confirm) {
          alert('Passwords do not match');
          return;
        }
        this.events.onApplyProtect(pass);
      });
    }

    if (this.activeTab === 'metadata') {
      this.container.querySelector('#insp-meta-apply-btn')?.addEventListener('click', () => {
        const title = (this.container.querySelector('#insp-meta-title') as HTMLInputElement)?.value || '';
        const author = (this.container.querySelector('#insp-meta-author') as HTMLInputElement)?.value || '';
        const subject = (this.container.querySelector('#insp-meta-subject') as HTMLInputElement)?.value || '';
        const keywords = (this.container.querySelector('#insp-meta-keywords') as HTMLInputElement)?.value || '';
        this.events.onApplyMetadata({ title, author, subject, keywords });
      });

      this.container.querySelector('#insp-meta-sanitize-btn')?.addEventListener('click', () => {
        this.events.onSanitizeMetadata();
      });
    }

    if (this.activeTab === 'convert') {
      this.container.querySelector('#insp-conv-pdf2img')?.addEventListener('click', () => {
        this.events.onPdfToImages();
      });
      this.container.querySelector('#insp-conv-extract-txt')?.addEventListener('click', () => {
        this.events.onExtractText();
      });
      this.container.querySelector('#insp-conv-img2pdf')?.addEventListener('click', () => {
        this.events.onImagesToPdf();
      });
    }
  }

  private refreshIcons(): void {
    createIcons({
      icons: {
        Layers,
        Stamp,
        Hash,
        Minimize2,
        Lock,
        Tag,
        Scissors,
        RotateCw,
        Trash2,
        Copy,
        ChevronRight,
        ChevronLeft,
        Sparkles,
        Download,
        ShieldCheck,
        FileText,
        Image,
      },
      nameAttr: 'data-lucide',
    });
  }
}
