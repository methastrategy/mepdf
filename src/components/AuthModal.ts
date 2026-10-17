import { createIcons, X, Mail, Lock, User, ArrowRight, Sparkles, CheckCircle2, AlertCircle } from 'lucide';
import { authService, type UserProfile } from '../cloud/auth-service';
import { t } from '../core/i18n';
import { toast } from './Toast';

export class AuthModal {
  private overlay: HTMLElement | null = null;
  private currentTab: 'signin' | 'signup' = 'signin';
  private onSuccessCallback: ((user: UserProfile) => void) | null = null;
  private onCloseCallback: (() => void) | null = null;
  private previousActiveElement: HTMLElement | null = null;

  constructor() {
    this.createDom();
  }

  private createDom(): void {
    if (typeof document === 'undefined') return;
    let el = document.querySelector<HTMLElement>('#auth-modal-overlay');
    if (!el) {
      el = document.createElement('div');
      el.id = 'auth-modal-overlay';
      el.className = 'modal-overlay auth-modal-overlay';
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

  open(options?: {
    tab?: 'signin' | 'signup';
    onSuccess?: (user: UserProfile) => void;
    onClose?: () => void;
  }): void {
    if (!this.overlay) this.createDom();
    if (!this.overlay) return;

    this.previousActiveElement = (typeof document !== 'undefined' ? document.activeElement : null) as HTMLElement | null;
    this.currentTab = options?.tab || 'signin';
    this.onSuccessCallback = options?.onSuccess || null;
    this.onCloseCallback = options?.onClose || null;

    this.render();
    this.overlay.classList.add('active');

    // Focus first input
    if (typeof requestAnimationFrame !== 'undefined') {
      requestAnimationFrame(() => {
        const firstInput = this.overlay?.querySelector<HTMLInputElement>('#auth-email-input');
        firstInput?.focus();
      });
    }
  }

  close(): void {
    if (!this.overlay) return;
    this.overlay.classList.remove('active');
    if (this.onCloseCallback) {
      this.onCloseCallback();
    }
    if (this.previousActiveElement) {
      this.previousActiveElement.focus();
    }
  }

  private render(): void {
    if (!this.overlay) return;

    const isSignIn = this.currentTab === 'signin';
    const title = isSignIn ? t('authModalTitleSignIn') : t('authModalTitleSignUp');

    this.overlay.innerHTML = `
      <div class="modal-card auth-modal-card" role="dialog" aria-modal="true" aria-labelledby="auth-modal-title">
        <div class="modal-header auth-modal-header">
          <div class="auth-header-title-wrap">
            <h3 class="modal-title auth-title" id="auth-modal-title">${title}</h3>
            <p class="auth-subtitle">${t('authSignInPrompt')}</p>
          </div>
          <button class="btn btn-ghost btn-icon-only" id="auth-close-btn" title="Close" aria-label="Close modal">
            <i data-lucide="x" style="width: 18px; height: 18px;"></i>
          </button>
        </div>

        <div class="auth-tabs-nav">
          <button class="auth-tab-btn ${isSignIn ? 'active' : ''}" id="auth-tab-signin">
            ${t('authTabSignIn')}
          </button>
          <button class="auth-tab-btn ${!isSignIn ? 'active' : ''}" id="auth-tab-signup">
            ${t('authTabSignUp')}
          </button>
        </div>

        <div class="modal-body auth-modal-body">
          <div id="auth-alert-box" class="auth-alert" style="display: none;"></div>

          <!-- Google Social Sign In -->
          <button class="btn btn-google" id="auth-google-btn">
            <svg class="google-icon" viewBox="0 0 24 24" width="18" height="18">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
            </svg>
            <span>${t('authGoogleBtn')}</span>
          </button>

          <div class="auth-divider">
            <span>${t('authOrDivider')}</span>
          </div>

          <!-- Email & Password Form -->
          <form id="auth-main-form" class="auth-form" onsubmit="return false;">
            ${
              !isSignIn
                ? `
              <div class="form-group">
                <label for="auth-name-input" class="form-label">${t('authFullNameLabel')}</label>
                <div class="input-icon-wrap">
                  <i data-lucide="user" style="width: 16px; height: 16px;"></i>
                  <input
                    type="text"
                    id="auth-name-input"
                    class="form-input"
                    placeholder="${t('authFullNamePlaceholder')}"
                    autocomplete="name"
                  />
                </div>
              </div>
            `
                : ''
            }

            <div class="form-group">
              <label for="auth-email-input" class="form-label">Email</label>
              <div class="input-icon-wrap">
                <i data-lucide="mail" style="width: 16px; height: 16px;"></i>
                <input
                  type="email"
                  id="auth-email-input"
                  class="form-input"
                  placeholder="${t('authEmailPlaceholder')}"
                  required
                  autocomplete="email"
                />
              </div>
            </div>

            <div class="form-group">
              <label for="auth-password-input" class="form-label">${t('authPasswordLabel')}</label>
              <div class="input-icon-wrap">
                <i data-lucide="lock" style="width: 16px; height: 16px;"></i>
                <input
                  type="password"
                  id="auth-password-input"
                  class="form-input"
                  placeholder="${t('authPasswordPlaceholder')}"
                  required
                  minlength="6"
                  autocomplete="${isSignIn ? 'current-password' : 'new-password'}"
                />
              </div>
            </div>

            <div class="auth-actions-group">
              <button type="submit" class="btn btn-primary auth-submit-btn" id="auth-submit-btn">
                <span>${isSignIn ? t('authSignInBtn') : t('authSignUpBtn')}</span>
                <i data-lucide="arrow-right" style="width: 16px; height: 16px;"></i>
              </button>
            </div>
          </form>

          <!-- Passwordless Magic Link Alternative -->
          <div class="auth-magic-box">
            <div class="magic-box-header">
              <i data-lucide="sparkles" style="width: 15px; height: 15px; color: var(--primary);"></i>
              <span class="magic-box-title">Magic Link (Passwordless)</span>
            </div>
            <p class="magic-box-desc">${t('authMagicLinkDesc')}</p>
            <button type="button" class="btn btn-secondary magic-link-btn" id="auth-magic-btn">
              <i data-lucide="mail" style="width: 14px; height: 14px;"></i>
              <span>${t('authSendMagicLinkBtn')}</span>
            </button>
          </div>
        </div>

        <div class="modal-footer auth-modal-footer">
          <button class="btn-link" id="auth-toggle-mode-btn">
            ${isSignIn ? t('authNeedAccount') : t('authAlreadyAccount')}
          </button>
        </div>
      </div>
    `;

    this.bindEvents();
    this.refreshIcons();
  }

  private refreshIcons(): void {
    createIcons({
      icons: {
        X,
        Mail,
        Lock,
        User,
        ArrowRight,
        Sparkles,
        CheckCircle2,
        AlertCircle,
      },
      nameAttr: 'data-lucide',
    });
  }

  private bindEvents(): void {
    if (!this.overlay) return;

    // Close button
    const closeBtn = this.overlay.querySelector('#auth-close-btn');
    closeBtn?.addEventListener('click', () => this.close());

    // Tab buttons
    const signinTab = this.overlay.querySelector('#auth-tab-signin');
    const signupTab = this.overlay.querySelector('#auth-tab-signup');
    signinTab?.addEventListener('click', () => {
      this.currentTab = 'signin';
      this.render();
    });
    signupTab?.addEventListener('click', () => {
      this.currentTab = 'signup';
      this.render();
    });

    // Toggle button in footer
    const toggleBtn = this.overlay.querySelector('#auth-toggle-mode-btn');
    toggleBtn?.addEventListener('click', () => {
      this.currentTab = this.currentTab === 'signin' ? 'signup' : 'signin';
      this.render();
    });

    // Google Sign In
    const googleBtn = this.overlay.querySelector('#auth-google-btn');
    googleBtn?.addEventListener('click', async () => {
      try {
        await authService.signInWithGoogle();
        const user = authService.getCurrentUser();
        if (user) {
          toast.show(t('authSignedInToast', { name: user.fullName || user.email }), 'success');
          if (this.onSuccessCallback) this.onSuccessCallback(user);
        }
        this.close();
      } catch (err: any) {
        this.showAlert(err.message || t('authErrorGeneric'), 'error');
      }
    });

    // Magic Link
    const magicBtn = this.overlay.querySelector('#auth-magic-btn');
    magicBtn?.addEventListener('click', async () => {
      const emailInput = this.overlay?.querySelector<HTMLInputElement>('#auth-email-input');
      const email = emailInput?.value.trim();
      if (!email || !email.includes('@')) {
        this.showAlert('Please enter a valid email address first.', 'error');
        emailInput?.focus();
        return;
      }

      try {
        await authService.signInWithMagicLink(email);
        toast.show(t('authMagicLinkSent'), 'success');
        this.showAlert(t('authMagicLinkSent'), 'success');
        const user = authService.getCurrentUser();
        if (user && this.onSuccessCallback) {
          this.onSuccessCallback(user);
        }
      } catch (err: any) {
        this.showAlert(err.message || t('authErrorGeneric'), 'error');
      }
    });

    // Main Form Submit (Email + Password)
    const form = this.overlay.querySelector('#auth-main-form');
    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const emailInput = this.overlay?.querySelector<HTMLInputElement>('#auth-email-input');
      const passwordInput = this.overlay?.querySelector<HTMLInputElement>('#auth-password-input');
      const nameInput = this.overlay?.querySelector<HTMLInputElement>('#auth-name-input');

      const email = emailInput?.value.trim() || '';
      const password = passwordInput?.value || '';
      const fullName = nameInput?.value.trim();

      if (!email || !password) {
        this.showAlert('Please fill in both email and password.', 'error');
        return;
      }

      const submitBtn = this.overlay?.querySelector<HTMLButtonElement>('#auth-submit-btn');
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.style.opacity = '0.7';
      }

      try {
        if (this.currentTab === 'signin') {
          await authService.signInWithPassword(email, password);
          const user = authService.getCurrentUser();
          toast.show(t('authSignedInToast', { name: user?.fullName || email }), 'success');
          if (user && this.onSuccessCallback) this.onSuccessCallback(user);
        } else {
          await authService.signUp(email, password, fullName);
          const user = authService.getCurrentUser();
          toast.show(t('authRegisteredToast'), 'success');
          if (user && this.onSuccessCallback) this.onSuccessCallback(user);
        }
        this.close();
      } catch (err: any) {
        this.showAlert(err.message || t('authErrorGeneric'), 'error');
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.style.opacity = '1';
        }
      }
    });
  }

  private showAlert(message: string, type: 'error' | 'success'): void {
    const alertBox = this.overlay?.querySelector<HTMLElement>('#auth-alert-box');
    if (!alertBox) return;

    alertBox.className = `auth-alert auth-alert-${type}`;
    alertBox.innerHTML = `
      <i data-lucide="${type === 'error' ? 'alert-circle' : 'check-circle-2'}" style="width: 16px; height: 16px;"></i>
      <span>${message}</span>
    `;
    alertBox.style.display = 'flex';
    this.refreshIcons();
  }
}

export const authModal = new AuthModal();
