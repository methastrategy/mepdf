import { downloadBytes } from '../../utils/file-utils';
import { pdfWorker } from '../../core/worker-client';
import { toast } from '../Toast';
import { progressOverlay } from '../ProgressOverlay';
import { t } from '../../core/i18n';
import type { ModalContext } from './ModalContext';

export function showProtectModal(
  modal: ModalContext,
  documentBytes: Uint8Array,
  filename = 'document.pdf',
  onSuccess?: () => void
): void {
  const title = `<i data-lucide="lock" style="width: 18px; height: 18px; color: var(--primary);"></i> ${t('protectModalTitle')}`;
  const baseName = filename.replace(/\.pdf$/i, '');

  const bodyHtml = `
    <div style="font-size: 0.875rem; color: var(--text-secondary); line-height: 1.5; margin-bottom: 1rem;">
      ${t('protectModalDesc')}
    </div>

    <div class="form-group" style="margin-bottom: 1rem;">
      <label class="form-label" for="protect-password-input">${t('protectPasswordLabel')}</label>
      <div style="position: relative; display: flex; align-items: center;">
        <input 
          type="password" 
          class="form-input" 
          id="protect-password-input" 
          placeholder="${t('protectPasswordPlaceholder')}" 
          style="padding-right: 2.75rem;" 
          autocomplete="new-password"
          autofocus 
        />
        <button 
          type="button" 
          class="btn btn-ghost btn-icon-only" 
          id="protect-toggle-pwd-btn" 
          title="${t('protectShowPassword')}" 
          style="position: absolute; right: 0.25rem; width: 34px; height: 34px;">
          <i data-lucide="eye" style="width: 16px; height: 16px;"></i>
        </button>
      </div>
    </div>

    <div class="form-group" style="margin-bottom: 1rem;">
      <label class="form-label" for="protect-password-confirm-input">${t('protectPasswordConfirmLabel')}</label>
      <input 
        type="password" 
        class="form-input" 
        id="protect-password-confirm-input" 
        placeholder="${t('protectPasswordConfirmPlaceholder')}" 
        autocomplete="new-password"
      />
      <div id="protect-password-error" style="color: var(--danger); font-size: 0.75rem; display: none; margin-top: 0.35rem;"></div>
    </div>

    <div style="display: flex; align-items: center; gap: 0.5rem; padding: 0.65rem 0.85rem; background: var(--surface-raised); border: 1px solid var(--border-subtle); border-radius: var(--radius-sm); font-size: 0.75rem; color: var(--text-muted);">
      <i data-lucide="shield-check" style="width: 16px; height: 16px; color: var(--success); flex-shrink: 0;"></i>
      <span>${t('dropzoneZeroUpload')}</span>
    </div>
  `;

  const footerHtml = `
    <button class="btn btn-secondary" id="modal-protect-cancel-btn">${t('clearModalCancel')}</button>
    <button class="btn btn-primary" id="modal-protect-submit-btn">
      <i data-lucide="lock" style="width: 15px; height: 15px;"></i>
      <span>${t('protectBtn')}</span>
    </button>
  `;

  modal.open(title, bodyHtml, footerHtml);

  const pwdInput = modal.bodyContent.querySelector<HTMLInputElement>('#protect-password-input')!;
  const confirmInput = modal.bodyContent.querySelector<HTMLInputElement>('#protect-password-confirm-input')!;
  const toggleBtn = modal.bodyContent.querySelector<HTMLButtonElement>('#protect-toggle-pwd-btn')!;
  const errorEl = modal.bodyContent.querySelector<HTMLElement>('#protect-password-error')!;
  const cancelBtn = modal.footerActions.querySelector<HTMLButtonElement>('#modal-protect-cancel-btn')!;
  const submitBtn = modal.footerActions.querySelector<HTMLButtonElement>('#modal-protect-submit-btn')!;

  let isPasswordVisible = false;
  toggleBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    isPasswordVisible = !isPasswordVisible;
    pwdInput.type = isPasswordVisible ? 'text' : 'password';
    confirmInput.type = isPasswordVisible ? 'text' : 'password';
    toggleBtn.innerHTML = isPasswordVisible 
      ? `<i data-lucide="eye-off" style="width: 16px; height: 16px;"></i>` 
      : `<i data-lucide="eye" style="width: 16px; height: 16px;"></i>`;
    modal.refreshIcons();
  });

  cancelBtn?.addEventListener('click', () => modal.close());

  const handleProtect = async () => {
    const pwd = pwdInput.value.trim();
    const confirmPwd = confirmInput.value.trim();

    if (pwd.length < 3) {
      errorEl.textContent = t('toastPasswordMinLength');
      errorEl.style.display = 'block';
      pwdInput.focus();
      return;
    }

    if (pwd !== confirmPwd) {
      errorEl.textContent = t('toastPasswordMismatch');
      errorEl.style.display = 'block';
      confirmInput.focus();
      return;
    }

    errorEl.style.display = 'none';
    submitBtn.disabled = true;

    try {
      progressOverlay.show('Encrypting and protecting PDF...');
      const protectedBytes = await pdfWorker.protectPdf(documentBytes, pwd);
      progressOverlay.hide();
      modal.close();

      downloadBytes(protectedBytes, `${baseName}_protected.pdf`);
      toast.show(t('toastProtectSuccess'), 'success');
      onSuccess?.();
    } catch (err: unknown) {
      progressOverlay.hide();
      submitBtn.disabled = false;
      const msg = err instanceof Error ? err.message : String(err);
      toast.show(`Encryption failed: ${msg}`, 'error');
    }
  };

  submitBtn?.addEventListener('click', handleProtect);

  const keyListener = (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleProtect();
    }
  };
  pwdInput.addEventListener('keydown', keyListener);
  confirmInput.addEventListener('keydown', keyListener);
}
