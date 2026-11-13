import JSZip from 'jszip';
import { downloadBytes, downloadBlob } from '../../utils/file-utils';
import { pdfWorker } from '../../core/worker-client';
import { toast } from '../Toast';
import { progressOverlay } from '../ProgressOverlay';
import type { PDFPageItem, DocumentMetadata } from '../../core/types';
import { t } from '../../core/i18n';
import type { ModalContext } from './ModalContext';

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

export function showSplitModal(
  modal: ModalContext,
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

  modal.open(title, bodyHtml, footerHtml);

  const modeSelect = modal.bodyContent.querySelector<HTMLSelectElement>('#split-mode-select')!;
  const rangeGroup = modal.bodyContent.querySelector<HTMLElement>('#split-range-group')!;
  const rangeInput = modal.bodyContent.querySelector<HTMLInputElement>('#split-range-input')!;

  const updateVisibility = () => {
    rangeGroup.style.display = modeSelect.value === 'ranges' ? 'flex' : 'none';
  };
  modeSelect.addEventListener('change', updateVisibility);
  updateVisibility();

  modal.footerActions.querySelector('#modal-cancel-btn')?.addEventListener('click', () => modal.close());

  modal.footerActions.querySelector('#modal-execute-split-btn')?.addEventListener('click', async () => {
    try {
      progressOverlay.show('Splitting pages...');
      const mode = modeSelect.value;

      if (mode === 'selected') {
        const selectedPages = pages.filter((p) => p.selected);
        if (selectedPages.length === 0) {
          progressOverlay.hide();
          toast.show('No pages selected to split.', 'info');
          return;
        }
        const bytes = await pdfWorker.mergePages(selectedPages, documentMap, (info) => progressOverlay.update(info));
        progressOverlay.hide();
        downloadBytes(bytes, `${baseFilename}_selected.pdf`);
        toast.show(`Exported ${selectedPages.length} selected pages!`, 'success');
        modal.close();
      } else if (mode === 'each') {
        const results = await pdfWorker.splitPagesByRanges(pages, documentMap, '', baseFilename, (info) => {
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
        modal.close();
      } else {
        const rangeStr = rangeInput.value.trim();
        const results = await pdfWorker.splitPagesByRanges(pages, documentMap, rangeStr, baseFilename, (info) => {
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
        modal.close();
      }
    } catch (err: unknown) {
      progressOverlay.hide();
      const msg = err instanceof Error ? err.message : String(err);
      toast.show(`Split failed: ${msg}`, 'error');
    }
  });
}
