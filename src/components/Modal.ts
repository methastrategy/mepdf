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
  Eye,
  EyeOff,
  ShieldCheck,
  Stamp,
  Hash,
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
  protectPdf,
  addWatermarkToPdf,
  addPageNumbersToPdf,
} from '../core/pdf-operations';
import { toast } from './Toast';
import { progressOverlay } from './ProgressOverlay';
import type {
  PDFPageItem,
  DocumentMetadata,
  CompressionPreset,
  WatermarkOptions,
  WatermarkPosition,
  PageNumberOptions,
  PageNumberPosition,
  PageNumberFormat,
} from '../core/types';
import { t } from '../core/i18n';

/**
 * Returns an intuitive default split range expression based on page count
 */
export function getDefaultSplitRange(totalPages: number): string {
  if (!totalPages || totalPages <= 1 || isNaN(totalPages)) return '1';
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
  private previousActiveElement: HTMLElement | null = null;

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
          <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="modal-header-title">
            <div class="modal-header">
              <h3 class="modal-title" id="modal-header-title">Modal</h3>
              <button class="btn btn-ghost btn-icon-only" id="modal-close-btn" title="Close" aria-label="Close modal">
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
        if (!this.overlay?.classList.contains('active')) return;

        if (e.key === 'Escape') {
          this.close();
          return;
        }

        if (e.key === 'Tab') {
          const focusable = Array.from(
            this.overlay.querySelectorAll<HTMLElement>(
              'button:not([disabled]), [href], input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
            )
          ).filter((node) => {
            if (typeof (node as any).checkVisibility === 'function') {
              return (node as any).checkVisibility();
            }
            if (typeof window !== 'undefined' && 'getComputedStyle' in window) {
              const style = window.getComputedStyle(node);
              if (style.display === 'none' || style.visibility === 'hidden') return false;
              if (node.offsetParent === null && style.position !== 'fixed') return false;
            }
            return true;
          });

          if (focusable.length === 0) {
            e.preventDefault();
            return;
          }

          const firstEl = focusable[0]!;
          const lastEl = focusable[focusable.length - 1]!;

          if (e.shiftKey) {
            if (document.activeElement === firstEl || !this.overlay.contains(document.activeElement)) {
              e.preventDefault();
              lastEl.focus();
            }
          } else {
            if (document.activeElement === lastEl || !this.overlay.contains(document.activeElement)) {
              e.preventDefault();
              firstEl.focus();
            }
          }
        }
      });

      this.refreshIcons();
    }
    return true;
  }

  isOpen(): boolean {
    return Boolean(this.overlay && this.overlay.classList.contains('active'));
  }

  setOnClose(cb: (() => void) | null): void {
    this.onCloseCallback = cb;
  }

  open(title: string, bodyHtml: string, footerHtml: string): void {
    if (!this.ensureElements()) return;
    this.previousActiveElement = (typeof document !== 'undefined' ? document.activeElement : null) as HTMLElement | null;
    this.headerTitle.innerHTML = title;
    this.bodyContent.innerHTML = bodyHtml;
    this.footerActions.innerHTML = footerHtml;
    this.overlay.classList.add('active');
    this.refreshIcons();

    if (typeof requestAnimationFrame !== 'undefined') {
      requestAnimationFrame(() => {
        const interactive = Array.from(
          this.bodyContent.querySelectorAll<HTMLElement>('input:not([type="hidden"]), select, textarea')
        ).find((el) => {
          if (typeof (el as any).checkVisibility === 'function') return (el as any).checkVisibility();
          return el.offsetParent !== null || el.style.display !== 'none';
        });
        if (interactive) {
          interactive.focus();
        } else {
          const firstBtn = this.footerActions.querySelector<HTMLElement>('button:not([disabled])');
          firstBtn?.focus();
        }
      });
    }
  }

  close(): void {
    if (this.overlay) {
      this.overlay.classList.remove('active');
    }
    if (this.previousActiveElement && typeof this.previousActiveElement.focus === 'function') {
      try {
        this.previousActiveElement.focus();
      } catch {
        // Safe fallback
      }
      this.previousActiveElement = null;
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
        Eye,
        EyeOff,
        ShieldCheck,
        Stamp,
        Hash,
      },
      nameAttr: 'data-lucide',
    });
  }

  // ==========================================
  // COMPRESS MODAL
  // ==========================================
  showCompressModal(documentBytes: Uint8Array, filename = 'document.pdf', password?: string): void {
    let selectedPreset: CompressionPreset = 'ebook';
    let currentQuality = 0.78;
    const originalSize = documentBytes.byteLength;

    const title = `<i data-lucide="minimize-2" style="width: 18px; height: 18px; color: var(--primary);"></i> ${t('compressModalTitle')}`;
    const bodyHtml = `
      <div style="font-size: 0.875rem; color: var(--text-secondary); line-height: 1.5;">
        ${t('compressModalDesc')}
      </div>

      <div class="form-group">
        <label class="form-label">${t('compressPresetLabel')}</label>
        <div class="preset-selector">
          <div class="preset-card" data-preset="screen" data-dpi="96" data-quality="0.65">
            <div class="preset-title">${t('compressPresetScreen')}</div>
            <div class="preset-desc">${t('compressPresetScreenDesc')}</div>
          </div>
          <div class="preset-card active" data-preset="ebook" data-dpi="150" data-quality="0.78">
            <div class="preset-title">${t('compressPresetEbook')}</div>
            <div class="preset-desc">${t('compressPresetEbookDesc')}</div>
          </div>
          <div class="preset-card" data-preset="printer" data-dpi="300" data-quality="0.90">
            <div class="preset-title">${t('compressPresetPrint')}</div>
            <div class="preset-desc">${t('compressPresetPrintDesc')}</div>
          </div>
        </div>
      </div>

      <div class="form-group">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <label class="form-label" for="compress-quality-slider">${t('compressQualitySlider')}</label>
          <span id="compress-quality-value" style="font-size: 0.8125rem; font-weight: 700; color: var(--primary);">78%</span>
        </div>
        <input type="range" class="form-range" id="compress-quality-slider" min="10" max="95" value="78" step="1" />
        <div style="display: flex; justify-content: space-between; font-size: 0.6875rem; color: var(--text-muted); margin-top: 0.2rem;">
          <span>${t('compressMaxSavings')}</span>
          <span>${t('compressBalanced')}</span>
          <span>${t('compressMaxQuality')}</span>
        </div>
      </div>

      <div class="size-comparison-card" style="background: var(--surface-raised); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); padding: 1.1rem;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
          <div>
            <div style="font-size: 0.75rem; color: var(--text-muted);">${t('compressCurrentSize')}</div>
            <div style="font-size: 1.15rem; font-weight: 700; color: var(--text-primary);">${formatBytes(originalSize)}</div>
          </div>
          <div id="compress-result-box" style="text-align: right; display: none;">
            <div style="font-size: 0.75rem; color: var(--success);">${t('compressOptimizedSize')}</div>
            <div id="compress-result-size" style="font-size: 1.15rem; font-weight: 700; color: var(--success);"></div>
          </div>
        </div>
        <div id="compress-stats-summary" style="font-size: 0.8125rem; color: var(--text-muted); border-top: 1px dashed var(--border-subtle); padding-top: 0.5rem; display: flex; justify-content: space-between;">
          <span>${t('compressTargetDpi', { dpi: '<strong id="compress-dpi-label" style="color: var(--text-secondary);">150</strong>' })}</span>
          <span id="compress-est-label">${t('compressEstSavings')}</span>
        </div>
      </div>
    `;

    const footerHtml = `
      <button class="btn btn-secondary" id="modal-cancel-btn">${t('clearModalCancel')}</button>
      <button class="btn btn-primary" id="modal-start-compress-btn">
        <i data-lucide="minimize-2" style="width: 16px; height: 16px;"></i>
        <span>${t('compressStartBtn')}</span>
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
        if (dpiLabelEl) dpiLabelEl.textContent = presetDpi;
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
        }, password);

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
              estLabel.innerHTML = t('compressSavedInfo', {
                saved: `<strong style="color: var(--success);">${formatBytes(savedBytes)}</strong>`,
                percent: savedPercent,
              });
            }
          } else {
            resultSize.textContent = `${formatBytes(result.compressedSize)} (Optimal)`;
            if (estLabel) {
              estLabel.innerHTML = `<span style="color: var(--warning, #eab308);">${t('compressAlreadyOptimal')}</span>`;
            }
          }
        }

        // Change button to download
        startBtn.disabled = false;
        startBtn.innerHTML = `
          <i data-lucide="download" style="width: 16px; height: 16px;"></i>
          <span>${t('compressDownloadBtn')}</span>
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
  // PROTECT / ENCRYPT MODAL
  // ==========================================
  showProtectModal(
    documentBytes: Uint8Array,
    filename = 'document.pdf',
    onSuccess?: () => void
  ): void {
    const title = `<i data-lucide="lock" style="width: 18px; height: 18px; color: var(--primary);"></i> ${t('protectModalTitle')}`;
    const baseName = filename.replace(/\.pdf$/i, '');

    const bodyHtml = `
      <div style="font-size: 0.875rem; color: var(--text-secondary); line-height: 1.5; margin-bottom: 1rem;">
        ${t('protectModalDesc')}
      </div>

      <div class="form-group" style="margin-bottom: 1rem;">
        <label class="form-label" for="protect-password-input">${t('protectPasswordLabel')}</label>
        <div style="position: relative; display: flex; align-items: center;">
          <input 
            type="password" 
            class="form-input" 
            id="protect-password-input" 
            placeholder="${t('protectPasswordPlaceholder')}" 
            style="padding-right: 2.75rem;" 
            autocomplete="new-password"
            autofocus 
          />
          <button 
            type="button" 
            class="btn btn-ghost btn-icon-only" 
            id="protect-toggle-pwd-btn" 
            title="${t('protectShowPassword')}" 
            style="position: absolute; right: 0.25rem; width: 34px; height: 34px;">
            <i data-lucide="eye" style="width: 16px; height: 16px;"></i>
          </button>
        </div>
      </div>

      <div class="form-group" style="margin-bottom: 1rem;">
        <label class="form-label" for="protect-password-confirm-input">${t('protectPasswordConfirmLabel')}</label>
        <input 
          type="password" 
          class="form-input" 
          id="protect-password-confirm-input" 
          placeholder="${t('protectPasswordConfirmPlaceholder')}" 
          autocomplete="new-password"
        />
        <div id="protect-password-error" style="color: var(--danger); font-size: 0.75rem; display: none; margin-top: 0.35rem;"></div>
      </div>

      <div style="display: flex; align-items: center; gap: 0.5rem; padding: 0.65rem 0.85rem; background: var(--surface-raised); border: 1px solid var(--border-subtle); border-radius: var(--radius-sm); font-size: 0.75rem; color: var(--text-muted);">
        <i data-lucide="shield-check" style="width: 16px; height: 16px; color: var(--success); flex-shrink: 0;"></i>
        <span>${t('dropzoneZeroUpload')}</span>
      </div>
    `;

    const footerHtml = `
      <button class="btn btn-secondary" id="modal-protect-cancel-btn">${t('clearModalCancel')}</button>
      <button class="btn btn-primary" id="modal-protect-submit-btn">
        <i data-lucide="lock" style="width: 15px; height: 15px;"></i>
        <span>${t('protectBtn')}</span>
      </button>
    `;

    this.open(title, bodyHtml, footerHtml);

    const pwdInput = this.bodyContent.querySelector<HTMLInputElement>('#protect-password-input')!;
    const confirmInput = this.bodyContent.querySelector<HTMLInputElement>('#protect-password-confirm-input')!;
    const toggleBtn = this.bodyContent.querySelector<HTMLButtonElement>('#protect-toggle-pwd-btn')!;
    const errorEl = this.bodyContent.querySelector<HTMLElement>('#protect-password-error')!;
    const cancelBtn = this.footerActions.querySelector<HTMLButtonElement>('#modal-protect-cancel-btn')!;
    const submitBtn = this.footerActions.querySelector<HTMLButtonElement>('#modal-protect-submit-btn')!;

    let isPasswordVisible = false;
    toggleBtn?.addEventListener('click', (e) => {
      e.preventDefault();
      isPasswordVisible = !isPasswordVisible;
      pwdInput.type = isPasswordVisible ? 'text' : 'password';
      confirmInput.type = isPasswordVisible ? 'text' : 'password';
      toggleBtn.innerHTML = isPasswordVisible 
        ? `<i data-lucide="eye-off" style="width: 16px; height: 16px;"></i>` 
        : `<i data-lucide="eye" style="width: 16px; height: 16px;"></i>`;
      this.refreshIcons();
    });

    cancelBtn?.addEventListener('click', () => this.close());

    const handleProtect = async () => {
      const pwd = pwdInput.value.trim();
      const confirmPwd = confirmInput.value.trim();

      if (pwd.length < 3) {
        errorEl.textContent = t('toastPasswordMinLength');
        errorEl.style.display = 'block';
        pwdInput.focus();
        return;
      }

      if (pwd !== confirmPwd) {
        errorEl.textContent = t('toastPasswordMismatch');
        errorEl.style.display = 'block';
        confirmInput.focus();
        return;
      }

      errorEl.style.display = 'none';
      submitBtn.disabled = true;

      try {
        progressOverlay.show('Encrypting and protecting PDF...');
        const protectedBytes = await protectPdf(documentBytes, pwd);
        progressOverlay.hide();
        this.close();

        downloadBytes(protectedBytes, `${baseName}_protected.pdf`);
        toast.show(t('toastProtectSuccess'), 'success');
        onSuccess?.();
      } catch (err: unknown) {
        progressOverlay.hide();
        submitBtn.disabled = false;
        const msg = err instanceof Error ? err.message : String(err);
        toast.show(`Encryption failed: ${msg}`, 'error');
      }
    };

    submitBtn?.addEventListener('click', handleProtect);

    const keyListener = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleProtect();
      }
    };
    pwdInput.addEventListener('keydown', keyListener);
    confirmInput.addEventListener('keydown', keyListener);
  }

  // ==========================================
  // WATERMARK MODAL
  // ==========================================
  showWatermarkModal(
    documentBytes: Uint8Array,
    filename = 'document.pdf',
    onSuccess?: () => void
  ): void {
    const title = `<i data-lucide="stamp" style="width: 18px; height: 18px; color: var(--primary);"></i> ${t('watermarkModalTitle')}`;
    const baseName = filename.replace(/\.pdf$/i, '');

    let watermarkType: 'text' | 'image' = 'text';
    let uploadedImageBytes: Uint8Array | null = null;
    let uploadedImageType: 'png' | 'jpeg' = 'png';
    let selectedColor = { r: 0.5, g: 0.5, b: 0.5 };
    let selectedFontSize = 48;
    let selectedRotation = 45;
    let selectedPosition: WatermarkPosition = 'center';
    let selectedOpacity = 0.3;

    const bodyHtml = `
      <div style="font-size: 0.875rem; color: var(--text-secondary); line-height: 1.5; margin-bottom: 1rem;">
        ${t('watermarkModalDesc')}
      </div>

      <!-- Watermark Type Selector Tabs -->
      <div style="display: flex; gap: 0.5rem; margin-bottom: 1rem;">
        <button type="button" class="btn btn-secondary active" id="wm-type-text-btn" style="flex: 1;">
          <i data-lucide="file-text" style="width: 15px; height: 15px;"></i>
          <span>${t('watermarkTypeText')}</span>
        </button>
        <button type="button" class="btn btn-secondary" id="wm-type-image-btn" style="flex: 1;">
          <i data-lucide="image" style="width: 15px; height: 15px;"></i>
          <span>${t('watermarkTypeImage')}</span>
        </button>
      </div>

      <!-- Text Watermark Section -->
      <div id="wm-text-section">
        <div class="form-group" style="margin-bottom: 0.85rem;">
          <label class="form-label" for="wm-text-input">${t('watermarkTextLabel')}</label>
          <input 
            type="text" 
            class="form-input" 
            id="wm-text-input" 
            value="CONFIDENTIAL" 
            placeholder="${t('watermarkTextPlaceholder')}" 
          />
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; margin-bottom: 0.85rem;">
          <div class="form-group">
            <label class="form-label" for="wm-size-select">${t('watermarkSizeLabel')}</label>
            <select class="form-input" id="wm-size-select">
              <option value="28">${t('watermarkSizeSmall')}</option>
              <option value="48" selected>${t('watermarkSizeMedium')}</option>
              <option value="72">${t('watermarkSizeLarge')}</option>
            </select>
          </div>

          <div class="form-group">
            <label class="form-label" for="wm-color-select">${t('watermarkColorLabel')}</label>
            <select class="form-input" id="wm-color-select">
              <option value="gray" selected>${t('watermarkColorGray')}</option>
              <option value="red">${t('watermarkColorRed')}</option>
              <option value="blue">${t('watermarkColorBlue')}</option>
              <option value="black">${t('watermarkColorBlack')}</option>
            </select>
          </div>
        </div>
      </div>

      <!-- Image Watermark Section (Hidden by default) -->
      <div id="wm-image-section" style="display: none; margin-bottom: 0.85rem;">
        <label class="form-label">${t('watermarkImageLabel')}</label>
        <input type="file" id="wm-image-file-input" accept="image/png,image/jpeg,image/webp" style="display: none;" />
        <button type="button" class="btn btn-secondary" id="wm-browse-image-btn" style="width: 100%; justify-content: center; padding: 0.75rem;">
          <i data-lucide="image" style="width: 16px; height: 16px;"></i>
          <span id="wm-image-filename-label">${t('watermarkImageHint')}</span>
        </button>
      </div>

      <!-- Common Controls: Opacity, Rotation, Position -->
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; margin-bottom: 0.85rem;">
        <div class="form-group">
          <label class="form-label" for="wm-rotation-select">${t('watermarkRotationLabel')}</label>
          <select class="form-input" id="wm-rotation-select">
            <option value="45" selected>${t('watermarkRotationDiagonal')}</option>
            <option value="0">${t('watermarkRotationHorizontal')}</option>
            <option value="90">${t('watermarkRotationVertical')}</option>
            <option value="-45">-45°</option>
          </select>
        </div>

        <div class="form-group">
          <label class="form-label" for="wm-position-select">${t('watermarkPositionLabel')}</label>
          <select class="form-input" id="wm-position-select">
            <option value="center" selected>${t('watermarkPositionCenter')}</option>
            <option value="top-left">${t('watermarkPositionTopLeft')}</option>
            <option value="top-center">${t('watermarkPositionTopCenter')}</option>
            <option value="top-right">${t('watermarkPositionTopRight')}</option>
            <option value="bottom-left">${t('watermarkPositionBottomLeft')}</option>
            <option value="bottom-center">${t('watermarkPositionBottomCenter')}</option>
            <option value="bottom-right">${t('watermarkPositionBottomRight')}</option>
          </select>
        </div>
      </div>

      <div class="form-group" style="margin-bottom: 1rem;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.35rem;">
          <label class="form-label" for="wm-opacity-slider" style="margin-bottom: 0;">${t('watermarkOpacityLabel')}</label>
          <span id="wm-opacity-display" style="font-size: 0.75rem; font-family: var(--font-mono); color: var(--text-primary); font-weight: 600;">30%</span>
        </div>
        <input 
          type="range" 
          id="wm-opacity-slider" 
          min="5" 
          max="90" 
          step="5" 
          value="30" 
          style="width: 100%; accent-color: var(--primary); cursor: pointer;" 
        />
      </div>

      <div style="display: flex; align-items: center; gap: 0.5rem; padding: 0.65rem 0.85rem; background: var(--surface-raised); border: 1px solid var(--border-subtle); border-radius: var(--radius-sm); font-size: 0.75rem; color: var(--text-muted);">
        <i data-lucide="shield-check" style="width: 16px; height: 16px; color: var(--success); flex-shrink: 0;"></i>
        <span>${t('dropzoneZeroUpload')}</span>
      </div>
    `;

    const footerHtml = `
      <button class="btn btn-secondary" id="modal-watermark-cancel-btn">${t('clearModalCancel')}</button>
      <button class="btn btn-primary" id="modal-watermark-submit-btn">
        <i data-lucide="stamp" style="width: 15px; height: 15px;"></i>
        <span>${t('watermarkBtn')}</span>
      </button>
    `;

    this.open(title, bodyHtml, footerHtml);

    const textSection = this.bodyContent.querySelector<HTMLElement>('#wm-text-section')!;
    const imageSection = this.bodyContent.querySelector<HTMLElement>('#wm-image-section')!;
    const typeTextBtn = this.bodyContent.querySelector<HTMLButtonElement>('#wm-type-text-btn')!;
    const typeImageBtn = this.bodyContent.querySelector<HTMLButtonElement>('#wm-type-image-btn')!;
    const textInput = this.bodyContent.querySelector<HTMLInputElement>('#wm-text-input')!;
    const sizeSelect = this.bodyContent.querySelector<HTMLSelectElement>('#wm-size-select')!;
    const colorSelect = this.bodyContent.querySelector<HTMLSelectElement>('#wm-color-select')!;
    const rotationSelect = this.bodyContent.querySelector<HTMLSelectElement>('#wm-rotation-select')!;
    const positionSelect = this.bodyContent.querySelector<HTMLSelectElement>('#wm-position-select')!;
    const opacitySlider = this.bodyContent.querySelector<HTMLInputElement>('#wm-opacity-slider')!;
    const opacityDisplay = this.bodyContent.querySelector<HTMLElement>('#wm-opacity-display')!;
    const imageFileInput = this.bodyContent.querySelector<HTMLInputElement>('#wm-image-file-input')!;
    const browseImageBtn = this.bodyContent.querySelector<HTMLButtonElement>('#wm-browse-image-btn')!;
    const imageLabel = this.bodyContent.querySelector<HTMLElement>('#wm-image-filename-label')!;
    const cancelBtn = this.footerActions.querySelector<HTMLButtonElement>('#modal-watermark-cancel-btn')!;
    const submitBtn = this.footerActions.querySelector<HTMLButtonElement>('#modal-watermark-submit-btn')!;

    // Type toggles
    typeTextBtn.addEventListener('click', () => {
      watermarkType = 'text';
      typeTextBtn.classList.add('active');
      typeImageBtn.classList.remove('active');
      textSection.style.display = 'block';
      imageSection.style.display = 'none';
    });

    typeImageBtn.addEventListener('click', () => {
      watermarkType = 'image';
      typeImageBtn.classList.add('active');
      typeTextBtn.classList.remove('active');
      textSection.style.display = 'none';
      imageSection.style.display = 'block';
    });

    // Image upload trigger
    browseImageBtn.addEventListener('click', () => imageFileInput.click());
    imageFileInput.addEventListener('change', async () => {
      if (imageFileInput.files && imageFileInput.files[0]) {
        const file = imageFileInput.files[0];
        const bytes = new Uint8Array(await file.arrayBuffer());
        uploadedImageBytes = bytes;
        uploadedImageType = file.type === 'image/jpeg' || file.name.match(/\.jpe?g$/i) ? 'jpeg' : 'png';
        imageLabel.textContent = file.name;
        toast.show(`Selected image: ${file.name}`, 'info');
      }
    });

    // Opacity slider live update
    opacitySlider.addEventListener('input', () => {
      const val = parseInt(opacitySlider.value, 10);
      selectedOpacity = val / 100;
      opacityDisplay.textContent = `${val}%`;
    });

    // Select updates
    sizeSelect.addEventListener('change', () => {
      selectedFontSize = parseInt(sizeSelect.value, 10);
    });

    colorSelect.addEventListener('change', () => {
      switch (colorSelect.value) {
        case 'red':
          selectedColor = { r: 0.88, g: 0.11, b: 0.28 };
          break;
        case 'blue':
          selectedColor = { r: 0.15, g: 0.39, b: 0.92 };
          break;
        case 'black':
          selectedColor = { r: 0.05, g: 0.05, b: 0.05 };
          break;
        case 'gray':
        default:
          selectedColor = { r: 0.5, g: 0.5, b: 0.5 };
          break;
      }
    });

    rotationSelect.addEventListener('change', () => {
      selectedRotation = parseInt(rotationSelect.value, 10);
    });

    positionSelect.addEventListener('change', () => {
      selectedPosition = positionSelect.value as WatermarkPosition;
    });

    cancelBtn.addEventListener('click', () => this.close());

    // Submit handler
    submitBtn.addEventListener('click', async () => {
      if (watermarkType === 'image' && !uploadedImageBytes) {
        toast.show('Please select an image file for the watermark', 'info');
        return;
      }

      submitBtn.disabled = true;
      try {
        progressOverlay.show('Applying watermark to PDF...');
        const options: WatermarkOptions = {
          type: watermarkType,
          text: textInput.value.trim() || 'CONFIDENTIAL',
          imageBytes: uploadedImageBytes ?? undefined,
          imageType: uploadedImageType,
          fontSize: selectedFontSize,
          color: selectedColor,
          opacity: selectedOpacity,
          rotation: selectedRotation,
          position: selectedPosition,
        };

        const watermarkedBytes = await addWatermarkToPdf(documentBytes, options, (info) => {
          progressOverlay.update(info);
        });

        progressOverlay.hide();
        this.close();

        downloadBytes(watermarkedBytes, `${baseName}_watermarked.pdf`);
        toast.show(t('toastWatermarkSuccess'), 'success');
        onSuccess?.();
      } catch (err: unknown) {
        progressOverlay.hide();
        submitBtn.disabled = false;
        const msg = err instanceof Error ? err.message : String(err);
        toast.show(`Watermark failed: ${msg}`, 'error');
      }
    });
  }

  // ==========================================
  // PAGE NUMBERING MODAL
  // ==========================================
  showPageNumberModal(
    documentBytes: Uint8Array,
    filename = 'document.pdf',
    onSuccess?: () => void
  ): void {
    const title = `<i data-lucide="hash" style="width: 18px; height: 18px; color: var(--primary);"></i> ${t('numberingModalTitle')}`;
    const baseName = filename.replace(/\.pdf$/i, '');

    let selectedFormat: PageNumberFormat = 'page_n_of_total';
    let selectedPosition: PageNumberPosition = 'bottom-center';
    let selectedFontSize = 11;
    let selectedMargin = 28;
    let skipCover = false;

    const bodyHtml = `
      <div style="font-size: 0.875rem; color: var(--text-secondary); line-height: 1.5; margin-bottom: 1rem;">
        ${t('numberingModalDesc')}
      </div>

      <div class="form-group" style="margin-bottom: 0.85rem;">
        <label class="form-label" for="num-format-select">${t('numberingFormatLabel')}</label>
        <select class="form-input" id="num-format-select">
          <option value="page_n_of_total" selected>${t('numberingFormatPageNOfTotal')}</option>
          <option value="page_n">${t('numberingFormatPageN')}</option>
          <option value="n_slash_total">${t('numberingFormatSlash')}</option>
          <option value="number_only">${t('numberingFormatNumberOnly')}</option>
          <option value="custom">${t('numberingFormatCustom')}</option>
        </select>
      </div>

      <div class="form-group" id="num-custom-template-group" style="display: none; margin-bottom: 0.85rem;">
        <label class="form-label" for="num-custom-template-input">${t('numberingFormatCustom')}</label>
        <input 
          type="text" 
          class="form-input" 
          id="num-custom-template-input" 
          value="Page {n} of {total}" 
          placeholder="${t('numberingCustomPlaceholder')}" 
        />
        <div style="font-size: 0.6875rem; color: var(--text-muted); margin-top: 0.25rem;">
          {n} = current page, {total} = total pages
        </div>
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; margin-bottom: 0.85rem;">
        <div class="form-group">
          <label class="form-label" for="num-position-select">${t('numberingPositionLabel')}</label>
          <select class="form-input" id="num-position-select">
            <option value="bottom-center" selected>${t('numberingPositionBottomCenter')}</option>
            <option value="bottom-right">${t('numberingPositionBottomRight')}</option>
            <option value="bottom-left">${t('numberingPositionBottomLeft')}</option>
            <option value="top-center">${t('numberingPositionTopCenter')}</option>
            <option value="top-right">${t('numberingPositionTopRight')}</option>
            <option value="top-left">${t('numberingPositionTopLeft')}</option>
          </select>
        </div>

        <div class="form-group">
          <label class="form-label" for="num-size-select">${t('numberingSizeLabel')}</label>
          <select class="form-input" id="num-size-select">
            <option value="9">${t('numberingSizeSmall')}</option>
            <option value="11" selected>${t('numberingSizeRegular')}</option>
            <option value="14">${t('numberingSizeLarge')}</option>
          </select>
        </div>
      </div>

      <div class="form-group" style="margin-bottom: 0.85rem;">
        <label class="form-label" for="num-margin-select">${t('numberingMarginLabel')}</label>
        <select class="form-input" id="num-margin-select">
          <option value="18">${t('numberingMarginCompact')}</option>
          <option value="28" selected>${t('numberingMarginStandard')}</option>
          <option value="42">${t('numberingMarginWide')}</option>
        </select>
      </div>

      <div class="form-group" style="margin-bottom: 1rem;">
        <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer; user-select: none; font-size: 0.875rem; color: var(--text-primary);">
          <input type="checkbox" id="num-skip-cover-checkbox" style="width: 16px; height: 16px; accent-color: var(--primary);" />
          <span>${t('numberingSkipCoverLabel')}</span>
        </label>
      </div>

      <div style="display: flex; align-items: center; gap: 0.5rem; padding: 0.65rem 0.85rem; background: var(--surface-raised); border: 1px solid var(--border-subtle); border-radius: var(--radius-sm); font-size: 0.75rem; color: var(--text-muted);">
        <i data-lucide="shield-check" style="width: 16px; height: 16px; color: var(--success); flex-shrink: 0;"></i>
        <span>${t('dropzoneZeroUpload')}</span>
      </div>
    `;

    const footerHtml = `
      <button class="btn btn-secondary" id="modal-numbering-cancel-btn">${t('clearModalCancel')}</button>
      <button class="btn btn-primary" id="modal-numbering-submit-btn">
        <i data-lucide="hash" style="width: 15px; height: 15px;"></i>
        <span>${t('numberingBtn')}</span>
      </button>
    `;

    this.open(title, bodyHtml, footerHtml);

    const formatSelect = this.bodyContent.querySelector<HTMLSelectElement>('#num-format-select')!;
    const customGroup = this.bodyContent.querySelector<HTMLElement>('#num-custom-template-group')!;
    const customInput = this.bodyContent.querySelector<HTMLInputElement>('#num-custom-template-input')!;
    const positionSelect = this.bodyContent.querySelector<HTMLSelectElement>('#num-position-select')!;
    const sizeSelect = this.bodyContent.querySelector<HTMLSelectElement>('#num-size-select')!;
    const marginSelect = this.bodyContent.querySelector<HTMLSelectElement>('#num-margin-select')!;
    const skipCoverCheckbox = this.bodyContent.querySelector<HTMLInputElement>('#num-skip-cover-checkbox')!;
    const cancelBtn = this.footerActions.querySelector<HTMLButtonElement>('#modal-numbering-cancel-btn')!;
    const submitBtn = this.footerActions.querySelector<HTMLButtonElement>('#modal-numbering-submit-btn')!;

    formatSelect.addEventListener('change', () => {
      selectedFormat = formatSelect.value as PageNumberFormat;
      customGroup.style.display = selectedFormat === 'custom' ? 'block' : 'none';
      if (selectedFormat === 'custom') customInput.focus();
    });

    positionSelect.addEventListener('change', () => {
      selectedPosition = positionSelect.value as PageNumberPosition;
    });

    sizeSelect.addEventListener('change', () => {
      selectedFontSize = parseInt(sizeSelect.value, 10);
    });

    marginSelect.addEventListener('change', () => {
      selectedMargin = parseInt(marginSelect.value, 10);
    });

    skipCoverCheckbox.addEventListener('change', () => {
      skipCover = skipCoverCheckbox.checked;
    });

    cancelBtn.addEventListener('click', () => this.close());

    submitBtn.addEventListener('click', async () => {
      submitBtn.disabled = true;
      try {
        progressOverlay.show('Numbering PDF pages...');
        const options: PageNumberOptions = {
          format: selectedFormat,
          customTemplate: customInput.value.trim() || 'Page {n} of {total}',
          position: selectedPosition,
          fontSize: selectedFontSize,
          margin: selectedMargin,
          startFromIndex: skipCover ? 1 : 0,
          startPageNumber: 1,
        };

        const numberedBytes = await addPageNumbersToPdf(documentBytes, options, (info) => {
          progressOverlay.update(info);
        });

        progressOverlay.hide();
        this.close();

        downloadBytes(numberedBytes, `${baseName}_numbered.pdf`);
        toast.show(t('toastNumberingSuccess'), 'success');
        onSuccess?.();
      } catch (err: unknown) {
        progressOverlay.hide();
        submitBtn.disabled = false;
        const msg = err instanceof Error ? err.message : String(err);
        toast.show(`Page numbering failed: ${msg}`, 'error');
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

    const title = `<i data-lucide="scissors" style="width: 18px; height: 18px; color: var(--primary);"></i> ${t('splitModalTitle')}`;
    const bodyHtml = `
      <div class="form-group">
        <label class="form-label">${t('splitModeLabel')}</label>
        <select class="form-select" id="split-mode-select">
          <option value="each">${t('splitModeEach')}</option>
          <option value="ranges">${t('splitModeRanges')}</option>
          ${selectedCount > 0 ? `<option value="selected" selected>${t('splitModeSelected', { count: selectedCount })}</option>` : ''}
        </select>
      </div>

      <div class="form-group" id="split-range-group" style="display: none;">
        <label class="form-label">${t('splitRangesLabel')}</label>
        <input type="text" class="form-input" id="split-range-input" placeholder="${t('splitRangesPlaceholder')}" value="${getDefaultSplitRange(totalPages)}" />
        <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.25rem;">
          ${t('splitRangesHint')} (Total: ${totalPages})
        </div>
      </div>
    `;

    const footerHtml = `
      <button class="btn btn-secondary" id="modal-cancel-btn">${t('clearModalCancel')}</button>
      <button class="btn btn-primary" id="modal-execute-split-btn">
        <i data-lucide="scissors" style="width: 16px; height: 16px;"></i>
        <span>${t('splitBtn')}</span>
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
  async showExtractTextModal(fileBytes: Uint8Array, filename = 'document.pdf', password?: string): Promise<void> {
    try {
      progressOverlay.show('Extracting text from PDF...');
      const text = await extractText(fileBytes, (info) => progressOverlay.update(info), password);
      progressOverlay.hide();

      const title = `<i data-lucide="file-text" style="width: 18px; height: 18px; color: var(--primary);"></i> ${t('extractTextModalTitle')}`;
      const displayText = text.trim() ? text : t('extractTextEmpty');
      const bodyHtml = `
        <div style="font-size: 0.8125rem; color: var(--text-muted);">
          ${escapeHtml(filename)} (${text.length.toLocaleString()} characters)
        </div>
        <textarea class="text-preview-box" id="extracted-text-area" readonly>${escapeHtml(displayText)}</textarea>
      `;

      const footerHtml = `
        <button class="btn btn-secondary" id="modal-copy-text-btn">
          <i data-lucide="copy" style="width: 16px; height: 16px;"></i>
          <span>${t('extractTextCopyBtn')}</span>
        </button>
        <button class="btn btn-primary" id="modal-download-text-btn">
          <i data-lucide="download" style="width: 16px; height: 16px;"></i>
          <span>${t('extractTextDownloadBtn')}</span>
        </button>
      `;

      this.open(title, bodyHtml, footerHtml);

      const textArea = this.bodyContent.querySelector<HTMLTextAreaElement>('#extracted-text-area')!;
      const copyBtn = this.footerActions.querySelector<HTMLButtonElement>('#modal-copy-text-btn')!;
      const dlBtn = this.footerActions.querySelector<HTMLButtonElement>('#modal-download-text-btn')!;

      copyBtn.addEventListener('click', async () => {
        await navigator.clipboard.writeText(textArea.value);
        copyBtn.innerHTML = `<i data-lucide="check" style="width: 16px; height: 16px; color: var(--success);"></i><span>${t('extractTextCopiedBtn')}</span>`;
        this.refreshIcons();
        toast.show('Text copied to clipboard!', 'success');
        setTimeout(() => {
          copyBtn.innerHTML = `<i data-lucide="copy" style="width: 16px; height: 16px;"></i><span>${t('extractTextCopyBtn')}</span>`;
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
      this.close();
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
    const title = `<i data-lucide="image" style="width: 18px; height: 18px; color: var(--primary);"></i> ${t('img2pdfModalTitle')}`;
    const bodyHtml = `
      <div style="font-size: 0.875rem; color: var(--text-secondary); line-height: 1.5; margin-bottom: 0.75rem;">
        ${t('img2pdfModalDesc')}
      </div>

      <div class="form-group">
        <label class="form-label">${t('img2pdfSelectBtn')} (PNG, JPG, WebP, etc.)</label>
        <input type="file" id="img2pdf-file-input" class="form-input" multiple accept="image/*" />
      </div>

      <div class="form-group">
        <label class="form-label">${t('img2pdfSizingLabel')}</label>
        <select class="form-select" id="img2pdf-pagesize-select">
          <option value="A4" selected>${t('img2pdfFitA4')}</option>
          <option value="fit">${t('img2pdfFitOriginal')}</option>
        </select>
      </div>

      <div id="img2pdf-file-list" style="max-height: 140px; overflow-y: auto; font-size: 0.8125rem; color: var(--text-secondary);"></div>
    `;

    const footerHtml = `
      <button class="btn btn-secondary" id="modal-cancel-btn">${t('clearModalCancel')}</button>
      <button class="btn btn-secondary" id="modal-add-to-studio-btn" disabled>
        <i data-lucide="layers" style="width: 16px; height: 16px;"></i>
        <span>${t('img2pdfConvertBtn')}</span>
      </button>
      <button class="btn btn-primary" id="modal-convert-img2pdf-btn" disabled>
        <i data-lucide="download" style="width: 16px; height: 16px;"></i>
        <span>${t('navExport')}</span>
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
    confirmText?: string,
    isDanger = false
  ): void {
    const finalConfirmText = confirmText ?? t('clearModalConfirm');
    const modalTitle = `<i data-lucide="alert-triangle" style="width: 18px; height: 18px; color: ${isDanger ? 'var(--danger)' : 'var(--primary)'};"></i> ${escapeHtml(title)}`;
    const bodyHtml = `
      <div style="font-size: 0.9375rem; color: var(--text-primary); line-height: 1.6;">
        ${escapeHtml(message)}
      </div>
    `;
    const footerHtml = `
      <button class="btn btn-secondary" id="confirm-modal-cancel-btn">${t('clearModalCancel')}</button>
      <button class="btn ${isDanger ? 'btn-danger' : 'btn-primary'}" id="confirm-modal-ok-btn">
        <span>${escapeHtml(finalConfirmText)}</span>
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
    onSubmit: (password: string) => Promise<boolean | void> | boolean | void,
    onCancel?: () => void
  ): void {
    let settled = false;
    let isSubmitting = false;
    const cancelAction = () => {
      if (settled) return;
      settled = true;
      onCancel?.();
    };

    this.setOnClose(cancelAction);

    const title = `<i data-lucide="lock" style="width: 18px; height: 18px; color: var(--primary);"></i> ${t('passwordModalTitle')}`;
    const bodyHtml = `
      <div style="font-size: 0.875rem; color: var(--text-secondary); line-height: 1.5;">
        ${t('passwordModalDesc', { name: `<strong>${escapeHtml(filename)}</strong>` })}
      </div>
      <div class="form-group" style="margin-top: 0.75rem;">
        <label class="form-label" for="pdf-password-input">${t('passwordPlaceholder')}</label>
        <input type="password" class="form-input" id="pdf-password-input" placeholder="${t('passwordPlaceholder')}" autofocus />
        <div id="pdf-password-error" style="color: var(--danger); font-size: 0.75rem; display: none; margin-top: 0.25rem;"></div>
      </div>
    `;
    const footerHtml = `
      <button class="btn btn-secondary" id="modal-password-cancel-btn">${t('clearModalCancel')}</button>
      <button class="btn btn-primary" id="modal-password-submit-btn">
        <i data-lucide="unlock" style="width: 16px; height: 16px;"></i>
        <span>${t('passwordUnlockBtn')}</span>
      </button>
    `;

    this.open(title, bodyHtml, footerHtml);

    const pwdInput = this.bodyContent.querySelector<HTMLInputElement>('#pdf-password-input')!;
    pwdInput.focus();

    const handleCancel = () => {
      cancelAction();
      this.close();
    };

    const handleSubmit = async () => {
      if (isSubmitting || settled) return;
      const val = pwdInput.value;
      const errEl = this.bodyContent.querySelector<HTMLElement>('#pdf-password-error');
      if (!val) {
        if (errEl) {
          errEl.textContent = 'Please enter a password';
          errEl.style.display = 'block';
        }
        return;
      }

      isSubmitting = true;
      const submitBtn = this.footerActions.querySelector<HTMLButtonElement>('#modal-password-submit-btn');
      if (submitBtn) submitBtn.disabled = true;

      try {
        const res = await onSubmit(val);
        if (res === false) {
          throw new Error('Incorrect password');
        }
        settled = true;
        this.setOnClose(null);
        this.close();
      } catch (err: unknown) {
        if (submitBtn) submitBtn.disabled = false;
        if (errEl) {
          const msg = err instanceof Error ? err.message : 'Incorrect password';
          errEl.textContent = msg.includes('cancelled') ? '' : 'Incorrect password. Please try again.';
          errEl.style.display = 'block';
        }
        pwdInput.select();
        pwdInput.focus();
      } finally {
        isSubmitting = false;
      }
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
  showPdfToImagesModal(documentBytes: Uint8Array, filename = 'document.pdf', password?: string): void {
    const title = `<i data-lucide="image" style="width: 18px; height: 18px; color: var(--primary);"></i> ${t('pdf2imgModalTitle')}`;
    const bodyHtml = `
      <div style="font-size: 0.875rem; color: var(--text-secondary); line-height: 1.5; margin-bottom: 0.75rem;">
        ${t('pdf2imgModalDesc')}
      </div>

      <div class="form-group">
        <label class="form-label">${t('pdf2imgDpiLabel')}</label>
        <select class="form-select" id="pdf2img-dpi-select">
          <option value="96">Screen (96 DPI)</option>
          <option value="150" selected>Balanced (150 DPI)</option>
          <option value="300">Ultra High-Res (300 DPI)</option>
        </select>
      </div>

      <div class="form-group">
        <label class="form-label">${t('pdf2imgFormatLabel')}</label>
        <select class="form-select" id="pdf2img-format-select">
          <option value="png" selected>PNG (Lossless)</option>
          <option value="jpeg">JPEG</option>
        </select>
      </div>
    `;

    const footerHtml = `
      <button class="btn btn-secondary" id="modal-cancel-btn">${t('clearModalCancel')}</button>
      <button class="btn btn-primary" id="modal-export-images-btn">
        <i data-lucide="download" style="width: 16px; height: 16px;"></i>
        <span>${t('pdf2imgBtn')}</span>
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
        }, password);

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
