import {
  createIcons,
  User,
  LogOut,
  FolderOpen,
  Sparkles,
  HardDrive,
  ChevronDown,
  Cloud,
} from 'lucide';
import { authService, FREE_STORAGE_LIMIT } from '../cloud/auth-service';
import { formatBytes } from '../utils/file-utils';
import { t } from '../core/i18n';
import { toast } from './Toast';
import { authModal } from './AuthModal';
import { setHashRoute } from '../core/router';

export interface UserAccountMenuOptions {
  onOpenCloudLibrary?: () => void;
  onOpenAuthModal?: () => void;
}

export class UserAccountMenu {
  private container: HTMLElement;
  private options: UserAccountMenuOptions;
  private isDropdownOpen = false;
  private unsubscribeAuth: (() => void) | null = null;

  constructor(container: HTMLElement, options: UserAccountMenuOptions = {}) {
    this.container = container;
    this.options = options;
    this.init();
  }

  private init(): void {
    this.render();

    this.unsubscribeAuth = authService.onAuthStateChange(() => {
      this.render();
    });

    // Handle outside clicks to close dropdown
    window.addEventListener('click', (e) => {
      if (!this.container.contains(e.target as Node)) {
        this.closeDropdown();
      }
    });

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isDropdownOpen) {
        this.closeDropdown();
      }
    });
  }

  destroy(): void {
    if (this.unsubscribeAuth) {
      this.unsubscribeAuth();
    }
  }

  private closeDropdown(): void {
    if (!this.isDropdownOpen) return;
    this.isDropdownOpen = false;
    const menuEl = this.container.querySelector<HTMLElement>('#account-dropdown-menu');
    if (menuEl) {
      menuEl.classList.remove('active');
    }
  }

  private toggleDropdown(): void {
    this.isDropdownOpen = !this.isDropdownOpen;
    const menuEl = this.container.querySelector<HTMLElement>('#account-dropdown-menu');
    if (menuEl) {
      menuEl.classList.toggle('active', this.isDropdownOpen);
    }
  }

  render(): void {
    const user = authService.getCurrentUser();

    if (!user) {
      // Unauthenticated state: Clean Sign In button
      this.container.innerHTML = `
        <button class="btn btn-secondary account-signin-btn" id="nav-auth-signin-btn" title="${t('accountSignInBtn')}">
          <i data-lucide="cloud" style="width: 15px; height: 15px; color: var(--primary);"></i>
          <span>${t('accountSignInBtn')}</span>
        </button>
      `;

      const signInBtn = this.container.querySelector('#nav-auth-signin-btn');
      signInBtn?.addEventListener('click', () => {
        if (this.options.onOpenAuthModal) {
          this.options.onOpenAuthModal();
        } else {
          authModal.open();
        }
      });
    } else {
      // Authenticated state: User avatar pill + tier tag + dropdown menu
      const initials = this.getInitials(user.fullName || user.email);
      const isPro = user.tier === 'pro' || user.tier === 'enterprise';
      const tierBadge = isPro ? t('accountTierPro') : t('accountTierFree');
      const tierClass = isPro ? 'tier-pro' : 'tier-free';

      const limit = user.storageLimitBytes || FREE_STORAGE_LIMIT;
      const used = user.storageUsedBytes || 0;
      const usedFormatted = formatBytes(used);
      const limitFormatted = formatBytes(limit);
      const usedPercent = Math.min(100, Math.round((used / limit) * 100));

      this.container.innerHTML = `
        <div class="account-menu-wrapper">
          <button class="account-trigger-btn" id="account-trigger-btn" aria-haspopup="true" aria-expanded="${this.isDropdownOpen}">
            <div class="account-avatar">
              ${
                user.avatarUrl
                  ? `<img src="${user.avatarUrl}" alt="Avatar" class="avatar-img" />`
                  : `<span class="avatar-initials">${initials}</span>`
              }
            </div>
            <span class="account-tier-pill ${tierClass}">${tierBadge}</span>
            <i data-lucide="chevron-down" style="width: 14px; height: 14px;" class="chevron-icon"></i>
          </button>

          <div class="account-dropdown-menu ${this.isDropdownOpen ? 'active' : ''}" id="account-dropdown-menu">
            <div class="dropdown-header">
              <div class="dropdown-user-info">
                <span class="dropdown-user-name">${user.fullName || user.email.split('@')[0]}</span>
                <span class="dropdown-user-email">${user.email}</span>
              </div>
              <span class="account-tier-pill ${tierClass}">${tierBadge}</span>
            </div>

            <div class="dropdown-storage-section">
              <div class="storage-info-row">
                <div class="storage-label">
                  <i data-lucide="hard-drive" style="width: 13px; height: 13px;"></i>
                  <span>Cloud Storage</span>
                </div>
                <span class="storage-value">${usedFormatted} / ${limitFormatted}</span>
              </div>
              <div class="storage-bar-track">
                <div class="storage-bar-fill ${usedPercent > 85 ? 'storage-warning' : ''}" style="width: ${usedPercent}%;"></div>
              </div>
            </div>

            <div class="dropdown-divider"></div>

            <div class="dropdown-actions">
              <button class="dropdown-item" id="account-cloud-lib-btn">
                <i data-lucide="folder-open" style="width: 16px; height: 16px;"></i>
                <span>${t('accountMyDocuments')}</span>
              </button>

              ${
                !isPro
                  ? `
                <button class="dropdown-item dropdown-item-upgrade" id="account-upgrade-btn">
                  <i data-lucide="sparkles" style="width: 16px; height: 16px; color: #f59e0b;"></i>
                  <span>${t('accountUpgradePro')}</span>
                </button>
              `
                  : `
                <div class="dropdown-item dropdown-item-pro-badge">
                  <i data-lucide="sparkles" style="width: 16px; height: 16px; color: var(--primary);"></i>
                  <span>${t('accountProActive')}</span>
                </div>
              `
              }

              <button class="dropdown-item dropdown-item-danger" id="account-signout-btn">
                <i data-lucide="log-out" style="width: 16px; height: 16px;"></i>
                <span>${t('authSignOutBtn')}</span>
              </button>
            </div>
          </div>
        </div>
      `;

      // Trigger button
      const triggerBtn = this.container.querySelector('#account-trigger-btn');
      triggerBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.toggleDropdown();
      });

      // Cloud Library Action
      const libBtn = this.container.querySelector('#account-cloud-lib-btn');
      libBtn?.addEventListener('click', () => {
        this.closeDropdown();
        setHashRoute('cloud-library');
        if (this.options.onOpenCloudLibrary) {
          this.options.onOpenCloudLibrary();
        }
      });

      // Upgrade Action
      const upgradeBtn = this.container.querySelector('#account-upgrade-btn');
      upgradeBtn?.addEventListener('click', async () => {
        this.closeDropdown();
        try {
          await authService.upgradeToPro();
          toast.show('Upgraded to Pro Plan (10 GB storage unlocked)!', 'success');
        } catch {
          toast.show('Upgrade simulation active.', 'info');
        }
      });

      // Sign Out Action
      const signOutBtn = this.container.querySelector('#account-signout-btn');
      signOutBtn?.addEventListener('click', async () => {
        this.closeDropdown();
        try {
          await authService.signOut();
          toast.show(t('authSignedOutToast'), 'info');
        } catch (err: any) {
          toast.show(err.message || 'Failed to sign out', 'error');
        }
      });
    }

    this.refreshIcons();
  }

  private getInitials(name: string): string {
    if (!name) return 'U';
    const parts = name.trim().split(/[\s._-]+/);
    const p0 = parts[0];
    const p1 = parts[1];
    if (p0 && p1 && p0.length > 0 && p1.length > 0) {
      return (p0[0]! + p1[0]!).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  }

  private refreshIcons(): void {
    createIcons({
      icons: {
        User,
        LogOut,
        FolderOpen,
        Sparkles,
        HardDrive,
        ChevronDown,
        Cloud,
      },
      nameAttr: 'data-lucide',
    });
  }
}
