import {
  createIcons,
  X,
  FolderOpen,
  Download,
  Share2,
  Trash2,
  Pin,
  PinOff,
  Search,
  RefreshCw,
  Clock,
  Layers,
  FileText,
  Copy,
  ExternalLink,
  Cloud,
} from 'lucide';
import { authService } from '../cloud/auth-service';
import { authModal } from './AuthModal';
import { documentService, type CloudDocument } from '../cloud/document-service';
import { formatBytes, downloadBytes, escapeHtml } from '../utils/file-utils';
import { t } from '../core/i18n';
import { toast } from './Toast';
import { progressOverlay } from './ProgressOverlay';
import { modal } from './Modal';

export interface CloudLibraryOptions {
  onOpenInStudio?: (doc: CloudDocument, bytes: Uint8Array) => Promise<void> | void;
  onClose?: () => void;
}

export class CloudLibraryModal {
  private overlay: HTMLElement | null = null;
  private documents: CloudDocument[] = [];
  private searchQuery = '';
  private isLoading = false;
  private options: CloudLibraryOptions = {};
  private previousActiveElement: HTMLElement | null = null;

  constructor(options: CloudLibraryOptions = {}) {
    this.options = options;
    this.createDom();
  }

  setOptions(options: CloudLibraryOptions): void {
    this.options = { ...this.options, ...options };
  }

  private createDom(): void {
    if (typeof document === 'undefined') return;
    let el = document.querySelector<HTMLElement>('#cloud-library-modal-overlay');
    if (!el) {
      el = document.createElement('div');
      el.id = 'cloud-library-modal-overlay';
      el.className = 'modal-overlay cloud-library-modal-overlay';
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

  async open(): Promise<void> {
    if (!this.overlay) this.createDom();
    if (!this.overlay) return;

    this.previousActiveElement = (typeof document !== 'undefined' ? document.activeElement : null) as HTMLElement | null;
    this.overlay.classList.add('active');
    this.isLoading = true;
    this.searchQuery = '';
    this.render();

    await this.loadDocuments();
  }

  close(): void {
    if (!this.overlay) return;
    this.overlay.classList.remove('active');
    if (this.options.onClose) {
      this.options.onClose();
    }
    if (this.previousActiveElement) {
      this.previousActiveElement.focus();
    }
  }

  private async loadDocuments(): Promise<void> {
    if (!authService.isAuthenticated()) {
      this.documents = [];
      this.isLoading = false;
      this.render();
      return;
    }

    this.isLoading = true;
    this.render();

    try {
      await documentService.cleanupExpiredDocuments();
      this.documents = await documentService.fetchUserDocuments();
    } catch (err: any) {
      console.error('Failed to load cloud docs:', err);
      toast.show('Failed to fetch cloud documents', 'error');
      this.documents = [];
    } finally {
      this.isLoading = false;
      this.render();
    }
  }

  private getFilteredDocuments(): CloudDocument[] {
    if (!this.searchQuery.trim()) return this.documents;
    const q = this.searchQuery.toLowerCase().trim();
    return this.documents.filter((d) => d.filename.toLowerCase().includes(q));
  }

  private render(): void {
    if (!this.overlay) return;

    const isAuth = authService.isAuthenticated();
    const filtered = this.getFilteredDocuments();
    const countText = t('cloudLibDocCount', { count: this.documents.length });

    this.overlay.innerHTML = `
      <div class="modal-card cloud-library-card" role="dialog" aria-modal="true" aria-labelledby="cloud-lib-title">
        <div class="modal-header cloud-library-header">
          <div class="cloud-header-info">
            <div class="cloud-title-row">
              <i data-lucide="folder-open" style="width: 22px; height: 22px; color: var(--primary);"></i>
              <h3 class="modal-title" id="cloud-lib-title">${t('cloudLibTitle')}</h3>
              <span class="cloud-doc-badge">${countText}</span>
            </div>
            <p class="cloud-lib-subtitle">${t('cloudLibDesc')}</p>
          </div>
          <div class="cloud-header-actions">
            <button class="btn btn-ghost btn-icon-only" id="cloud-refresh-btn" title="Refresh">
              <i data-lucide="refresh-cw" style="width: 16px; height: 16px;" class="${this.isLoading ? 'spin-icon' : ''}"></i>
            </button>
            <button class="btn btn-ghost btn-icon-only" id="cloud-close-btn" title="Close" aria-label="Close modal">
              <i data-lucide="x" style="width: 18px; height: 18px;"></i>
            </button>
          </div>
        </div>

        <div class="cloud-library-search-bar" style="${isAuth ? '' : 'display: none;'}">
          <div class="search-input-wrap">
            <i data-lucide="search" style="width: 16px; height: 16px;"></i>
            <input
              type="text"
              id="cloud-search-input"
              class="form-input search-input"
              placeholder="${t('cloudLibSearchPlaceholder')}"
              value="${escapeHtml(this.searchQuery)}"
            />
          </div>
        </div>

        <div class="modal-body cloud-library-body" id="cloud-library-list-container">
          ${
            !isAuth
              ? `
            <div class="cloud-library-empty cloud-library-unauth">
              <div class="empty-icon-wrap">
                <i data-lucide="cloud" style="width: 44px; height: 44px; color: var(--primary);"></i>
              </div>
              <h4 class="empty-title">Sign in to view your Cloud Library</h4>
              <p class="empty-desc">${t('authSignInPrompt')}</p>
              <button class="btn btn-primary" id="cloud-lib-signin-btn" style="margin-top: 0.5rem;">
                <i data-lucide="cloud" style="width: 16px; height: 16px;"></i>
                <span>${t('authSignInBtn')}</span>
              </button>
            </div>
          `
              : this.isLoading
              ? `
            <div class="cloud-library-loading">
              <i data-lucide="refresh-cw" class="spin-icon" style="width: 32px; height: 32px; color: var(--primary);"></i>
              <span>Loading your cloud documents...</span>
            </div>
          `
              : filtered.length === 0
              ? `
            <div class="cloud-library-empty">
              <div class="empty-icon-wrap">
                <i data-lucide="file-text" style="width: 44px; height: 44px; color: var(--text-muted);"></i>
              </div>
              <h4 class="empty-title">${t('cloudLibEmpty')}</h4>
              <p class="empty-desc">${t('cloudLibEmptySub')}</p>
            </div>
          `
              : `
            <div class="cloud-doc-grid">
              ${filtered.map((doc) => this.renderDocCard(doc)).join('')}
            </div>
          `
          }
        </div>
      </div>
    `;

    this.bindEvents();
    this.refreshIcons();
  }

  private renderDocCard(doc: CloudDocument): string {
    const formattedSize = formatBytes(doc.sizeBytes);
    const dateFormatted = new Date(doc.createdAt).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });

    const daysLeft = documentService.getDaysUntilExpiration(doc);
    let expiryBadgeHtml = '';
    if (doc.isPinned) {
      expiryBadgeHtml = `
        <span class="expiry-pill expiry-pinned" title="${t('cloudLibPinned')}">
          <i data-lucide="pin" style="width: 11px; height: 11px;"></i>
          <span>${t('cloudLibPinned')}</span>
        </span>
      `;
    } else if (daysLeft !== null) {
      if (daysLeft <= 0) {
        expiryBadgeHtml = `
          <span class="expiry-pill expiry-alert" title="${t('cloudLibExpiresToday')}">
            <i data-lucide="clock" style="width: 11px; height: 11px;"></i>
            <span>${t('cloudLibExpiresToday')}</span>
          </span>
        `;
      } else {
        expiryBadgeHtml = `
          <span class="expiry-pill" title="${t('cloudLibExpiresIn', { days: daysLeft })}">
            <i data-lucide="clock" style="width: 11px; height: 11px;"></i>
            <span>${t('cloudLibExpiresIn', { days: daysLeft })}</span>
          </span>
        `;
      }
    }

    return `
      <div class="cloud-doc-card ${doc.isPinned ? 'pinned-card' : ''}" data-doc-id="${doc.id}">
        <div class="cloud-doc-preview">
          ${
            doc.thumbnailDataUrl
              ? `<img src="${doc.thumbnailDataUrl}" alt="${escapeHtml(doc.filename)}" class="cloud-doc-thumb" />`
              : `<div class="cloud-doc-placeholder"><i data-lucide="file-text" style="width: 28px; height: 28px;"></i></div>`
          }
          <div class="cloud-doc-badge-overlay">
            ${expiryBadgeHtml}
          </div>
        </div>

        <div class="cloud-doc-details">
          <div class="cloud-doc-name-row">
            <h4 class="cloud-doc-filename" title="${escapeHtml(doc.filename)}">${escapeHtml(doc.filename)}</h4>
            <button class="btn btn-ghost btn-icon-only pin-toggle-btn" data-action="pin" data-doc-id="${doc.id}" title="${
              doc.isPinned ? t('cloudLibUnpinBtn') : t('cloudLibPinBtn')
            }">
              <i data-lucide="${doc.isPinned ? 'pin-off' : 'pin'}" style="width: 15px; height: 15px; ${
                doc.isPinned ? 'color: var(--primary);' : ''
              }"></i>
            </button>
          </div>

          <div class="cloud-doc-meta-row">
            <span>${formattedSize}</span>
            <span class="meta-dot">•</span>
            <span>${doc.pageCount} ${doc.pageCount === 1 ? 'page' : 'pages'}</span>
            <span class="meta-dot">•</span>
            <span>${dateFormatted}</span>
          </div>

          <div class="cloud-doc-actions-row">
            <button class="btn btn-primary btn-sm open-studio-btn" data-action="open-studio" data-doc-id="${doc.id}">
              <i data-lucide="layers" style="width: 14px; height: 14px;"></i>
              <span>${t('cloudLibOpenStudio')}</span>
            </button>
            <button class="btn btn-secondary btn-sm action-download-btn" data-action="download" data-doc-id="${doc.id}" title="${t('cloudLibDownload')}">
              <i data-lucide="download" style="width: 14px; height: 14px;"></i>
            </button>
            <button class="btn btn-secondary btn-sm action-share-btn" data-action="share" data-doc-id="${doc.id}" title="${t('cloudLibShare')}">
              <i data-lucide="share-2" style="width: 14px; height: 14px;"></i>
            </button>
            <button class="btn btn-danger btn-sm action-delete-btn" data-action="delete" data-doc-id="${doc.id}" title="${t('cloudLibDelete')}">
              <i data-lucide="trash-2" style="width: 14px; height: 14px;"></i>
            </button>
          </div>
        </div>
      </div>
    `;
  }

  private refreshIcons(): void {
    createIcons({
      icons: {
        X,
        FolderOpen,
        Download,
        Share2,
        Trash2,
        Pin,
        PinOff,
        Search,
        RefreshCw,
        Clock,
        Layers,
        FileText,
        Copy,
        ExternalLink,
        Cloud,
      },
      nameAttr: 'data-lucide',
    });
  }

  private bindEvents(): void {
    if (!this.overlay) return;

    // Close button
    const closeBtn = this.overlay.querySelector('#cloud-close-btn');
    closeBtn?.addEventListener('click', () => this.close());

    // Refresh button
    const refreshBtn = this.overlay.querySelector('#cloud-refresh-btn');
    refreshBtn?.addEventListener('click', () => this.loadDocuments());

    // Unauthenticated sign-in button
    const signInBtn = this.overlay.querySelector('#cloud-lib-signin-btn');
    signInBtn?.addEventListener('click', () => {
      authModal.open({
        onSuccess: async () => {
          await this.loadDocuments();
        },
      });
    });

    // Search input
    const searchInput = this.overlay.querySelector<HTMLInputElement>('#cloud-search-input');
    searchInput?.addEventListener('input', (e) => {
      this.searchQuery = (e.target as HTMLInputElement).value;
      const listContainer = this.overlay?.querySelector('#cloud-library-list-container');
      if (listContainer) {
        const filtered = this.getFilteredDocuments();
        if (filtered.length === 0) {
          listContainer.innerHTML = `
            <div class="cloud-library-empty">
              <div class="empty-icon-wrap">
                <i data-lucide="file-text" style="width: 44px; height: 44px; color: var(--text-muted);"></i>
              </div>
              <h4 class="empty-title">${t('cloudLibEmpty')}</h4>
              <p class="empty-desc">No documents match "${escapeHtml(this.searchQuery)}"</p>
            </div>
          `;
        } else {
          listContainer.innerHTML = `
            <div class="cloud-doc-grid">
              ${filtered.map((doc) => this.renderDocCard(doc)).join('')}
            </div>
          `;
        }
        this.bindCardActions();
        this.refreshIcons();
      }
    });

    this.bindCardActions();
  }

  private bindCardActions(): void {
    if (!this.overlay) return;

    // Open in Visual Studio
    const openBtns = this.overlay.querySelectorAll<HTMLButtonElement>('[data-action="open-studio"]');
    openBtns.forEach((btn) => {
      btn.addEventListener('click', async () => {
        const docId = btn.getAttribute('data-doc-id');
        const doc = this.documents.find((d) => d.id === docId);
        if (!doc) return;

        try {
          progressOverlay.show(t('cloudLibLoadingDoc'));
          const fileBytes = await documentService.getDocumentBytes(doc);
          progressOverlay.hide();
          this.close();

          if (this.options.onOpenInStudio) {
            await this.options.onOpenInStudio(doc, fileBytes);
          }
        } catch (err: any) {
          progressOverlay.hide();
          toast.show(`Failed to open document: ${err.message}`, 'error');
        }
      });
    });

    // Download button
    const downloadBtns = this.overlay.querySelectorAll<HTMLButtonElement>('[data-action="download"]');
    downloadBtns.forEach((btn) => {
      btn.addEventListener('click', async () => {
        const docId = btn.getAttribute('data-doc-id');
        const doc = this.documents.find((d) => d.id === docId);
        if (!doc) return;

        try {
          progressOverlay.show('Downloading from cloud...');
          const fileBytes = await documentService.getDocumentBytes(doc);
          progressOverlay.hide();
          downloadBytes(fileBytes, doc.filename);
        } catch (err: any) {
          progressOverlay.hide();
          toast.show(`Download failed: ${err.message}`, 'error');
        }
      });
    });

    // Share button
    const shareBtns = this.overlay.querySelectorAll<HTMLButtonElement>('[data-action="share"]');
    shareBtns.forEach((btn) => {
      btn.addEventListener('click', async () => {
        const docId = btn.getAttribute('data-doc-id');
        const doc = this.documents.find((d) => d.id === docId);
        if (!doc) return;

        try {
          const url = await documentService.getDocumentDownloadUrl(doc);
          let copied = false;
          if (navigator.clipboard && navigator.clipboard.writeText) {
            try {
              await navigator.clipboard.writeText(url);
              copied = true;
            } catch {
              // Insecure context or permission denied fallback
            }
          }
          if (copied) {
            toast.show(t('cloudLibShareCopied'), 'success');
          } else {
            prompt('Copy share link:', url);
          }
        } catch (err: any) {
          toast.show(`Could not generate share link: ${err.message}`, 'error');
        }
      });
    });

    // Pin toggle button
    const pinBtns = this.overlay.querySelectorAll<HTMLButtonElement>('[data-action="pin"]');
    pinBtns.forEach((btn) => {
      btn.addEventListener('click', async () => {
        const docId = btn.getAttribute('data-doc-id');
        if (!docId) return;

        try {
          const updated = await documentService.togglePin(docId);
          const idx = this.documents.findIndex((d) => d.id === docId);
          if (idx !== -1) {
            this.documents[idx] = updated;
          }
          toast.show(updated.isPinned ? 'Document pinned (Permanent)' : 'Document unpinned (30-day auto-expiry)', 'info');
          this.render();
        } catch (err: any) {
          toast.show(`Failed to toggle pin: ${err.message}`, 'error');
        }
      });
    });

    // Delete button
    const deleteBtns = this.overlay.querySelectorAll<HTMLButtonElement>('[data-action="delete"]');
    deleteBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const docId = btn.getAttribute('data-doc-id');
        const doc = this.documents.find((d) => d.id === docId);
        if (!doc || !docId) return;

        modal.showConfirmModal(
          t('cloudLibDelete'),
          t('cloudLibDeleteConfirm'),
          async () => {
            try {
              await documentService.deleteDocument(docId);
              this.documents = this.documents.filter((d) => d.id !== docId);
              toast.show(t('cloudLibDeleted'), 'info');
              this.render();
            } catch (err: any) {
              toast.show(`Failed to delete document: ${err.message}`, 'error');
            }
          },
          t('cloudLibDelete'),
          true
        );
      });
    });
  }
}

export const cloudLibraryModal = new CloudLibraryModal();
