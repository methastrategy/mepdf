import { escapeHtml } from '../../utils/file-utils';
import { t } from '../../core/i18n';
import type { ModalContext } from './ModalContext';

export function showConfirmModal(
  modal: ModalContext,
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

  modal.open(modalTitle, bodyHtml, footerHtml);

  modal.footerActions.querySelector('#confirm-modal-cancel-btn')?.addEventListener('click', () => modal.close());
  modal.footerActions.querySelector('#confirm-modal-ok-btn')?.addEventListener('click', () => {
    modal.close();
    onConfirm();
  });
}

export function showPasswordPromptModal(
  modal: ModalContext,
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

  modal.setOnClose(cancelAction);

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

  modal.open(title, bodyHtml, footerHtml);

  const pwdInput = modal.bodyContent.querySelector<HTMLInputElement>('#pdf-password-input')!;
  pwdInput.focus();

  const handleCancel = () => {
    cancelAction();
    modal.close();
  };

  const handleSubmit = async () => {
    if (isSubmitting || settled) return;
    const val = pwdInput.value;
    const errEl = modal.bodyContent.querySelector<HTMLElement>('#pdf-password-error');
    if (!val) {
      if (errEl) {
        errEl.textContent = 'Please enter a password';
        errEl.style.display = 'block';
      }
      return;
    }

    isSubmitting = true;
    const submitBtn = modal.footerActions.querySelector<HTMLButtonElement>('#modal-password-submit-btn');
    if (submitBtn) submitBtn.disabled = true;

    try {
      const res = await onSubmit(val);
      if (res === false) {
        throw new Error('Incorrect password');
      }
      settled = true;
      modal.setOnClose(null);
      modal.close();
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

  modal.footerActions.querySelector('#modal-password-cancel-btn')?.addEventListener('click', handleCancel);
  modal.footerActions.querySelector('#modal-password-submit-btn')?.addEventListener('click', handleSubmit);
  pwdInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      handleSubmit();
    }
  });
}
