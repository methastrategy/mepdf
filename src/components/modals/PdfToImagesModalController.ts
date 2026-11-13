import { downloadBlob } from '../../utils/file-utils';
import { pdfToImages, createImagesZip } from '../../core/pdf-operations';
import { toast } from '../Toast';
import { progressOverlay } from '../ProgressOverlay';
import { t } from '../../core/i18n';
import type { ModalContext } from './ModalContext';

export function showPdfToImagesModal(
  modal: ModalContext,
  documentBytes: Uint8Array,
  filename = 'document.pdf',
  password?: string
): void {
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

  modal.open(title, bodyHtml, footerHtml);

  modal.footerActions.querySelector('#modal-cancel-btn')?.addEventListener('click', () => modal.close());

  const exportBtn = modal.footerActions.querySelector<HTMLButtonElement>('#modal-export-images-btn')!;
  exportBtn.addEventListener('click', async () => {
    try {
      const dpiSelect = modal.bodyContent.querySelector<HTMLSelectElement>('#pdf2img-dpi-select')!;
      const formatSelect = modal.bodyContent.querySelector<HTMLSelectElement>('#pdf2img-format-select')!;

      const dpi = parseInt(dpiSelect.value, 10);
      const format = formatSelect.value as 'png' | 'jpeg';

      progressOverlay.show('Rendering pages to images...');
      const images = await pdfToImages(
        documentBytes,
        dpi,
        format,
        (info) => {
          progressOverlay.update(info);
        },
        password
      );

      progressOverlay.show('Packaging ZIP file...');
      const zipBlob = await createImagesZip(images, (info) => {
        progressOverlay.update(info);
      });
      progressOverlay.hide();

      const zipName = filename.replace(/\.pdf$/i, '') + '_images.zip';
      downloadBlob(zipBlob, zipName);
      toast.show(`Exported ${images.length} images to ${zipName}!`, 'success');
      modal.close();
    } catch (err: unknown) {
      progressOverlay.hide();
      const msg = err instanceof Error ? err.message : String(err);
      toast.show(`Export failed: ${msg}`, 'error');
    }
  });
}
