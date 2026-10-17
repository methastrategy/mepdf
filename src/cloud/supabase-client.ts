import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Environment variables
const envUrl = typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env.VITE_SUPABASE_URL : '';
const envKey = typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env.VITE_SUPABASE_ANON_KEY : '';

const isValidSupabaseUrl = (url: string | undefined): boolean => {
  if (!url || typeof url !== 'string') return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
};

const hasCredentials = isValidSupabaseUrl(envUrl) && typeof envKey === 'string' && envKey.trim().length > 10;

// ============================================================
// MOCK SUPABASE CLIENT (Offline / Local Fallback)
// Ensures 100% zero-crash operation when Supabase keys are not set
// ============================================================

interface MockUser {
  id: string;
  email: string;
  user_metadata?: {
    full_name?: string;
    avatar_url?: string;
  };
}

interface MockSession {
  user: MockUser;
  access_token: string;
}

type AuthCallback = (event: string, session: MockSession | null) => void;

class MockAuthClient {
  private static sharedSession: MockSession | null = null;
  private currentSession: MockSession | null = null;
  private listeners = new Set<AuthCallback>();
  private readonly STORAGE_KEY = 'mepdf_mock_auth_session';

  constructor() {
    this.restoreSession();
  }

  private restoreSession(): void {
    try {
      if (typeof localStorage !== 'undefined') {
        const raw = localStorage.getItem(this.STORAGE_KEY);
        if (raw) {
          this.currentSession = JSON.parse(raw);
          MockAuthClient.sharedSession = this.currentSession;
          return;
        }
      }
    } catch {
      // safe
    }
    this.currentSession = MockAuthClient.sharedSession;
  }

  private saveSession(session: MockSession | null): void {
    this.currentSession = session;
    MockAuthClient.sharedSession = session;
    try {
      if (typeof localStorage !== 'undefined') {
        if (session) {
          localStorage.setItem(this.STORAGE_KEY, JSON.stringify(session));
        } else {
          localStorage.removeItem(this.STORAGE_KEY);
        }
      }
    } catch {
      // Safe fallback
    }
    this.notify(session ? 'SIGNED_IN' : 'SIGNED_OUT', session);
  }

  private notify(event: string, session: MockSession | null): void {
    this.listeners.forEach((cb) => {
      try {
        cb(event, session);
      } catch (err) {
        console.error('Error in mock auth listener:', err);
      }
    });
  }

  async getSession(): Promise<{ data: { session: MockSession | null }; error: null }> {
    return { data: { session: this.currentSession }, error: null };
  }

  async getUser(): Promise<{ data: { user: MockUser | null }; error: null }> {
    return { data: { user: this.currentSession?.user ?? null }, error: null };
  }

  onAuthStateChange(callback: AuthCallback): { data: { subscription: { unsubscribe: () => void } } } {
    this.listeners.add(callback);
    try {
      callback(this.currentSession ? 'SIGNED_IN' : 'INITIAL_SESSION', this.currentSession);
    } catch (err) {
      console.error(err);
    }
    return {
      data: {
        subscription: {
          unsubscribe: () => {
            this.listeners.delete(callback);
          },
        },
      },
    };
  }

  async signInWithOAuth({ provider: _provider }: { provider: string }): Promise<{ data: { user: MockUser; session: MockSession }; error: null }> {
    const user: MockUser = {
      id: 'mock_google_user_' + Math.random().toString(36).slice(2, 9),
      email: 'demo.user@mepdf.app',
      user_metadata: {
        full_name: 'mePDF Explorer',
        avatar_url: 'https://api.dicebear.com/7.x/bottts/svg?seed=mepdf',
      },
    };
    const session: MockSession = {
      user,
      access_token: 'mock_jwt_token_' + Date.now(),
    };
    this.saveSession(session);
    return { data: { user, session }, error: null };
  }

  async signInWithOtp({ email }: { email: string }): Promise<{ data: { user: MockUser; session: MockSession }; error: null }> {
    const user: MockUser = {
      id: 'mock_magic_user_' + Math.random().toString(36).slice(2, 9),
      email,
      user_metadata: {
        full_name: email.split('@')[0] || 'Cloud User',
      },
    };
    const session: MockSession = {
      user,
      access_token: 'mock_magic_token_' + Date.now(),
    };
    this.saveSession(session);
    return { data: { user, session }, error: null };
  }

  async signInWithPassword({ email }: { email: string; password?: string }): Promise<{ data: { user: MockUser; session: MockSession }; error: null }> {
    const user: MockUser = {
      id: 'mock_pwd_user_' + Math.random().toString(36).slice(2, 9),
      email,
      user_metadata: {
        full_name: email.split('@')[0] || 'Pro User',
      },
    };
    const session: MockSession = {
      user,
      access_token: 'mock_pwd_token_' + Date.now(),
    };
    this.saveSession(session);
    return { data: { user, session }, error: null };
  }

  async signUp({ email, options }: { email: string; password?: string; options?: { data?: { full_name?: string } } }): Promise<{ data: { user: MockUser; session: MockSession }; error: null }> {
    const user: MockUser = {
      id: 'mock_user_' + Math.random().toString(36).slice(2, 9),
      email,
      user_metadata: {
        full_name: options?.data?.full_name || email.split('@')[0] || 'New User',
      },
    };
    const session: MockSession = {
      user,
      access_token: 'mock_signup_token_' + Date.now(),
    };
    this.saveSession(session);
    return { data: { user, session }, error: null };
  }

  async signOut(): Promise<{ error: null }> {
    this.saveSession(null);
    return { error: null };
  }
}

class MockStorageBucket {
  private static memoryFiles = new Map<string, { bytes: Uint8Array; mimeType: string }>();
  private readonly PREFIX = 'mepdf_mock_storage_';

  async upload(path: string, fileBody: Uint8Array | Blob | ArrayBuffer, _options?: any): Promise<{ data: { path: string } | null; error: any }> {
    let bytes: Uint8Array;
    if (fileBody instanceof Uint8Array) {
      bytes = fileBody;
    } else if (fileBody instanceof ArrayBuffer) {
      bytes = new Uint8Array(fileBody);
    } else if (typeof Blob !== 'undefined' && fileBody instanceof Blob) {
      const buf = await fileBody.arrayBuffer();
      bytes = new Uint8Array(buf);
    } else {
      bytes = new Uint8Array(0);
    }

    MockStorageBucket.memoryFiles.set(path, { bytes, mimeType: 'application/pdf' });
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(this.PREFIX + path, JSON.stringify({ path, size: bytes.length, savedAt: Date.now() }));
      }
    } catch {
      // safe
    }

    return { data: { path }, error: null };
  }

  async download(path: string): Promise<{ data: Blob | null; error: any }> {
    const file = MockStorageBucket.memoryFiles.get(path);
    if (!file) {
      const emptyPdf = new Uint8Array([37, 80, 68, 70, 45, 49, 46, 55, 10]); // %PDF-1.7
      return { data: new Blob([emptyPdf as any], { type: 'application/pdf' }), error: null };
    }
    return { data: new Blob([file.bytes as any], { type: file.mimeType }), error: null };
  }

  async remove(paths: string[]): Promise<{ data: any; error: null }> {
    paths.forEach((p) => {
      MockStorageBucket.memoryFiles.delete(p);
      try {
        if (typeof localStorage !== 'undefined') {
          localStorage.removeItem(this.PREFIX + p);
        }
      } catch {
        // safe
      }
    });
    return { data: paths, error: null };
  }

  createSignedUrl(path: string, _expiresIn: number): { data: { signedUrl: string } | null; error: null } {
    const file = MockStorageBucket.memoryFiles.get(path);
    let blobUrl = '#';
    if (file && typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
      blobUrl = URL.createObjectURL(new Blob([file.bytes as any], { type: 'application/pdf' }));
    }
    return { data: { signedUrl: blobUrl }, error: null };
  }
}

class MockStorageClient {
  private buckets = new Map<string, MockStorageBucket>();

  from(bucketName: string): MockStorageBucket {
    if (!this.buckets.has(bucketName)) {
      this.buckets.set(bucketName, new MockStorageBucket());
    }
    return this.buckets.get(bucketName)!;
  }
}

export class MockQueryBuilder {
  private static memoryStore = new Map<string, any[]>();
  private tableName: string;
  private filters: Array<{ col: string; val: any }> = [];
  private orderField: string | null = null;
  private orderAsc = true;
  private action: 'select' | 'insert' | 'update' | 'delete' = 'select';
  private payload: any = null;
  private isSingle = false;
  private readonly STORAGE_PREFIX = 'mepdf_mock_db_';

  constructor(tableName: string) {
    this.tableName = tableName;
  }

  static clearStore(): void {
    MockQueryBuilder.memoryStore.clear();
  }

  private getTableData(): any[] {
    try {
      if (typeof localStorage !== 'undefined') {
        const raw = localStorage.getItem(this.STORAGE_PREFIX + this.tableName);
        if (raw) return JSON.parse(raw);
      }
    } catch {
      // safe
    }
    return MockQueryBuilder.memoryStore.get(this.tableName) || [];
  }

  private saveTableData(data: any[]): void {
    MockQueryBuilder.memoryStore.set(this.tableName, data);
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(this.STORAGE_PREFIX + this.tableName, JSON.stringify(data));
      }
    } catch {
      // safe
    }
  }

  select(_cols?: string): MockQueryBuilder {
    const qb = new MockQueryBuilder(this.tableName);
    qb.action = 'select';
    return qb;
  }

  insert(recordOrRecords: any | any[]): MockQueryBuilder {
    const qb = new MockQueryBuilder(this.tableName);
    qb.action = 'insert';
    qb.payload = recordOrRecords;
    return qb;
  }

  update(patch: any): MockQueryBuilder {
    const qb = new MockQueryBuilder(this.tableName);
    qb.action = 'update';
    qb.payload = patch;
    return qb;
  }

  delete(): MockQueryBuilder {
    const qb = new MockQueryBuilder(this.tableName);
    qb.action = 'delete';
    return qb;
  }

  eq(column: string, value: any): this {
    this.filters.push({ col: column, val: value });
    return this;
  }

  order(column: string, options?: { ascending?: boolean }): this {
    this.orderField = column;
    this.orderAsc = options?.ascending ?? true;
    return this;
  }

  single(): Promise<{ data: any; error: any }> {
    this.isSingle = true;
    return this.execute();
  }

  then(resolve: (value: { data: any; error: any }) => void, reject?: (err: any) => void): Promise<any> {
    return this.execute().then(resolve, reject);
  }

  private async execute(): Promise<{ data: any; error: any }> {
    let rows = this.getTableData();

    if (this.action === 'insert') {
      const list = Array.isArray(this.payload) ? this.payload : [this.payload];
      const created = list.map((item) => ({
        id: item.id || 'id_' + Math.random().toString(36).slice(2, 9),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        ...item,
      }));
      this.saveTableData([...created, ...rows]);
      const resultData = this.isSingle || !Array.isArray(this.payload) ? created[0] : created;
      return { data: resultData, error: null };
    }

    if (this.action === 'update') {
      const updatedRows: any[] = [];
      rows = rows.map((r) => {
        const matches = this.filters.every((f) => r[f.col] === f.val);
        if (matches) {
          const updated = { ...r, ...this.payload, updated_at: new Date().toISOString() };
          updatedRows.push(updated);
          return updated;
        }
        return r;
      });
      this.saveTableData(rows);
      const res = this.isSingle ? (updatedRows[0] ?? null) : updatedRows;
      return { data: res, error: null };
    }

    if (this.action === 'delete') {
      const deleted: any[] = [];
      rows = rows.filter((r) => {
        const matches = this.filters.every((f) => r[f.col] === f.val);
        if (matches) {
          deleted.push(r);
          return false;
        }
        return true;
      });
      this.saveTableData(rows);
      return { data: deleted, error: null };
    }

    // Default: 'select'
    for (const f of this.filters) {
      rows = rows.filter((r) => r[f.col] === f.val);
    }
    if (this.orderField) {
      const field = this.orderField;
      const asc = this.orderAsc;
      rows.sort((a, b) => {
        if (a[field] < b[field]) return asc ? -1 : 1;
        if (a[field] > b[field]) return asc ? 1 : -1;
        return 0;
      });
    }

    if (this.isSingle) {
      if (rows.length > 0) {
        return { data: rows[0], error: null };
      }
      return { data: null, error: { message: 'Not found' } };
    }

    return { data: rows, error: null };
  }
}

export class MockSupabaseClient {
  auth = new MockAuthClient();
  storage = new MockStorageClient();

  from(tableName: string): MockQueryBuilder {
    return new MockQueryBuilder(tableName);
  }
}

// ============================================================
// SINGLETON INSTANTIATION
// ============================================================

let clientInstance: any;
let mockModeActive = false;

if (hasCredentials) {
  try {
    clientInstance = createClient(envUrl, envKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
    });
    mockModeActive = false;
  } catch (err) {
    console.warn('Failed to initialize live Supabase client, falling back to Mock:', err);
    clientInstance = new MockSupabaseClient();
    mockModeActive = true;
  }
} else {
  clientInstance = new MockSupabaseClient();
  mockModeActive = true;
}

export const supabase: SupabaseClient = clientInstance as SupabaseClient;

/**
 * Returns true if the client is currently running in offline / mock fallback mode
 */
export function isMockSupabase(): boolean {
  return mockModeActive;
}

/**
 * Helper to force mock mode in automated tests
 */
export function setMockClientForTesting(client: MockSupabaseClient | null): void {
  if (client) {
    clientInstance = client;
    mockModeActive = true;
  } else {
    clientInstance = new MockSupabaseClient();
    mockModeActive = true;
  }
}
