import {
  createIcons,
  X,
  Copy,
  Check,
  Download,
  FileText,
  Minimize2,
  Scissors,
  Image,
  AlertTriangle,
  Lock,
  Unlock,
  Layers,
} from 'lucide';
import JSZip from 'jszip';
import { formatBytes, downloadBytes, downloadBlob, escapeHtml } from '../utils/file-utils';
import { COMPRESSION_PRESETS, compressPdf } from '../core/pdf-compressor';
import {
  splitPagesByRanges,
  imagesToPdf,
  pdfToImages,
  createImagesZip,
  extractText,
  mergePages,
} from '../core/pdf-operations';
import { toast } from './Toast';
import { progressOverlay } from './ProgressOverlay';
import type { PDFPageItem, DocumentMetadata, CompressionPreset } from '../core/types';

/**
 * Returns an intuitive default split range expression based on page count
 */
export function getDefaultSplitRange(totalPages: number): string {
  if (totalPages <= 1) return '1';
  if (totalPages === 2) return '1, 2';
  const mid = Math.floor(totalPages / 2);
  const firstPart = mid === 1 ? '1' : `1-${mid}`;
  const secondPart = mid + 1 === totalPages ? `${totalPages}` : `${mid + 1}-${totalPages}`;
  return `${firstPart}, ${secondPart}`;
}

export class ModalManager {
  private overlay!: HTMLElement;
  private headerTitle!: HTMLElement;
  private bodyContent!: HTMLElement;
  private footerActions!: HTMLElement;
  private closeBtn!: HTMLButtonElement;
  private onCloseCallback: (() => void) | null = null;

  constructor() {
    this.ensureElements();
  }

  private ensureElements(): boolean {
    if (typeof document === 'undefined') return false;
    if (!this.overlay) {
      let el = document.querySelector<HTMLElement>('#app-modal-overlay');
      if (!el) {
        el = document.createElement('div');
        el.id = 'app-modal-overlay';
        el.className = 'modal-overlay';
        el.innerHTML = `
          <div class="modal-card">
            <div class="modal-header">
              <h3 class="modal-title" id="modal-header-title">Modal</h3>
              <button class="btn btn-ghost btn-icon-only" id="modal-close-btn" title="Close">
                <i data-lucide="x" style="width: 18px; height: 18px;"></i>
              </button>
            </div>
            <div class="modal-body" id="modal-body-content"></div>
            <div class="modal-footer" id="modal-footer-actions"></div>
          </div>
        `;
        document.body.appendChild(el);
      }

      this.overlay = el;
      this.headerTitle = el.querySelector('#modal-header-title')!;
      this.bodyContent = el.querySelector('#modal-body-content')!;
      this.footerActions = el.querySelector('#modal-footer-actions')!;
      this.closeBtn = el.querySelector('#modal-close-btn')!;

      this.closeBtn.addEventListener('click', () => this.close());
      this.overlay.addEventListener('click', (e) => {
        if (e.target === this.overlay) this.close();
      });

      window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && this.overlay?.classList.contains('active')) {
          this.close();
        }
      });

      this.refreshIcons();
    }
    return true;
  }

  setOnClose(cb: (() => void) | null): void {
    this.onCloseCallback = cb;
  }

  open(title: string, bodyHtml: string, footerHtml: string): void {
    if (!this.ensureElements()) return;
    this.headerTitle.innerHTML = title;
    this.bodyContent.innerHTML = bodyHtml;
    this.footerActions.innerHTML = footerHtml;
    this.overlay.classList.add('active');
    this.refreshIcons();
  }

  close(): void {
    if (this.overlay) {
      this.overlay.classList.remove('active');
    }
    if (this.onCloseCallback) {
      const cb = this.onCloseCallback;
      this.onCloseCallback = null;
      cb();
    }
  }

  private refreshIcons(): void {
    if (typeof document === 'undefined') return;
    createIcons({
      icons: {
        X,
        Copy,
        Check,
        Download,
        FileText,
        Minimize2,
        Scissors,
        Image,
        AlertTriangle,
        Lock,
        Unlock,
        Layers,
      },
      nameAttr: 'data-lucide',
    });
  }

  // ==========================================
  // COMPRESS MODAL
  // ==========================================
  showCompressModal(documentBytes: Uint8Array, filename = 'document.pdf'): void {
    let selectedPreset: CompressionPreset = 'ebook';
    let currentQuality = 0.78;
    const originalSize = documentBytes.byteLength;

    const title = `<i data-lucide="minimize-2" style="width: 18px; height: 18px; color: var(--primary);"></i> Smart PDF Compression`;
    const bodyHtml = `
      <div style="font-size: 0.875rem; color: var(--text-secondary); line-height: 1.5;">
        Downsamples high-resolution scanned graphics and optimizes page structures directly in your browser with zero server upload.
      </div>

      <div class="form-group">
        <label class="form-label">Compression Preset</label>
        <div class="preset-selector">
          <div class="preset-card" data-preset="screen" data-dpi="96" data-quality="0.65">
            <div class="preset-title">Screen</div>
            <div class="preset-desc">96 DPI • Maximum savings</div>
          </div>
          <div class="preset-card active" data-preset="ebook" data-dpi="150" data-quality="0.78">
            <div class="preset-title">Ebook</div>
            <div class="preset-desc">150 DPI • Balanced sharpness</div>
          </div>
          <div class="preset-card" data-preset="printer" data-dpi="300" data-quality="0.90">
            <div class="preset-title">Print</div>
            <div class="preset-desc">300 DPI • High quality print</div>
          </div>
        </div>
      </div>

      <div class="form-group">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <label class="form-label" for="compress-quality-slider">Quality Slider</label>
          <span id="compress-quality-value" style="font-size: 0.8125rem; font-weight: 700; color: var(--primary);">78%</span>
        </div>
        <input type="range" class="form-range" id="compress-quality-slider" min="10" max="95" value="78" step="1" />
        <div style="display: flex; justify-content: space-between; font-size: 0.6875rem; color: var(--text-muted); margin-top: 0.2rem;">
          <span>Maximum Compression (10%)</span>
          <span>Balanced (75%)</span>
          <span>Maximum Quality (95%)</span>
        </div>
      </div>

      <div class="size-comparison-card" style="background: var(--surface-raised); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); padding: 1.1rem;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
          <div>
            <div style="font-size: 0.75rem; color: var(--text-muted);">Current File Size</div>
            <div style="font-size: 1.15rem; font-weight: 700; color: var(--text-primary);">${formatBytes(originalSize)}</div>
          </div>
          <div id="compress-result-box" style="text-align: right; display: none;">
            <div style="font-size: 0.75rem; color: var(--success);">Optimized Size</div>
            <div id="compress-result-size" style="font-size: 1.15rem; font-weight: 700; color: var(--success);"></div>
          </div>
        </div>
        <div id="compress-stats-summary" style="font-size: 0.8125rem; color: var(--text-muted); border-top: 1px dashed var(--border-subtle); padding-top: 0.5rem; display: flex; justify-content: space-between;">
          <span>Target DPI: <strong id="compress-dpi-label" style="color: var(--text-secondary);">150 DPI</strong></span>
          <span id="compress-est-label">Estimated savings: ~40% - 75%</span>
        </div>
      </div>
    `;

    const footerHtml = `
      <button class="btn btn-secondary" id="modal-cancel-btn">Cancel</button>
      <button class="btn btn-primary" id="modal-start-compress-btn">
        <i data-lucide="minimize-2" style="width: 16px; height: 16px;"></i>
        <span>Compress Now</span>
      </button>
    `;

    this.open(title, bodyHtml, footerHtml);

    // Preset selector interactions
    const presetCards = this.bodyContent.querySelectorAll<HTMLElement>('.preset-card');
    const qualitySlider = this.bodyContent.querySelector<HTMLInputElement>('#compress-quality-slider')!;
    const qualityValueEl = this.bodyContent.querySelector<HTMLElement>('#compress-quality-value')!;
    const dpiLabelEl = this.bodyContent.querySelector<HTMLElement>('#compress-dpi-label')!;

    presetCards.forEach((card) => {
      card.addEventListener('click', () => {
        presetCards.forEach((c) => c.classList.remove('active'));
        card.classList.add('active');
        selectedPreset = card.getAttribute('data-preset') as CompressionPreset;
        const presetDpi = card.getAttribute('data-dpi') ?? '150';
        const presetQ = parseFloat(card.getAttribute('data-quality') ?? '0.78');

        currentQuality = presetQ;
        qualitySlider.value = String(Math.round(presetQ * 100));
        qualityValueEl.textContent = `${Math.round(presetQ * 100)}%`;
        if (dpiLabelEl) dpiLabelEl.textContent = `${presetDpi} DPI`;
      });
    });

    qualitySlider.addEventListener('input', () => {
      const qVal = parseInt(qualitySlider.value, 10);
      currentQuality = qVal / 100;
      qualityValueEl.textContent = `${qVal}%`;
    });

    this.footerActions.querySelector('#modal-cancel-btn')?.addEventListener('click', () => this.close());

    const startBtn = this.footerActions.querySelector<HTMLButtonElement>('#modal-start-compress-btn')!;
    startBtn.addEventListener('click', async () => {
      try {
        startBtn.disabled = true;
        progressOverlay.show('Compressing PDF...');

        const presetConfig = COMPRESSION_PRESETS[selectedPreset] ?? COMPRESSION_PRESETS['ebook']!;
        const options = {
          ...presetConfig,
          quality: currentQuality,
        };

        const result = await compressPdf(documentBytes, options, (info) => {
          progressOverlay.update(info);
        });

        progressOverlay.hide();

        const resultBox = this.bodyContent.querySelector<HTMLElement>('#compress-result-box');
        const resultSize = this.bodyContent.querySelector<HTMLElement>('#compress-result-size');
        const estLabel = this.bodyContent.querySelector<HTMLElement>('#compress-est-label');

        if (resultBox && resultSize) {
          resultBox.style.display = 'block';
          const savedBytes = result.originalSize - result.compressedSize;
          const savedPercent = Math.round((1 - result.ratio) * 100);

          if (savedPercent > 0 && !result.ineffective) {
            resultSize.textContent = `${formatBytes(result.compressedSize)} (-${savedPercent}%)`;
            if (estLabel) {
              estLabel.innerHTML = `Saved <strong style="color: var(--success);">${formatBytes(savedBytes)}</strong> (${savedPercent}% smaller)`;
            }
          } else {
            resultSize.textContent = `${formatBytes(result.compressedSize)} (Optimal)`;
            if (estLabel) {
              estLabel.innerHTML = `<span style="color: var(--warning, #eab308);">File is already well-optimized (no further reduction possible)</span>`;
            }
          }
        }

        // Change button to download
        startBtn.disabled = false;
        startBtn.innerHTML = `
          <i data-lucide="download" style="width: 16px; height: 16px;"></i>
          <span>Download Compressed</span>
        `;
        this.refreshIcons();

        startBtn.onclick = () => {
          const outName = filename.replace(/\.pdf$/i, '') + '_compressed.pdf';
          downloadBytes(result.pdfBytes, outName);
          toast.show('Compressed PDF downloaded!', 'success');
          this.close();
        };

        toast.show(`Compression complete! Size: ${formatBytes(result.compressedSize)}`, 'success');
      } catch (err: unknown) {
        progressOverlay.hide();
        startBtn.disabled = false;
        const msg = err instanceof Error ? err.message : String(err);
        toast.show(`Compression failed: ${msg}`, 'error');
      }
    });
  }

  // ==========================================
  // SPLIT MODAL
  // ==========================================
  showSplitModal(
    pages: PDFPageItem[],
    documentMap: Map<string, DocumentMetadata>,
    baseFilename = 'split'
  ): void {
    const totalPages = pages.length;
    const selectedCount = pages.filter((p) => p.selected).length;

    const title = `<i data-lucide="scissors" style="width: 18px; height: 18px; color: var(--primary);"></i> Split Document`;
    const bodyHtml = `
      <div class="form-group">
        <label class="form-label">Split Mode</label>
        <select class="form-select" id="split-mode-select">
          <option value="each">Extract every page into a separate PDF</option>
          <option value="ranges">Split by custom page ranges</option>
          ${selectedCount > 0 ? `<option value="selected" selected>Export selected pages only (${selectedCount} pages)</option>` : ''}
        </select>
      </div>

      <div class="form-group" id="split-range-group" style="display: none;">
        <label class="form-label">Page Ranges</label>
        <input type="text" class="form-input" id="split-range-input" placeholder="e.g. 1-2, 3-5, 6" value="${getDefaultSplitRange(totalPages)}" />
        <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.25rem;">
          Specify page ranges separated by commas (Total pages: ${totalPages}).
        </div>
      </div>
    `;

    const footerHtml = `
      <button class="btn btn-secondary" id="modal-cancel-btn">Cancel</button>
      <button class="btn btn-primary" id="modal-execute-split-btn">
        <i data-lucide="scissors" style="width: 16px; height: 16px;"></i>
        <span>Split & Download</span>
      </button>
    `;

    this.open(title, bodyHtml, footerHtml);

    const modeSelect = this.bodyContent.querySelector<HTMLSelectElement>('#split-mode-select')!;
    const rangeGroup = this.bodyContent.querySelector<HTMLElement>('#split-range-group')!;
    const rangeInput = this.bodyContent.querySelector<HTMLInputElement>('#split-range-input')!;

    const updateVisibility = () => {
      rangeGroup.style.display = modeSelect.value === 'ranges' ? 'flex' : 'none';
    };
    modeSelect.addEventListener('change', updateVisibility);
    updateVisibility();

    this.footerActions.querySelector('#modal-cancel-btn')?.addEventListener('click', () => this.close());

    this.footerActions.querySelector('#modal-execute-split-btn')?.addEventListener('click', async () => {
      try {
        progressOverlay.show('Splitting pages...');
        const mode = modeSelect.value;

        if (mode === 'selected') {
          const selectedPages = pages.filter((p) => p.selected);
          const bytes = await mergePages(selectedPages, documentMap, (info) => progressOverlay.update(info));
          progressOverlay.hide();
          downloadBytes(bytes, `${baseFilename}_selected.pdf`);
          toast.show(`Exported ${selectedPages.length} selected pages!`, 'success');
          this.close();
        } else if (mode === 'each') {
          const results = await splitPagesByRanges(pages, documentMap, '', baseFilename, (info) => {
            progressOverlay.update(info);
          });
          progressOverlay.hide();

          if (results.length === 1 && results[0]) {
            downloadBytes(results[0].bytes, results[0].filename);
          } else {
            // Bundle into ZIP
            const zip = new JSZip();
            results.forEach((r) => zip.file(r.filename, r.bytes));
            const zipBlob = await zip.generateAsync({ type: 'blob' });
            downloadBlob(zipBlob, `${baseFilename}_split_pages.zip`);
          }
          toast.show(`Split into ${results.length} files successfully!`, 'success');
          this.close();
        } else {
          const rangeStr = rangeInput.value.trim();
          const results = await splitPagesByRanges(pages, documentMap, rangeStr, baseFilename, (info) => {
            progressOverlay.update(info);
          });
          progressOverlay.hide();

          if (results.length === 1 && results[0]) {
            downloadBytes(results[0].bytes, results[0].filename);
          } else {
            const zip = new JSZip();
            results.forEach((r) => zip.file(r.filename, r.bytes));
            const zipBlob = await zip.generateAsync({ type: 'blob' });
            downloadBlob(zipBlob, `${baseFilename}_ranges.zip`);
          }
          toast.show(`Created ${results.length} split documents!`, 'success');
          this.close();
        }
      } catch (err: unknown) {
        progressOverlay.hide();
        const msg = err instanceof Error ? err.message : String(err);
        toast.show(`Split failed: ${msg}`, 'error');
      }
    });
  }

  // ==========================================
  // EXTRACT TEXT MODAL
  // ==========================================
  async showExtractTextModal(fileBytes: Uint8Array, filename = 'document.pdf'): Promise<void> {
    try {
      progressOverlay.show('Extracting text from PDF...');
      const text = await extractText(fileBytes, (info) => progressOverlay.update(info));
      progressOverlay.hide();

      const title = `<i data-lucide="file-text" style="width: 18px; height: 18px; color: var(--primary);"></i> Extracted Plain Text`;
      const bodyHtml = `
        <div style="font-size: 0.8125rem; color: var(--text-muted);">
          Extracted ${text.length.toLocaleString()} characters from ${escapeHtml(filename)}.
        </div>
        <textarea class="text-preview-box" id="extracted-text-area" readonly>${escapeHtml(text)}</textarea>
      `;

      const footerHtml = `
        <button class="btn btn-secondary" id="modal-copy-text-btn">
          <i data-lucide="copy" style="width: 16px; height: 16px;"></i>
          <span>Copy Text</span>
        </button>
        <button class="btn btn-primary" id="modal-download-text-btn">
          <i data-lucide="download" style="width: 16px; height: 16px;"></i>
          <span>Download .txt</span>
        </button>
      `;

      this.open(title, bodyHtml, footerHtml);

      const textArea = this.bodyContent.querySelector<HTMLTextAreaElement>('#extracted-text-area')!;
      const copyBtn = this.footerActions.querySelector<HTMLButtonElement>('#modal-copy-text-btn')!;
      const dlBtn = this.footerActions.querySelector<HTMLButtonElement>('#modal-download-text-btn')!;

      copyBtn.addEventListener('click', async () => {
        await navigator.clipboard.writeText(textArea.value);
        copyBtn.innerHTML = `<i data-lucide="check" style="width: 16px; height: 16px; color: var(--success);"></i><span>Copied!</span>`;
        this.refreshIcons();
        toast.show('Text copied to clipboard!', 'success');
        setTimeout(() => {
          copyBtn.innerHTML = `<i data-lucide="copy" style="width: 16px; height: 16px;"></i><span>Copy Text</span>`;
          this.refreshIcons();
        }, 2000);
      });

      dlBtn.addEventListener('click', () => {
        const blob = new Blob([textArea.value], { type: 'text/plain;charset=utf-8' });
        const txtName = filename.replace(/\.pdf$/i, '') + '_extracted.txt';
        downloadBlob(blob, txtName);
        toast.show('Text file downloaded!', 'success');
      });
    } catch (err: unknown) {
      progressOverlay.hide();
      const msg = err instanceof Error ? err.message : String(err);
      toast.show(`Text extraction failed: ${msg}`, 'error');
    }
  }

  // ==========================================
  // IMAGES TO PDF MODAL
  // ==========================================
  showImagesToPdfModal(
    onAddToStudio?: (files: File[], pageSize: 'A4' | 'fit') => Promise<void>
  ): void {
    const title = `<i data-lucide="image" style="width: 18px; height: 18px; color: var(--primary);"></i> Convert Images to PDF`;
    const bodyHtml = `
      <div class="form-group">
        <label class="form-label">Select Image Files (PNG, JPG, WebP, etc.)</label>
        <input type="file" id="img2pdf-file-input" class="form-input" multiple accept="image/*" />
      </div>

      <div class="form-group">
        <label class="form-label">Page Sizing</label>
        <select class="form-select" id="img2pdf-pagesize-select">
          <option value="A4" selected>Standard A4 Page (Centered with margin)</option>
          <option value="fit">Fit Page to Exact Image Size</option>
        </select>
      </div>

      <div id="img2pdf-file-list" style="max-height: 140px; overflow-y: auto; font-size: 0.8125rem; color: var(--text-secondary);"></div>
    `;

    const footerHtml = `
      <button class="btn btn-secondary" id="modal-cancel-btn">Cancel</button>
      <button class="btn btn-secondary" id="modal-add-to-studio-btn" disabled>
        <i data-lucide="layers" style="width: 16px; height: 16px;"></i>
        <span>Add to Visual Studio</span>
      </button>
      <button class="btn btn-primary" id="modal-convert-img2pdf-btn" disabled>
        <i data-lucide="download" style="width: 16px; height: 16px;"></i>
        <span>Create PDF</span>
      </button>
    `;

    this.open(title, bodyHtml, footerHtml);

    const fileInput = this.bodyContent.querySelector<HTMLInputElement>('#img2pdf-file-input')!;
    const sizeSelect = this.bodyContent.querySelector<HTMLSelectElement>('#img2pdf-pagesize-select')!;
    const fileListEl = this.bodyContent.querySelector<HTMLElement>('#img2pdf-file-list')!;
    const convertBtn = this.footerActions.querySelector<HTMLButtonElement>('#modal-convert-img2pdf-btn')!;
    const addToStudioBtn = this.footerActions.querySelector<HTMLButtonElement>('#modal-add-to-studio-btn')!;

    let selectedFiles: File[] = [];

    fileInput.addEventListener('change', () => {
      if (fileInput.files && fileInput.files.length > 0) {
        selectedFiles = Array.from(fileInput.files);
        fileListEl.innerHTML = selectedFiles
          .map((f, i) => `<div>${i + 1}. ${escapeHtml(f.name)} (${formatBytes(f.size)})</div>`)
          .join('');
        convertBtn.disabled = false;
        addToStudioBtn.disabled = false;
      } else {
        selectedFiles = [];
        fileListEl.innerHTML = '';
        convertBtn.disabled = true;
        addToStudioBtn.disabled = true;
      }
    });

    this.footerActions.querySelector('#modal-cancel-btn')?.addEventListener('click', () => this.close());

    addToStudioBtn.addEventListener('click', async () => {
      if (selectedFiles.length === 0) return;
      try {
        addToStudioBtn.disabled = true;
        convertBtn.disabled = true;
        const pageSize = sizeSelect.value as 'A4' | 'fit';
        if (onAddToStudio) {
          await onAddToStudio(selectedFiles, pageSize);
        }
        this.close();
      } catch (err: unknown) {
        addToStudioBtn.disabled = false;
        convertBtn.disabled = false;
        const msg = err instanceof Error ? err.message : String(err);
        toast.show(`Failed to add images: ${msg}`, 'error');
      }
    });

    convertBtn.addEventListener('click', async () => {
      if (selectedFiles.length === 0) return;
      try {
        progressOverlay.show('Converting images to PDF...');
        const pageSize = sizeSelect.value as 'A4' | 'fit';
        const bytes = await imagesToPdf(selectedFiles, { pageSize }, (info) => {
          progressOverlay.update(info);
        });
        progressOverlay.hide();

        downloadBytes(bytes, 'images_converted.pdf');
        toast.show(`Created PDF with ${selectedFiles.length} images!`, 'success');
        this.close();
      } catch (err: unknown) {
        progressOverlay.hide();
        const msg = err instanceof Error ? err.message : String(err);
        toast.show(`Image conversion failed: ${msg}`, 'error');
      }
    });
  }

  // ==========================================
  // CONFIRMATION MODAL
  // ==========================================
  showConfirmModal(
    title: string,
    message: string,
    onConfirm: () => void,
    confirmText = 'Confirm',
    isDanger = false
  ): void {
    const modalTitle = `<i data-lucide="alert-triangle" style="width: 18px; height: 18px; color: ${isDanger ? 'var(--danger)' : 'var(--primary)'};"></i> ${escapeHtml(title)}`;
    const bodyHtml = `
      <div style="font-size: 0.9375rem; color: var(--text-primary); line-height: 1.6;">
        ${escapeHtml(message)}
      </div>
    `;
    const footerHtml = `
      <button class="btn btn-secondary" id="confirm-modal-cancel-btn">Cancel</button>
      <button class="btn ${isDanger ? 'btn-danger' : 'btn-primary'}" id="confirm-modal-ok-btn">
        <span>${escapeHtml(confirmText)}</span>
      </button>
    `;

    this.open(modalTitle, bodyHtml, footerHtml);

    this.footerActions.querySelector('#confirm-modal-cancel-btn')?.addEventListener('click', () => this.close());
    this.footerActions.querySelector('#confirm-modal-ok-btn')?.addEventListener('click', () => {
      this.close();
      onConfirm();
    });
  }

  // ==========================================
  // PASSWORD PROMPT MODAL
  // ==========================================
  showPasswordPromptModal(
    filename: string,
    onSubmit: (password: string) => void,
    onCancel?: () => void
  ): void {
    const title = `<i data-lucide="lock" style="width: 18px; height: 18px; color: var(--primary);"></i> Password Required`;
    const bodyHtml = `
      <div style="font-size: 0.875rem; color: var(--text-secondary); line-height: 1.5;">
        <strong>${escapeHtml(filename)}</strong> is password protected. Enter the password to unlock it.
      </div>
      <div class="form-group" style="margin-top: 0.75rem;">
        <label class="form-label" for="pdf-password-input">Password</label>
        <input type="password" class="form-input" id="pdf-password-input" placeholder="Enter password" autofocus />
        <div id="pdf-password-error" style="color: var(--danger); font-size: 0.75rem; display: none; margin-top: 0.25rem;"></div>
      </div>
    `;
    const footerHtml = `
      <button class="btn btn-secondary" id="modal-password-cancel-btn">Cancel</button>
      <button class="btn btn-primary" id="modal-password-submit-btn">
        <i data-lucide="unlock" style="width: 16px; height: 16px;"></i>
        <span>Unlock Document</span>
      </button>
    `;

    this.open(title, bodyHtml, footerHtml);

    const pwdInput = this.bodyContent.querySelector<HTMLInputElement>('#pdf-password-input')!;
    pwdInput.focus();

    const handleCancel = () => {
      this.close();
      onCancel?.();
    };

    const handleSubmit = () => {
      const val = pwdInput.value;
      if (!val) {
        const errEl = this.bodyContent.querySelector<HTMLElement>('#pdf-password-error');
        if (errEl) {
          errEl.textContent = 'Please enter a password';
          errEl.style.display = 'block';
        }
        return;
      }
      this.close();
      onSubmit(val);
    };

    this.footerActions.querySelector('#modal-password-cancel-btn')?.addEventListener('click', handleCancel);
    this.footerActions.querySelector('#modal-password-submit-btn')?.addEventListener('click', handleSubmit);
    pwdInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        handleSubmit();
      }
    });
  }

  // ==========================================
  // PDF TO IMAGES MODAL
  // ==========================================
  showPdfToImagesModal(documentBytes: Uint8Array, filename = 'document.pdf'): void {
    const title = `<i data-lucide="image" style="width: 18px; height: 18px; color: var(--primary);"></i> Export PDF to Images`;
    const bodyHtml = `
      <div class="form-group">
        <label class="form-label">Image Resolution (DPI)</label>
        <select class="form-select" id="pdf2img-dpi-select">
          <option value="96">Screen (96 DPI • Fast & Light)</option>
          <option value="150" selected>Balanced (150 DPI • Crisp)</option>
          <option value="300">Ultra High-Res (300 DPI • Print Quality)</option>
        </select>
      </div>

      <div class="form-group">
        <label class="form-label">Output Image Format</label>
        <select class="form-select" id="pdf2img-format-select">
          <option value="png" selected>PNG (Lossless, sharpest text)</option>
          <option value="jpeg">JPEG (Smaller file size)</option>
        </select>
      </div>
    `;

    const footerHtml = `
      <button class="btn btn-secondary" id="modal-cancel-btn">Cancel</button>
      <button class="btn btn-primary" id="modal-export-images-btn">
        <i data-lucide="download" style="width: 16px; height: 16px;"></i>
        <span>Export as ZIP</span>
      </button>
    `;

    this.open(title, bodyHtml, footerHtml);

    this.footerActions.querySelector('#modal-cancel-btn')?.addEventListener('click', () => this.close());

    const exportBtn = this.footerActions.querySelector<HTMLButtonElement>('#modal-export-images-btn')!;
    exportBtn.addEventListener('click', async () => {
      try {
        const dpiSelect = this.bodyContent.querySelector<HTMLSelectElement>('#pdf2img-dpi-select')!;
        const formatSelect = this.bodyContent.querySelector<HTMLSelectElement>('#pdf2img-format-select')!;

        const dpi = parseInt(dpiSelect.value, 10);
        const format = formatSelect.value as 'png' | 'jpeg';

        progressOverlay.show('Rendering pages to images...');
        const images = await pdfToImages(documentBytes, dpi, format, (info) => {
          progressOverlay.update(info);
        });

        progressOverlay.show('Packaging ZIP file...');
        const zipBlob = await createImagesZip(images, (info) => {
          progressOverlay.update(info);
        });
        progressOverlay.hide();

        const zipName = filename.replace(/\.pdf$/i, '') + '_images.zip';
        downloadBlob(zipBlob, zipName);
        toast.show(`Exported ${images.length} images to ${zipName}!`, 'success');
        this.close();
      } catch (err: unknown) {
        progressOverlay.hide();
        const msg = err instanceof Error ? err.message : String(err);
        toast.show(`Export failed: ${msg}`, 'error');
      }
    });
  }
}

export const modal = new ModalManager();
