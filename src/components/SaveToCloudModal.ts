import {
  createIcons,
  X,
  Cloud,
  HardDrive,
  Pin,
  Check,
  AlertTriangle,
  FileText,
  Upload,
} from 'lucide';
import { documentService } from '../cloud/document-service';
import { storageService } from '../cloud/storage-service';
import { authService, FREE_STORAGE_LIMIT } from '../cloud/auth-service';
import { formatBytes, escapeHtml } from '../utils/file-utils';
import { t } from '../core/i18n';
import { toast } from './Toast';
import { authModal } from './AuthModal';

export interface SaveToCloudOptions {
  filename: string;
  fileBytes: Uint8Array;
  pageCount: number;
  thumbnailDataUrl?: string;
  onSuccess?: () => void;
  onClose?: () => void;
}

export class SaveToCloudModal {
  private overlay: HTMLElement | null = null;
  private currentOptions: SaveToCloudOptions | null = null;
  private isSaving = false;
  private previousActiveElement: HTMLElement | null = null;

  constructor() {
    this.createDom();
  }

  private createDom(): void {
    if (typeof document === 'undefined') return;
    let el = document.querySelector<HTMLElement>('#save-to-cloud-modal-overlay');
    if (!el) {
      el = document.createElement('div');
      el.id = 'save-to-cloud-modal-overlay';
      el.className = 'modal-overlay save-cloud-modal-overlay';
      document.body.appendChild(el);
    }
    this.overlay = el;

    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) {
        this.close();
      }
    });

    window.addEventListener('keydown', (e) => {
      if (!this.isOpen()) return;
      if (e.key === 'Escape') {
        this.close();
      }
    });
  }

  isOpen(): boolean {
    return Boolean(this.overlay && this.overlay.classList.contains('active'));
  }

  open(options: SaveToCloudOptions): void {
    if (!this.overlay) this.createDom();
    if (!this.overlay) return;

    this.previousActiveElement = (typeof document !== 'undefined' ? document.activeElement : null) as HTMLElement | null;
    this.currentOptions = options;
    this.isSaving = false;

    this.render();
    this.overlay.classList.add('active');

    if (typeof requestAnimationFrame !== 'undefined') {
      requestAnimationFrame(() => {
        const nameInput = this.overlay?.querySelector<HTMLInputElement>('#save-cloud-filename-input');
        nameInput?.focus();
        nameInput?.select();
      });
    }
  }

  close(): void {
    if (!this.overlay) return;
    this.overlay.classList.remove('active');
    if (this.currentOptions?.onClose) {
      this.currentOptions.onClose();
    }
    if (this.previousActiveElement) {
      this.previousActiveElement.focus();
    }
  }

  private render(): void {
    if (!this.overlay || !this.currentOptions) return;

    const user = authService.getCurrentUser();
    const { filename, fileBytes, pageCount } = this.currentOptions;
    const fileSizeFormatted = formatBytes(fileBytes.length);

    if (!user) {
      // Unauthenticated prompt
      this.overlay.innerHTML = `
        <div class="modal-card save-cloud-card" role="dialog" aria-modal="true" aria-labelledby="save-cloud-title">
          <div class="modal-header">
            <h3 class="modal-title" id="save-cloud-title">${t('saveCloudTitle')}</h3>
            <button class="btn btn-ghost btn-icon-only" id="save-cloud-close-btn" title="Close">
              <i data-lucide="x" style="width: 18px; height: 18px;"></i>
            </button>
          </div>
          <div class="modal-body save-cloud-unauth">
            <div class="empty-icon-wrap">
              <i data-lucide="cloud" style="width: 48px; height: 48px; color: var(--primary);"></i>
            </div>
            <h4>Sign in to save to Cloud</h4>
            <p>${t('authSignInPrompt')}</p>
            <div class="unauth-actions">
              <button class="btn btn-primary" id="save-cloud-signin-btn">
                <i data-lucide="cloud" style="width: 16px; height: 16px;"></i>
                <span>${t('authSignInBtn')}</span>
              </button>
              <button class="btn btn-secondary" id="save-cloud-cancel-btn">
                <span>Cancel</span>
              </button>
            </div>
          </div>
        </div>
      `;

      this.overlay.querySelector('#save-cloud-close-btn')?.addEventListener('click', () => this.close());
      this.overlay.querySelector('#save-cloud-cancel-btn')?.addEventListener('click', () => this.close());
      this.overlay.querySelector('#save-cloud-signin-btn')?.addEventListener('click', () => {
        this.close();
        authModal.open({
          onSuccess: () => {
            // Re-open save dialog upon successful login
            if (this.currentOptions) {
              this.open(this.currentOptions);
            }
          },
        });
      });
      this.refreshIcons();
      return;
    }

    const quota = storageService.checkQuota(fileBytes.length);
    const limit = user.storageLimitBytes || FREE_STORAGE_LIMIT;
    const used = user.storageUsedBytes || 0;
    const remaining = Math.max(0, limit - used);
    const usedPercent = Math.min(100, Math.round(((used + fileBytes.length) / limit) * 100));

    this.overlay.innerHTML = `
      <div class="modal-card save-cloud-card" role="dialog" aria-modal="true" aria-labelledby="save-cloud-title">
        <div class="modal-header">
          <div class="modal-title-wrap">
            <h3 class="modal-title" id="save-cloud-title">${t('saveCloudTitle')}</h3>
            <p class="modal-subtitle">${t('saveCloudDesc')}</p>
          </div>
          <button class="btn btn-ghost btn-icon-only" id="save-cloud-close-btn" title="Close">
            <i data-lucide="x" style="width: 18px; height: 18px;"></i>
          </button>
        </div>

        <div class="modal-body save-cloud-body">
          <div class="form-group">
            <label for="save-cloud-filename-input" class="form-label">${t('saveCloudFilenameLabel')}</label>
            <div class="input-icon-wrap">
              <i data-lucide="file-text" style="width: 16px; height: 16px;"></i>
              <input
                type="text"
                id="save-cloud-filename-input"
                class="form-input"
                value="${escapeHtml(filename)}"
                required
              />
            </div>
          </div>

          <div class="file-summary-card">
            <div class="summary-item">
              <span class="summary-label">Document Size</span>
              <span class="summary-val">${fileSizeFormatted}</span>
            </div>
            <div class="summary-sep"></div>
            <div class="summary-item">
              <span class="summary-label">Page Count</span>
              <span class="summary-val">${pageCount} ${pageCount === 1 ? 'page' : 'pages'}</span>
            </div>
          </div>

          <!-- Quota Indicator -->
          <div class="cloud-quota-box">
            <div class="quota-header">
              <div class="quota-label">
                <i data-lucide="hard-drive" style="width: 14px; height: 14px;"></i>
                <span>${t('saveCloudQuotaLabel')}</span>
              </div>
              <span class="quota-remaining">
                ${t('saveCloudQuotaRemaining', {
                  remaining: formatBytes(remaining),
                  limit: formatBytes(limit),
                })}
              </span>
            </div>
            <div class="storage-bar-track">
              <div class="storage-bar-fill ${usedPercent > 90 ? 'storage-danger' : ''}" style="width: ${usedPercent}%;"></div>
            </div>
            ${
              !quota.allowed
                ? `
              <div class="quota-warning-msg">
                <i data-lucide="alert-triangle" style="width: 14px; height: 14px;"></i>
                <span>${t('saveCloudExceeded')}</span>
              </div>
            `
                : ''
            }
          </div>

          <!-- Pin Option -->
          <label class="checkbox-option-card">
            <input type="checkbox" id="save-cloud-pin-checkbox" />
            <div class="checkbox-custom"></div>
            <div class="checkbox-text">
              <span class="checkbox-title">
                <i data-lucide="pin" style="width: 14px; height: 14px; color: var(--primary);"></i>
                ${t('saveCloudPinOption')}
              </span>
              <span class="checkbox-sub">Unpinned documents automatically clear after 30 days to keep your storage lean.</span>
            </div>
          </label>
        </div>

        <div class="modal-footer save-cloud-footer">
          <button class="btn btn-secondary" id="save-cloud-cancel-btn">
            <span>Cancel</span>
          </button>
          <button
            class="btn btn-primary"
            id="save-cloud-submit-btn"
            ${!quota.allowed || this.isSaving ? 'disabled' : ''}
          >
            <i data-lucide="${this.isSaving ? 'upload' : 'cloud'}" style="width: 16px; height: 16px;" class="${
      this.isSaving ? 'spin-icon' : ''
    }"></i>
            <span>${this.isSaving ? t('saveCloudSaving') : t('saveCloudBtn')}</span>
          </button>
        </div>
      </div>
    `;

    this.bindEvents();
    this.refreshIcons();
  }

  private refreshIcons(): void {
    createIcons({
      icons: {
        X,
        Cloud,
        HardDrive,
        Pin,
        Check,
        AlertTriangle,
        FileText,
        Upload,
      },
      nameAttr: 'data-lucide',
    });
  }

  private bindEvents(): void {
    if (!this.overlay || !this.currentOptions) return;

    const closeBtn = this.overlay.querySelector('#save-cloud-close-btn');
    closeBtn?.addEventListener('click', () => this.close());

    const cancelBtn = this.overlay.querySelector('#save-cloud-cancel-btn');
    cancelBtn?.addEventListener('click', () => this.close());

    const submitBtn = this.overlay.querySelector<HTMLButtonElement>('#save-cloud-submit-btn');
    submitBtn?.addEventListener('click', async () => {
      if (!this.currentOptions || this.isSaving) return;

      const filenameInput = this.overlay?.querySelector<HTMLInputElement>('#save-cloud-filename-input');
      const pinCheckbox = this.overlay?.querySelector<HTMLInputElement>('#save-cloud-pin-checkbox');

      let finalName = filenameInput?.value.trim() || this.currentOptions.filename;
      if (!finalName.toLowerCase().endsWith('.pdf')) {
        finalName += '.pdf';
      }

      const isPinned = Boolean(pinCheckbox?.checked);

      this.currentOptions.filename = finalName;
      this.isSaving = true;
      this.render();

      try {
        await documentService.saveDocument({
          filename: finalName,
          fileBytes: this.currentOptions.fileBytes,
          pageCount: this.currentOptions.pageCount,
          thumbnailDataUrl: this.currentOptions.thumbnailDataUrl,
          isPinned,
        });

        toast.show(t('saveCloudSuccess', { name: finalName }), 'success');
        this.close();

        if (this.currentOptions.onSuccess) {
          this.currentOptions.onSuccess();
        }
      } catch (err: any) {
        this.isSaving = false;
        this.render();
        toast.show(`Save failed: ${err.message}`, 'error');
      }
    });
  }
}

export const saveToCloudModal = new SaveToCloudModal();
