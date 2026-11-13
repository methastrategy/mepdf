import { escapeHtml, downloadBytes } from '../../utils/file-utils';
import { pdfWorker } from '../../core/worker-client';
import { getPDFMetadata } from '../../core/pdf-operations';
import type { PDFInfoMetadata } from '../../core/types';
import { toast } from '../Toast';
import { progressOverlay } from '../ProgressOverlay';
import { t } from '../../core/i18n';
import type { ModalContext } from './ModalContext';

export async function showMetadataModal(
  modal: ModalContext,
  documentBytes: Uint8Array,
  filename = 'document.pdf',
  onSuccess?: () => void
): Promise<void> {
  const title = `<i data-lucide="tag" style="width: 18px; height: 18px; color: var(--primary);"></i> ${t('metadataModalTitle')}`;
  const baseName = filename.replace(/\.pdf$/i, '');

  progressOverlay.show('Reading document metadata...');
  let meta: PDFInfoMetadata;
  try {
    meta = await getPDFMetadata(documentBytes);
  } catch {
    meta = {};
  } finally {
    progressOverlay.hide();
  }

  const bodyHtml = `
    <div style="font-size: 0.875rem; color: var(--text-secondary); line-height: 1.5; margin-bottom: 1rem;">
      ${t('metadataModalDesc')}
    </div>

    <!-- Quick Sanitize Privacy Banner -->
    <div style="display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; padding: 0.75rem 1rem; background: var(--surface-raised); border: 1px solid var(--border-subtle); border-radius: var(--radius-sm); margin-bottom: 1rem;">
      <div style="display: flex; align-items: center; gap: 0.5rem; font-size: 0.75rem; color: var(--text-muted);">
        <i data-lucide="shield-alert" style="width: 18px; height: 18px; color: var(--warning); flex-shrink: 0;"></i>
        <span>${t('metadataCleanHint')}</span>
      </div>
      <button type="button" class="btn btn-secondary" id="meta-quick-sanitize-btn" style="white-space: nowrap; font-size: 0.75rem; padding: 0.35rem 0.65rem;">
        ${t('metadataQuickSanitizeBtn')}
      </button>
    </div>

    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; margin-bottom: 0.85rem;">
      <div class="form-group">
        <label class="form-label" for="meta-title-input">${t('metadataTitleLabel')}</label>
        <input 
          type="text" 
          class="form-input" 
          id="meta-title-input" 
          value="${escapeHtml(meta.title || '')}" 
          placeholder="${escapeHtml(baseName)}" 
        />
      </div>

      <div class="form-group">
        <label class="form-label" for="meta-author-input">${t('metadataAuthorLabel')}</label>
        <input 
          type="text" 
          class="form-input" 
          id="meta-author-input" 
          value="${escapeHtml(meta.author || '')}" 
          placeholder="e.g. John Doe" 
        />
      </div>
    </div>

    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; margin-bottom: 0.85rem;">
      <div class="form-group">
        <label class="form-label" for="meta-subject-input">${t('metadataSubjectLabel')}</label>
        <input 
          type="text" 
          class="form-input" 
          id="meta-subject-input" 
          value="${escapeHtml(meta.subject || '')}" 
          placeholder="e.g. Annual Report" 
        />
      </div>

      <div class="form-group">
        <label class="form-label" for="meta-keywords-input">${t('metadataKeywordsLabel')}</label>
        <input 
          type="text" 
          class="form-input" 
          id="meta-keywords-input" 
          value="${escapeHtml(meta.keywords || '')}" 
          placeholder="e.g. finance, 2026, audit" 
        />
      </div>
    </div>

    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; margin-bottom: 1rem;">
      <div class="form-group">
        <label class="form-label" for="meta-creator-input">${t('metadataCreatorLabel')}</label>
        <input 
          type="text" 
          class="form-input" 
          id="meta-creator-input" 
          value="${escapeHtml(meta.creator || '')}" 
          placeholder="e.g. Word, LaTeX, mePDF" 
        />
      </div>

      <div class="form-group">
        <label class="form-label" for="meta-producer-input">${t('metadataProducerLabel')}</label>
        <input 
          type="text" 
          class="form-input" 
          id="meta-producer-input" 
          value="${escapeHtml(meta.producer || '')}" 
          placeholder="e.g. macOS Quartz, Acrobat" 
        />
      </div>
    </div>
  `;

  const footerHtml = `
    <button class="btn btn-secondary" id="modal-meta-cancel-btn">${t('clearModalCancel')}</button>
    <button class="btn btn-primary" id="modal-meta-save-btn">
      <i data-lucide="tag" style="width: 15px; height: 15px;"></i>
      <span>${t('metadataSaveBtn')}</span>
    </button>
  `;

  modal.open(title, bodyHtml, footerHtml);

  const titleInput = modal.bodyContent.querySelector<HTMLInputElement>('#meta-title-input')!;
  const authorInput = modal.bodyContent.querySelector<HTMLInputElement>('#meta-author-input')!;
  const subjectInput = modal.bodyContent.querySelector<HTMLInputElement>('#meta-subject-input')!;
  const keywordsInput = modal.bodyContent.querySelector<HTMLInputElement>('#meta-keywords-input')!;
  const creatorInput = modal.bodyContent.querySelector<HTMLInputElement>('#meta-creator-input')!;
  const producerInput = modal.bodyContent.querySelector<HTMLInputElement>('#meta-producer-input')!;
  const quickSanitizeBtn = modal.bodyContent.querySelector<HTMLButtonElement>('#meta-quick-sanitize-btn')!;
  const cancelBtn = modal.footerActions.querySelector<HTMLButtonElement>('#modal-meta-cancel-btn')!;
  const saveBtn = modal.footerActions.querySelector<HTMLButtonElement>('#modal-meta-save-btn')!;

  quickSanitizeBtn.addEventListener('click', async () => {
    titleInput.value = '';
    authorInput.value = '';
    subjectInput.value = '';
    keywordsInput.value = '';
    creatorInput.value = '';
    producerInput.value = '';

    try {
      progressOverlay.show('Sanitizing all document metadata...');
      const cleanedBytes = await pdfWorker.updatePdfMetadata(documentBytes, {}, true);
      progressOverlay.hide();
      modal.close();

      downloadBytes(cleanedBytes, `${baseName}_sanitized.pdf`);
      toast.show(t('toastMetadataSanitized'), 'success');
      onSuccess?.();
    } catch (err: unknown) {
      progressOverlay.hide();
      const msg = err instanceof Error ? err.message : String(err);
      toast.show(`Sanitize failed: ${msg}`, 'error');
    }
  });

  cancelBtn.addEventListener('click', () => modal.close());

  saveBtn.addEventListener('click', async () => {
    saveBtn.disabled = true;
    try {
      progressOverlay.show('Updating document metadata...');
      const updatedBytes = await pdfWorker.updatePdfMetadata(
        documentBytes,
        {
          title: titleInput.value.trim(),
          author: authorInput.value.trim(),
          subject: subjectInput.value.trim(),
          keywords: keywordsInput.value.trim(),
          creator: creatorInput.value.trim(),
          producer: producerInput.value.trim(),
        },
        false
      );
      progressOverlay.hide();
      modal.close();

      downloadBytes(updatedBytes, `${baseName}_metadata.pdf`);
      toast.show(t('toastMetadataSaved'), 'success');
      onSuccess?.();
    } catch (err: unknown) {
      progressOverlay.hide();
      saveBtn.disabled = false;
      const msg = err instanceof Error ? err.message : String(err);
      toast.show(`Metadata update failed: ${msg}`, 'error');
    }
  });
}
