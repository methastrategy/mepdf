import { downloadBytes } from '../../utils/file-utils';
import { pdfWorker } from '../../core/worker-client';
import { toast } from '../Toast';
import { progressOverlay } from '../ProgressOverlay';
import type { PageNumberOptions, PageNumberPosition, PageNumberFormat } from '../../core/types';
import { t } from '../../core/i18n';
import type { ModalContext } from './ModalContext';

export function showPageNumberModal(
  modal: ModalContext,
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

  modal.open(title, bodyHtml, footerHtml);

  const formatSelect = modal.bodyContent.querySelector<HTMLSelectElement>('#num-format-select')!;
  const customGroup = modal.bodyContent.querySelector<HTMLElement>('#num-custom-template-group')!;
  const customInput = modal.bodyContent.querySelector<HTMLInputElement>('#num-custom-template-input')!;
  const positionSelect = modal.bodyContent.querySelector<HTMLSelectElement>('#num-position-select')!;
  const sizeSelect = modal.bodyContent.querySelector<HTMLSelectElement>('#num-size-select')!;
  const marginSelect = modal.bodyContent.querySelector<HTMLSelectElement>('#num-margin-select')!;
  const skipCoverCheckbox = modal.bodyContent.querySelector<HTMLInputElement>('#num-skip-cover-checkbox')!;
  const cancelBtn = modal.footerActions.querySelector<HTMLButtonElement>('#modal-numbering-cancel-btn')!;
  const submitBtn = modal.footerActions.querySelector<HTMLButtonElement>('#modal-numbering-submit-btn')!;

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

  cancelBtn.addEventListener('click', () => modal.close());

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

      const numberedBytes = await pdfWorker.pageNumbers(documentBytes, options, (info) => {
        progressOverlay.update(info);
      });

      progressOverlay.hide();
      modal.close();

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
