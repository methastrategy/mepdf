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
  Tag,
  ShieldAlert,
  FileCheck,
} from 'lucide';
import type { PDFPageItem, DocumentMetadata } from '../core/types';
import type { ModalContext } from './modals/ModalContext';
import {
  getDefaultSplitRange,
  showCompressModal,
  showProtectModal,
  showWatermarkModal,
  showPageNumberModal,
  showMetadataModal,
  showSplitModal,
  showExtractTextModal,
  showImagesToPdfModal,
  showPdfToImagesModal,
  showConfirmModal,
  showPasswordPromptModal,
} from './modals';

export { getDefaultSplitRange };

export class ModalManager implements ModalContext {
  public overlay!: HTMLElement;
  public headerTitle!: HTMLElement;
  public bodyContent!: HTMLElement;
  public footerActions!: HTMLElement;
  public closeBtn!: HTMLButtonElement;
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
        if (!this.isOpen()) return;
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

  refreshIcons(): void {
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
        Tag,
        ShieldAlert,
        FileCheck,
      },
      nameAttr: 'data-lucide',
    });
  }

  // ==========================================
  // DELEGATED MODAL METHODS (Sub-controllers)
  // ==========================================
  showCompressModal(documentBytes: Uint8Array, filename = 'document.pdf', password?: string): void {
    showCompressModal(this, documentBytes, filename, password);
  }

  showProtectModal(
    documentBytes: Uint8Array,
    filename = 'document.pdf',
    onSuccess?: () => void
  ): void {
    showProtectModal(this, documentBytes, filename, onSuccess);
  }

  showWatermarkModal(
    documentBytes: Uint8Array,
    filename = 'document.pdf',
    onSuccess?: () => void
  ): void {
    showWatermarkModal(this, documentBytes, filename, onSuccess);
  }

  showPageNumberModal(
    documentBytes: Uint8Array,
    filename = 'document.pdf',
    onSuccess?: () => void
  ): void {
    showPageNumberModal(this, documentBytes, filename, onSuccess);
  }

  async showMetadataModal(
    documentBytes: Uint8Array,
    filename = 'document.pdf',
    onSuccess?: () => void
  ): Promise<void> {
    return showMetadataModal(this, documentBytes, filename, onSuccess);
  }

  showSplitModal(
    pages: PDFPageItem[],
    documentMap: Map<string, DocumentMetadata>,
    baseFilename = 'split'
  ): void {
    showSplitModal(this, pages, documentMap, baseFilename);
  }

  async showExtractTextModal(
    fileBytes: Uint8Array,
    filename = 'document.pdf',
    password?: string
  ): Promise<void> {
    return showExtractTextModal(this, fileBytes, filename, password);
  }

  showImagesToPdfModal(
    onAddToStudio?: (files: File[], pageSize: 'A4' | 'fit') => Promise<void>
  ): void {
    showImagesToPdfModal(this, onAddToStudio);
  }

  showConfirmModal(
    title: string,
    message: string,
    onConfirm: () => void,
    confirmText?: string,
    isDanger = false
  ): void {
    showConfirmModal(this, title, message, onConfirm, confirmText, isDanger);
  }

  showPasswordPromptModal(
    filename: string,
    onSubmit: (password: string) => Promise<boolean | void> | boolean | void,
    onCancel?: () => void
  ): void {
    showPasswordPromptModal(this, filename, onSubmit, onCancel);
  }

  showPdfToImagesModal(
    documentBytes: Uint8Array,
    filename = 'document.pdf',
    password?: string
  ): void {
    showPdfToImagesModal(this, documentBytes, filename, password);
  }
}

export const modal = new ModalManager();
