import { escapeHtml, formatBytes, downloadBytes } from '../../utils/file-utils';
import { imagesToPdf } from '../../core/pdf-operations';
import { toast } from '../Toast';
import { progressOverlay } from '../ProgressOverlay';
import { t } from '../../core/i18n';
import type { ModalContext } from './ModalContext';

export function showImagesToPdfModal(
  modal: ModalContext,
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

  modal.open(title, bodyHtml, footerHtml);

  const fileInput = modal.bodyContent.querySelector<HTMLInputElement>('#img2pdf-file-input')!;
  const sizeSelect = modal.bodyContent.querySelector<HTMLSelectElement>('#img2pdf-pagesize-select')!;
  const fileListEl = modal.bodyContent.querySelector<HTMLElement>('#img2pdf-file-list')!;
  const convertBtn = modal.footerActions.querySelector<HTMLButtonElement>('#modal-convert-img2pdf-btn')!;
  const addToStudioBtn = modal.footerActions.querySelector<HTMLButtonElement>('#modal-add-to-studio-btn')!;

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

  modal.footerActions.querySelector('#modal-cancel-btn')?.addEventListener('click', () => modal.close());

  addToStudioBtn.addEventListener('click', async () => {
    if (selectedFiles.length === 0) return;
    try {
      addToStudioBtn.disabled = true;
      convertBtn.disabled = true;
      const pageSize = sizeSelect.value as 'A4' | 'fit';
      if (onAddToStudio) {
        await onAddToStudio(selectedFiles, pageSize);
      }
      modal.close();
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

      const outFilename =
        selectedFiles.length === 1
          ? `${selectedFiles[0]!.name.replace(/\.[^.]+$/, '')}.pdf`
          : 'images_converted.pdf';
      downloadBytes(bytes, outFilename);
      toast.show(`Created PDF with ${selectedFiles.length} images!`, 'success');
      modal.close();
    } catch (err: unknown) {
      progressOverlay.hide();
      const msg = err instanceof Error ? err.message : String(err);
      toast.show(`Image conversion failed: ${msg}`, 'error');
    }
  });
}
