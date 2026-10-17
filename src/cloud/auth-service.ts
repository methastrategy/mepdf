import { supabase } from './supabase-client';

export type SubscriptionTier = 'free' | 'pro' | 'enterprise';

export interface UserProfile {
  id: string;
  email: string;
  fullName?: string;
  avatarUrl?: string;
  tier: SubscriptionTier;
  storageUsedBytes: number;
  storageLimitBytes: number;
  createdAt: string;
}

export const FREE_STORAGE_LIMIT = 100 * 1024 * 1024; // 100 MB
export const PRO_STORAGE_LIMIT = 10 * 1024 * 1024 * 1024; // 10 GB

class AuthService {
  private currentUser: UserProfile | null = null;
  private listeners = new Set<(user: UserProfile | null) => void>();
  private initialized = false;

  constructor() {
    this.init();
  }

  private async init(): Promise<void> {
    try {
      const { data } = await supabase.auth.getSession();
      if (data?.session?.user) {
        await this.loadUserProfile(data.session.user);
      }
    } catch (err) {
      console.warn('Failed to load initial auth session:', err);
    } finally {
      this.initialized = true;
    }

    supabase.auth.onAuthStateChange(async (_event: string, session: any) => {
      if (session?.user) {
        await this.loadUserProfile(session.user);
      } else {
        this.currentUser = null;
        this.notifyListeners();
      }
    });
  }

  private async loadUserProfile(authUser: any): Promise<UserProfile | null> {
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', authUser.id)
        .single();

      if (profile) {
        this.currentUser = {
          id: profile.id,
          email: profile.email || authUser.email || '',
          fullName: profile.full_name || authUser.user_metadata?.full_name,
          avatarUrl: profile.avatar_url || authUser.user_metadata?.avatar_url,
          tier: (profile.tier as SubscriptionTier) || 'free',
          storageUsedBytes: Number(profile.storage_used_bytes || 0),
          storageLimitBytes: Number(profile.storage_limit_bytes || FREE_STORAGE_LIMIT),
          createdAt: profile.created_at || new Date().toISOString(),
        };
      } else {
        // Create default profile on first login
        const newProfile: UserProfile = {
          id: authUser.id,
          email: authUser.email || '',
          fullName: authUser.user_metadata?.full_name || authUser.email?.split('@')[0],
          avatarUrl: authUser.user_metadata?.avatar_url,
          tier: 'free',
          storageUsedBytes: 0,
          storageLimitBytes: FREE_STORAGE_LIMIT,
          createdAt: new Date().toISOString(),
        };

        await supabase.from('profiles').insert({
          id: newProfile.id,
          email: newProfile.email,
          full_name: newProfile.fullName,
          avatar_url: newProfile.avatarUrl,
          tier: newProfile.tier,
          storage_used_bytes: 0,
          storage_limit_bytes: FREE_STORAGE_LIMIT,
        });

        this.currentUser = newProfile;
      }
    } catch {
      // Offline fallback: construct in-memory profile
      this.currentUser = {
        id: authUser.id,
        email: authUser.email || 'user@mepdf.local',
        fullName: authUser.user_metadata?.full_name || authUser.email?.split('@')[0] || 'mePDF User',
        avatarUrl: authUser.user_metadata?.avatar_url,
        tier: 'free',
        storageUsedBytes: 0,
        storageLimitBytes: FREE_STORAGE_LIMIT,
        createdAt: new Date().toISOString(),
      };
    }

    this.notifyListeners();
    return this.currentUser;
  }

  private notifyListeners(): void {
    this.listeners.forEach((listener) => {
      try {
        listener(this.currentUser);
      } catch (err) {
        console.error('Error in auth listener:', err);
      }
    });
  }

  getCurrentUser(): UserProfile | null {
    return this.currentUser;
  }

  isAuthenticated(): boolean {
    return this.currentUser !== null;
  }

  onAuthStateChange(callback: (user: UserProfile | null) => void): () => void {
    this.listeners.add(callback);
    if (this.initialized) {
      try {
        callback(this.currentUser);
      } catch (e) {
        console.error(e);
      }
    }
    return () => {
      this.listeners.delete(callback);
    };
  }

  async signInWithGoogle(): Promise<void> {
    const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: origin,
      } as any,
    });
    if (error) throw new Error(error.message);
    if ((data as any)?.user) {
      await this.loadUserProfile((data as any).user);
    }
  }

  async signInWithMagicLink(email: string): Promise<void> {
    const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
    const { data, error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: origin,
      } as any,
    });
    if (error) throw new Error(error.message);
    if ((data as any)?.user) {
      await this.loadUserProfile((data as any).user);
    }
  }

  async signInWithPassword(email: string, password: string): Promise<void> {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw new Error(error.message);
    if (data?.user) {
      await this.loadUserProfile(data.user);
    }
  }

  async signUp(email: string, password: string, fullName?: string): Promise<void> {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
        },
      },
    });
    if (error) throw new Error(error.message);
    if (data?.user) {
      await this.loadUserProfile(data.user);
    }
  }

  async signOut(): Promise<void> {
    const { error } = await supabase.auth.signOut();
    this.currentUser = null;
    this.notifyListeners();
    if (error) throw new Error(error.message);
  }

  async refreshProfile(): Promise<UserProfile | null> {
    if (!this.currentUser) return null;
    return this.loadUserProfile({ id: this.currentUser.id, email: this.currentUser.email });
  }

  async updateStorageUsage(bytesDelta: number): Promise<void> {
    if (!this.currentUser) return;
    const nextUsage = Math.max(0, this.currentUser.storageUsedBytes + bytesDelta);
    this.currentUser.storageUsedBytes = nextUsage;

    try {
      await supabase
        .from('profiles')
        .update({ storage_used_bytes: nextUsage })
        .eq('id', this.currentUser.id);
    } catch (err) {
      console.warn('Could not persist storage usage to remote:', err);
    }

    this.notifyListeners();
  }

  async upgradeToPro(): Promise<void> {
    if (!this.currentUser) return;
    this.currentUser.tier = 'pro';
    this.currentUser.storageLimitBytes = PRO_STORAGE_LIMIT;

    try {
      await supabase
        .from('profiles')
        .update({
          tier: 'pro',
          storage_limit_bytes: PRO_STORAGE_LIMIT,
        })
        .eq('id', this.currentUser.id);
    } catch (err) {
      console.warn('Could not update remote tier:', err);
    }

    this.notifyListeners();
  }

  // Test helper to directly inject user profile
  setTestUser(user: UserProfile | null): void {
    this.currentUser = user;
    this.notifyListeners();
  }
}

export const authService = new AuthService();
