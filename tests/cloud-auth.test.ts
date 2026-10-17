import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { supabase, isMockSupabase, setMockClientForTesting, MockSupabaseClient, MockQueryBuilder } from '../src/cloud/supabase-client';
import { authService, FREE_STORAGE_LIMIT, PRO_STORAGE_LIMIT, type UserProfile } from '../src/cloud/auth-service';
import { storageService, StorageQuotaError } from '../src/cloud/storage-service';
import { documentService, type CloudDocument } from '../src/cloud/document-service';
import { t, setLanguage } from '../src/core/i18n';
import { HASH_TO_ROUTE_MAP, ROUTE_TO_HASH_MAP } from '../src/core/router';
import { AuthModal } from '../src/components/AuthModal';
import { UserAccountMenu } from '../src/components/UserAccountMenu';

vi.mock('lucide', async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    createIcons: vi.fn(),
  };
});

describe('Phase 2B - Cloud & Auth Service Layer', () => {
  let originalDocument: any;
  let originalWindow: any;

  beforeEach(() => {
    originalDocument = (globalThis as any).document;
    originalWindow = (globalThis as any).window;

    setupMockDOM();
    MockQueryBuilder.clearStore();
    setMockClientForTesting(new MockSupabaseClient());
    authService.setTestUser(null);
    setLanguage('en');
  });

  afterEach(() => {
    (globalThis as any).document = originalDocument;
    (globalThis as any).window = originalWindow;
    vi.restoreAllMocks();
  });

  describe('1. Supabase Client Mock / Offline Fallback', () => {
    it('initializes in mock mode when credentials are not configured', () => {
      expect(isMockSupabase()).toBe(true);
      expect(supabase).toBeDefined();
      expect(supabase.auth).toBeDefined();
      expect(supabase.storage).toBeDefined();
    });

    it('performs CRUD operations seamlessly via MockQueryBuilder', async () => {
      // Insert
      const { data: inserted } = await supabase.from('test_table').insert({ name: 'Document A', value: 100 });
      expect(inserted).toBeDefined();
      expect(inserted.name).toBe('Document A');
      expect(inserted.id).toBeDefined();

      // Select
      const { data: list } = await supabase.from('test_table').select().eq('name', 'Document A');
      expect(Array.isArray(list)).toBe(true);
      expect(list.length).toBeGreaterThan(0);
      expect(list[0].name).toBe('Document A');

      // Update
      const { data: updated } = await supabase.from('test_table').update({ value: 200 }).eq('name', 'Document A');
      expect(updated).toBeDefined();

      // Single
      const { data: singleItem } = await supabase.from('test_table').select().eq('name', 'Document A').single();
      expect(singleItem).toBeDefined();
      expect(singleItem.value).toBe(200);

      // Delete
      await supabase.from('test_table').delete().eq('name', 'Document A');
      const { data: afterDelete } = await supabase.from('test_table').select().eq('name', 'Document A');
      expect(afterDelete.length).toBe(0);
    });

    it('performs storage upload, signed URL, and download in mock adapter', async () => {
      const bucket = supabase.storage.from('documents');
      const mockBytes = new Uint8Array([1, 2, 3, 4, 5]);

      const { data: uploadResult } = await bucket.upload('user_1/sample.pdf', mockBytes);
      expect(uploadResult?.path).toBe('user_1/sample.pdf');

      const { data: downloadResult } = await bucket.download('user_1/sample.pdf');
      expect(downloadResult).toBeDefined();
      const downloadedBytes = new Uint8Array(await downloadResult!.arrayBuffer());
      expect(downloadedBytes.length).toBe(5);
      expect(downloadedBytes[0]).toBe(1);

      const signed = (bucket as any).createSignedUrl('user_1/sample.pdf', 3600);
      expect(signed?.data?.signedUrl).toBeDefined();

      await bucket.remove(['user_1/sample.pdf']);
    });
  });

  describe('2. Auth Service & Profile Management', () => {
    it('manages authentication state transitions and listener notifications', async () => {
      let notifiedUser: UserProfile | null = null;
      const unsubscribe = authService.onAuthStateChange((user) => {
        notifiedUser = user;
      });

      expect(authService.isAuthenticated()).toBe(false);
      expect(authService.getCurrentUser()).toBeNull();

      // Sign in with Google (mock)
      await authService.signInWithGoogle();
      expect(authService.isAuthenticated()).toBe(true);
      expect(authService.getCurrentUser()).not.toBeNull();
      expect(authService.getCurrentUser()?.email).toContain('@');
      expect(notifiedUser).toBe(authService.getCurrentUser());

      // Sign out
      await authService.signOut();
      expect(authService.isAuthenticated()).toBe(false);
      expect(authService.getCurrentUser()).toBeNull();
      expect(notifiedUser).toBeNull();

      unsubscribe();
    });

    it('supports Magic Link and Password sign in flows', async () => {
      // Magic Link
      await authService.signInWithMagicLink('magic@mepdf.app');
      expect(authService.isAuthenticated()).toBe(true);
      expect(authService.getCurrentUser()?.email).toBe('magic@mepdf.app');
      expect(authService.getCurrentUser()?.tier).toBe('free');
      expect(authService.getCurrentUser()?.storageLimitBytes).toBe(FREE_STORAGE_LIMIT);

      await authService.signOut();

      // Password Sign In
      await authService.signInWithPassword('pro@mepdf.app', 'secret123');
      expect(authService.isAuthenticated()).toBe(true);
      expect(authService.getCurrentUser()?.email).toBe('pro@mepdf.app');

      await authService.signOut();
    });

    it('upgrades user tier to Pro and expands storage limit to 10 GB', async () => {
      await authService.signInWithGoogle();
      const user = authService.getCurrentUser()!;
      expect(user.tier).toBe('free');
      expect(user.storageLimitBytes).toBe(FREE_STORAGE_LIMIT);

      await authService.upgradeToPro();
      const upgraded = authService.getCurrentUser()!;
      expect(upgraded.tier).toBe('pro');
      expect(upgraded.storageLimitBytes).toBe(PRO_STORAGE_LIMIT);
    });

    it('updates user storage usage correctly with delta increments and decrements', async () => {
      await authService.signInWithGoogle();
      expect(authService.getCurrentUser()?.storageUsedBytes).toBe(0);

      await authService.updateStorageUsage(5 * 1024 * 1024); // +5 MB
      expect(authService.getCurrentUser()?.storageUsedBytes).toBe(5 * 1024 * 1024);

      await authService.updateStorageUsage(-2 * 1024 * 1024); // -2 MB
      expect(authService.getCurrentUser()?.storageUsedBytes).toBe(3 * 1024 * 1024);

      // Does not drop below zero
      await authService.updateStorageUsage(-10 * 1024 * 1024);
      expect(authService.getCurrentUser()?.storageUsedBytes).toBe(0);
    });
  });

  describe('3. Cloud Storage Service & Quota Enforcement', () => {
    it('evaluates quota availability correctly for Free and Pro tiers', async () => {
      // Unauthenticated defaults to free limit
      authService.setTestUser(null);
      const unauthCheck = storageService.checkQuota(50 * 1024 * 1024);
      expect(unauthCheck.allowed).toBe(true);
      expect(unauthCheck.limitBytes).toBe(FREE_STORAGE_LIMIT);

      // Authenticated Free User with 90 MB used
      authService.setTestUser({
        id: 'test_free_user',
        email: 'test@mepdf.app',
        tier: 'free',
        storageUsedBytes: 90 * 1024 * 1024,
        storageLimitBytes: FREE_STORAGE_LIMIT, // 100 MB
        createdAt: new Date().toISOString(),
      });

      const fitsCheck = storageService.checkQuota(5 * 1024 * 1024); // 90 + 5 = 95 MB <= 100 MB
      expect(fitsCheck.allowed).toBe(true);
      expect(fitsCheck.remainingBytes).toBe(10 * 1024 * 1024);

      const exceedsCheck = storageService.checkQuota(15 * 1024 * 1024); // 90 + 15 = 105 MB > 100 MB
      expect(exceedsCheck.allowed).toBe(false);
    });

    it('throws StorageQuotaError when uploading file exceeding quota', async () => {
      authService.setTestUser({
        id: 'test_free_user',
        email: 'test@mepdf.app',
        tier: 'free',
        storageUsedBytes: 99 * 1024 * 1024,
        storageLimitBytes: FREE_STORAGE_LIMIT,
        createdAt: new Date().toISOString(),
      });

      const oversizedFile = new Uint8Array(5 * 1024 * 1024); // 5 MB > 1 MB remaining

      await expect(
        storageService.uploadPdf(oversizedFile, 'huge.pdf', 'test_free_user')
      ).rejects.toThrow(StorageQuotaError);
    });

    it('successfully uploads, downloads, and removes cloud PDFs', async () => {
      authService.setTestUser({
        id: 'user_active',
        email: 'active@mepdf.app',
        tier: 'free',
        storageUsedBytes: 0,
        storageLimitBytes: FREE_STORAGE_LIMIT,
        createdAt: new Date().toISOString(),
      });

      const samplePdf = new Uint8Array([37, 80, 68, 70, 45, 49, 46, 55, 10]); // %PDF-1.7
      const upload = await storageService.uploadPdf(samplePdf, 'test_contract.pdf', 'user_active');

      expect(upload.storageKey).toContain('user_active');
      expect(upload.storageKey).toContain('test_contract.pdf');
      expect(authService.getCurrentUser()?.storageUsedBytes).toBe(samplePdf.length);

      // Download
      const downloaded = await storageService.downloadPdf(upload.storageKey);
      expect(downloaded.length).toBe(samplePdf.length);

      // Delete
      await storageService.deletePdf(upload.storageKey, samplePdf.length);
      expect(authService.getCurrentUser()?.storageUsedBytes).toBe(0);
    });
  });

  describe('4. Cloud Document Service (Metadata & TTL)', () => {
    it('saves cloud document and retrieves it with user isolation', async () => {
      authService.setTestUser({
        id: 'user_bob',
        email: 'bob@mepdf.app',
        tier: 'free',
        storageUsedBytes: 0,
        storageLimitBytes: FREE_STORAGE_LIMIT,
        createdAt: new Date().toISOString(),
      });

      const fakePdf = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
      const saved = await documentService.saveDocument({
        filename: 'Report_2026.pdf',
        fileBytes: fakePdf,
        pageCount: 3,
        thumbnailDataUrl: 'data:image/png;base64,sample',
        isPinned: false,
      });

      expect(saved.id).toBeDefined();
      expect(saved.filename).toBe('Report_2026.pdf');
      expect(saved.pageCount).toBe(3);
      expect(saved.isPinned).toBe(false);
      expect(saved.expiresAt).not.toBeNull();

      const userDocs = await documentService.fetchUserDocuments('user_bob');
      expect(userDocs.some((d) => d.id === saved.id)).toBe(true);
    });

    it('toggles pin status and manages 30-day auto-expiry TTL', async () => {
      authService.setTestUser({
        id: 'user_alice',
        email: 'alice@mepdf.app',
        tier: 'free',
        storageUsedBytes: 0,
        storageLimitBytes: FREE_STORAGE_LIMIT,
        createdAt: new Date().toISOString(),
      });

      const fakePdf = new Uint8Array([1, 2, 3]);
      const saved = await documentService.saveDocument({
        filename: 'Passport.pdf',
        fileBytes: fakePdf,
        pageCount: 1,
        isPinned: false,
      });

      expect(saved.isPinned).toBe(false);
      expect(documentService.getDaysUntilExpiration(saved)).toBeGreaterThanOrEqual(29);

      // Toggle pin on
      const pinned = await documentService.togglePin(saved.id);
      expect(pinned.isPinned).toBe(true);
      expect(pinned.expiresAt).toBeNull();
      expect(documentService.getDaysUntilExpiration(pinned)).toBeNull();

      // Toggle pin off
      const unpinned = await documentService.togglePin(saved.id);
      expect(unpinned.isPinned).toBe(false);
      expect(unpinned.expiresAt).not.toBeNull();
    });

    it('cleans up expired unpinned documents automatically', async () => {
      authService.setTestUser({
        id: 'user_cleanup',
        email: 'cleanup@mepdf.app',
        tier: 'free',
        storageUsedBytes: 0,
        storageLimitBytes: FREE_STORAGE_LIMIT,
        createdAt: new Date().toISOString(),
      });

      const fakePdf = new Uint8Array([1, 2, 3]);
      const saved = await documentService.saveDocument({
        filename: 'Old_Invoice.pdf',
        fileBytes: fakePdf,
        pageCount: 1,
        isPinned: false,
      });

      // Force past expiration date
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 2);
      await supabase
        .from('documents')
        .update({ expires_at: pastDate.toISOString() })
        .eq('id', saved.id);

      const purged = await documentService.cleanupExpiredDocuments();
      expect(purged).toBe(1);

      const remainingDocs = await documentService.fetchUserDocuments('user_cleanup');
      expect(remainingDocs.find((d) => d.id === saved.id)).toBeUndefined();
    });
  });

  describe('5. Router and Internationalization Integrations', () => {
    it('supports #/account and #/cloud-library hash routes', () => {
      expect(HASH_TO_ROUTE_MAP['#/account']).toBe('account');
      expect(HASH_TO_ROUTE_MAP['#/auth']).toBe('account');
      expect(HASH_TO_ROUTE_MAP['#/cloud-library']).toBe('cloud-library');
      expect(HASH_TO_ROUTE_MAP['#/library']).toBe('cloud-library');

      expect(ROUTE_TO_HASH_MAP['account']).toBe('#/account');
      expect(ROUTE_TO_HASH_MAP['cloud-library']).toBe('#/cloud-library');
    });

    it('provides complete Thai and English translations for Phase 2B keys', () => {
      setLanguage('en');
      expect(t('authModalTitleSignIn')).toBe('Sign In to mePDF');
      expect(t('authGoogleBtn')).toBe('Continue with Google');
      expect(t('accountTierFree')).toBe('FREE');
      expect(t('accountTierPro')).toBe('PRO');
      expect(t('cloudLibTitle')).toBe('Cloud Document Library');
      expect(t('saveCloudBtnToolbar')).toBe('Save to Cloud');

      setLanguage('th');
      expect(t('authModalTitleSignIn')).toBe('เข้าสู่ระบบ mePDF');
      expect(t('authGoogleBtn')).toBe('เข้าสู่ระบบด้วย Google');
      expect(t('accountTierFree')).toBe('FREE');
      expect(t('accountTierPro')).toBe('PRO');
      expect(t('cloudLibTitle')).toBe('คลังเอกสารบนคลาวด์');
      expect(t('saveCloudBtnToolbar')).toBe('บันทึกลงคลาวด์');
    });
  });

  describe('6. UI Component Lifecycle', () => {
    it('mounts AuthModal and toggles between Sign In and Sign Up tabs', () => {
      const modal = new AuthModal();
      expect(modal.isOpen()).toBe(false);

      modal.open({ tab: 'signin' });
      expect(modal.isOpen()).toBe(true);

      modal.close();
      expect(modal.isOpen()).toBe(false);
    });

    it('renders UserAccountMenu in unauthenticated and authenticated states', () => {
      const container = (globalThis as any).document.createElement('div');
      (globalThis as any).document.body.appendChild(container);

      // Unauthenticated
      authService.setTestUser(null);
      const menu = new UserAccountMenu(container);
      expect(container.querySelector('#nav-auth-signin-btn')).not.toBeNull();

      // Authenticated
      authService.setTestUser({
        id: 'user_uam',
        email: 'uam@mepdf.app',
        fullName: 'Jane Doe',
        tier: 'free',
        storageUsedBytes: 15 * 1024 * 1024,
        storageLimitBytes: FREE_STORAGE_LIMIT,
        createdAt: new Date().toISOString(),
      });

      menu.render();
      expect(container.querySelector('#account-trigger-btn')).not.toBeNull();
      expect(container.querySelector('.avatar-initials')?.textContent).toBe('JD');
      expect(container.querySelector('.account-tier-pill')?.textContent).toBe('FREE');

      menu.destroy();
    });
  });
});

function setupMockDOM() {
  const elements = new Map<string, any>();

  const createMockElement = (tag: string, id?: string) => {
    const classListSet = new Set<string>();
    const el: any = {
      tagName: tag.toUpperCase(),
      id: id || '',
      className: '',
      classList: {
        add: (cls: string) => classListSet.add(cls),
        remove: (cls: string) => classListSet.delete(cls),
        contains: (cls: string) => classListSet.has(cls),
        toggle: (cls: string, force?: boolean) => {
          if (force !== undefined) {
            if (force) classListSet.add(cls);
            else classListSet.delete(cls);
          } else {
            if (classListSet.has(cls)) classListSet.delete(cls);
            else classListSet.add(cls);
          }
        },
      },
      style: {},
      _innerHTML: '',
      get innerHTML() {
        return this._innerHTML;
      },
      set innerHTML(val: string) {
        this._innerHTML = val;
        // Parse simple IDs into children/elements map for lookup
        const idMatches = val.matchAll(/id=["']([^"']+)["']/g);
        for (const m of idMatches) {
          const matchedId = m[1];
          if (matchedId && !elements.has(`#${matchedId}`)) {
            const childEl = createMockElement('div', matchedId);
            if (val.includes(`id="${matchedId}">`)) {
              const textMatch = val.match(new RegExp(`id=["']${matchedId}["'][^>]*>([^<]*)<`));
              if (textMatch) childEl.textContent = textMatch[1] || '';
            }
            this.appendChild(childEl);
          }
        }
        const classMatches = val.matchAll(/class=["']([^"']+)["']/g);
        for (const cm of classMatches) {
          const classStr = cm[1];
          if (classStr) {
            classStr.split(/\s+/).forEach((cls) => {
              if (cls && !elements.has(`.${cls}`)) {
                const childEl = createMockElement('div');
                childEl.classList.add(cls);
                const textMatch = val.match(new RegExp(`class=["'][^"']*${cls}[^"']*["'][^>]*>([^<]*)<`));
                if (textMatch) childEl.textContent = textMatch[1] || '';
                elements.set(`.${cls}`, childEl);
                this.appendChild(childEl);
              }
            });
          }
        }
      },
      textContent: '',
      children: [] as any[],
      parentElement: null as any,
      appendChild(child: any) {
        this.children.push(child);
        child.parentElement = this;
        return child;
      },
      removeChild(child: any) {
        this.children = this.children.filter((c: any) => c !== child);
        child.parentElement = null;
        return child;
      },
      contains(target: any) {
        if (target === this) return true;
        return this.children.some((c: any) => c === target || (c.contains && c.contains(target)));
      },
      querySelector(sel: string) {
        if (sel.startsWith('#')) {
          const targetId = sel.slice(1);
          if (this.id === targetId) return this;
          if (elements.has(sel)) return elements.get(sel);
          for (const c of this.children) {
            const found = c.querySelector(sel);
            if (found) return found;
          }
        }
        if (sel.startsWith('.')) {
          const targetCls = sel.slice(1);
          if (this.classList.contains(targetCls)) return this;
          if (elements.has(sel)) return elements.get(sel);
          for (const c of this.children) {
            const found = c.querySelector(sel);
            if (found) return found;
          }
        }
        return elements.get(sel) || null;
      },
      querySelectorAll(_sel: string) {
        return [];
      },
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      focus: vi.fn(),
      select: vi.fn(),
      click: vi.fn(),
    };
    if (id) elements.set(`#${id}`, el);
    return el;
  };

  const mockBody = createMockElement('body');
  const mockDoc: any = {
    body: mockBody,
    createElement: (tag: string) => createMockElement(tag),
    querySelector: (sel: string) => {
      if (elements.has(sel)) return elements.get(sel);
      return mockBody.querySelector(sel);
    },
    querySelectorAll: () => [],
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };

  (globalThis as any).document = mockDoc;
  (globalThis as any).window = {
    location: { origin: 'http://localhost:3000', hash: '' },
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    history: { replaceState: vi.fn() },
    requestAnimationFrame: (cb: Function) => setTimeout(cb, 0),
  };
}
