import { escapeHtml, downloadBlob } from '../../utils/file-utils';
import { extractText } from '../../core/pdf-operations';
import { toast } from '../Toast';
import { progressOverlay } from '../ProgressOverlay';
import { t } from '../../core/i18n';
import type { ModalContext } from './ModalContext';

export async function showExtractTextModal(
  modal: ModalContext,
  fileBytes: Uint8Array,
  filename = 'document.pdf',
  password?: string
): Promise<void> {
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

    modal.open(title, bodyHtml, footerHtml);

    const textArea = modal.bodyContent.querySelector<HTMLTextAreaElement>('#extracted-text-area')!;
    const copyBtn = modal.footerActions.querySelector<HTMLButtonElement>('#modal-copy-text-btn')!;
    const dlBtn = modal.footerActions.querySelector<HTMLButtonElement>('#modal-download-text-btn')!;

    copyBtn.addEventListener('click', async () => {
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(textArea.value);
        } else {
          throw new Error('Clipboard API unavailable');
        }
      } catch {
        textArea.select();
        document.execCommand('copy');
      }
      copyBtn.innerHTML = `<i data-lucide="check" style="width: 16px; height: 16px; color: var(--success);"></i><span>${t('extractTextCopiedBtn')}</span>`;
      modal.refreshIcons();
      toast.show('Text copied to clipboard!', 'success');
      setTimeout(() => {
        copyBtn.innerHTML = `<i data-lucide="copy" style="width: 16px; height: 16px;"></i><span>${t('extractTextCopyBtn')}</span>`;
        modal.refreshIcons();
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
    modal.close();
    const msg = err instanceof Error ? err.message : String(err);
    toast.show(`Text extraction failed: ${msg}`, 'error');
  }
}
