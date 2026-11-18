import type { DocumentMetadata, PDFPageItem } from './types';

const DB_NAME = 'mepdf_workspace_db';
const DB_VERSION = 2;
const STORE_SESSIONS = 'workspace_sessions';
const STORE_DOCUMENTS = 'workspace_documents';
const SESSION_KEY = 'active_session';

export interface StoredSessionPayload {
  version: number;
  updatedAt: number;
  docIds: string[];
  pages: Array<{
    id: string;
    docId: string;
    docName: string;
    pageIndex: number;
    displayPageNumber: number;
    rotation: number;
    thumbnailDataUrl?: string;
    width: number;
    height: number;
    selected?: boolean;
  }>;
}

export interface StoredDocumentRecord {
  id: string;
  filename: string;
  size: number;
  pageCount: number;
  fileBytes: Uint8Array;
  /**
   * Stored in local browser IndexedDB solely for client-side session auto-restore.
   * Never transmitted over the wire or synced to any cloud backend.
   * NOTE: For high-security environments, encrypt with Web Crypto API (AES-GCM)
   * using a session-derived key before writing to IndexedDB.
   */
  password?: string;
}

// Legacy v1 schema compatibility
interface LegacyStoredWorkspaceData {
  version: 1;
  updatedAt: number;
  documents: StoredDocumentRecord[];
  pages: StoredSessionPayload['pages'];
}

// In-memory decoupled store for non-IndexedDB / Node test environments
let inMemorySession: StoredSessionPayload | null = null;
const inMemoryDocuments = new Map<string, StoredDocumentRecord>();

export interface DocSignature {
  size: number;
  byteRef: Uint8Array;
  filename?: string;
  pageCount?: number;
  password?: string;
}

// Tracks persisted document byte references and properties to avoid redundant writes
const persistedDocSignatures = new Map<string, DocSignature>();

function isIndexedDBAvailable(): boolean {
  try {
    return typeof indexedDB !== 'undefined' && indexedDB !== null;
  } catch {
    return false;
  }
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!isIndexedDBAvailable()) {
      reject(new Error('IndexedDB not available in current environment'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_SESSIONS)) {
        db.createObjectStore(STORE_SESSIONS);
      }
      if (!db.objectStoreNames.contains(STORE_DOCUMENTS)) {
        db.createObjectStore(STORE_DOCUMENTS, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      reject(request.error || new Error('Failed to open IndexedDB'));
    };

    request.onblocked = () => {
      console.warn('IndexedDB open blocked by other tabs');
    };
  });
}

/**
 * Persists the current workspace state.
 * High-performance decoupled architecture:
 * - Raw heavy fileBytes are stored ONCE in STORE_DOCUMENTS keyed by docId
 * - Page ordering, rotation, and selection edits are stored in lightweight STORE_SESSIONS (< 10 KB)
 */
export async function saveWorkspaceState(
  documents: DocumentMetadata[] | Map<string, DocumentMetadata>,
  pages: PDFPageItem[]
): Promise<boolean> {
  const docList = Array.isArray(documents) ? documents : Array.from(documents.values());
  const activeDocIds = new Set(pages.map((p) => p.docId));

  // Omit heavy 1600px thumbnailDataUrl base64 strings to eliminate session storage bloat
  const storedPages: StoredSessionPayload['pages'] = pages.map((page) => ({
    id: page.id,
    docId: page.docId,
    docName: page.docName,
    pageIndex: page.pageIndex,
    displayPageNumber: page.displayPageNumber,
    rotation: page.rotation,
    width: page.width,
    height: page.height,
    selected: false,
  }));

  const sessionPayload: StoredSessionPayload = {
    version: 2,
    updatedAt: Date.now(),
    docIds: docList.map((d) => d.id),
    pages: storedPages,
  };

  // Fallback to in-memory decoupled store
  if (!isIndexedDBAvailable()) {
    inMemorySession = sessionPayload;
    // Store active docs only when new or modified
    for (const doc of docList) {
      const existing = inMemoryDocuments.get(doc.id);
      const isModified =
        !existing ||
        existing.fileBytes !== doc.fileBytes ||
        existing.size !== doc.size ||
        existing.filename !== doc.filename ||
        existing.pageCount !== doc.pageCount ||
        existing.password !== doc.password;

      if (isModified) {
        inMemoryDocuments.set(doc.id, {
          id: doc.id,
          filename: doc.filename,
          size: doc.size,
          pageCount: doc.pageCount,
          fileBytes: doc.fileBytes,
          password: doc.password,
        });
        persistedDocSignatures.set(doc.id, {
          size: doc.size,
          byteRef: doc.fileBytes,
          filename: doc.filename,
          pageCount: doc.pageCount,
          password: doc.password,
        });
      }
    }
    // Prune unused docs
    for (const id of inMemoryDocuments.keys()) {
      if (!activeDocIds.has(id)) {
        inMemoryDocuments.delete(id);
        persistedDocSignatures.delete(id);
      }
    }
    return true;
  }

  try {
    const db = await openDatabase();
    return await new Promise<boolean>((resolve) => {
      const tx = db.transaction([STORE_SESSIONS, STORE_DOCUMENTS], 'readwrite');
      const sessionStore = tx.objectStore(STORE_SESSIONS);
      const docStore = tx.objectStore(STORE_DOCUMENTS);

      const stagedSignatures = new Map<string, DocSignature>();
      const stagedDeletions = new Set<string>();

      // 1. Put active session metadata (lightweight, < 10 KB)
      sessionStore.put(sessionPayload, SESSION_KEY);

      // 2. Query existing document IDs to avoid repeatedly rewriting unmodified fileBytes
      const allDocsReq = docStore.getAllKeys();
      allDocsReq.onsuccess = () => {
        const storedKeys = new Set(allDocsReq.result as string[]);

        // Put only new documents or documents whose bytes or metadata have changed
        for (const doc of docList) {
          const sig = persistedDocSignatures.get(doc.id);
          const isPersisted =
            storedKeys.has(doc.id) &&
            sig !== undefined &&
            sig.byteRef === doc.fileBytes &&
            sig.size === doc.size &&
            sig.filename === doc.filename &&
            sig.pageCount === doc.pageCount &&
            sig.password === doc.password;

          if (!isPersisted) {
            docStore.put({
              id: doc.id,
              filename: doc.filename,
              size: doc.size,
              pageCount: doc.pageCount,
              fileBytes: doc.fileBytes,
              password: doc.password,
            });
            stagedSignatures.set(doc.id, {
              size: doc.size,
              byteRef: doc.fileBytes,
              filename: doc.filename,
              pageCount: doc.pageCount,
              password: doc.password,
            });
          }
        }

        // 3. Prune deleted documents from document store
        for (const key of storedKeys) {
          if (!activeDocIds.has(key)) {
            docStore.delete(key);
            stagedDeletions.add(key);
          }
        }
      };

      allDocsReq.onerror = () => {
        console.warn('Failed to query stored doc keys:', allDocsReq.error);
      };

      tx.oncomplete = () => {
        for (const [id, sig] of stagedSignatures) {
          persistedDocSignatures.set(id, sig);
        }
        for (const key of stagedDeletions) {
          persistedDocSignatures.delete(key);
        }
        db.close();
        resolve(true);
      };

      tx.onerror = () => {
        console.warn('Failed to commit decoupled workspace transaction:', tx.error);
        db.close();
        resolve(false);
      };
    });
  } catch (err) {
    console.warn('IndexedDB save failed, falling back to in-memory:', err);
    inMemorySession = sessionPayload;
    for (const doc of docList) {
      const existing = inMemoryDocuments.get(doc.id);
      const isModified =
        !existing ||
        existing.fileBytes !== doc.fileBytes ||
        existing.size !== doc.size ||
        existing.filename !== doc.filename ||
        existing.pageCount !== doc.pageCount ||
        existing.password !== doc.password;

      if (isModified) {
        inMemoryDocuments.set(doc.id, {
          id: doc.id,
          filename: doc.filename,
          size: doc.size,
          pageCount: doc.pageCount,
          fileBytes: doc.fileBytes,
          password: doc.password,
        });
        persistedDocSignatures.set(doc.id, {
          size: doc.size,
          byteRef: doc.fileBytes,
          filename: doc.filename,
          pageCount: doc.pageCount,
          password: doc.password,
        });
      }
    }
    return false;
  }
}

/**
 * Restores the previous workspace session from IndexedDB if available.
 * Gracefully handles both v2 decoupled schema and legacy v1 monolithic schema.
 */
export async function loadWorkspaceState(): Promise<{
  documents: DocumentMetadata[];
  pages: PDFPageItem[];
} | null> {
  // In-memory fallback
  if (!isIndexedDBAvailable()) {
    if (inMemorySession && inMemorySession.pages.length > 0) {
      const docs: DocumentMetadata[] = [];
      for (const id of inMemorySession.docIds) {
        const d = inMemoryDocuments.get(id);
        if (d) {
          const loadedBytes = d.fileBytes instanceof Uint8Array ? d.fileBytes : new Uint8Array(d.fileBytes);
          docs.push({
            id: d.id,
            filename: d.filename,
            size: d.size,
            pageCount: d.pageCount,
            fileBytes: loadedBytes,
            password: d.password,
          });
          persistedDocSignatures.set(d.id, {
            size: d.size,
            byteRef: loadedBytes,
            filename: d.filename,
            pageCount: d.pageCount,
            password: d.password,
          });
        }
      }
      const pages: PDFPageItem[] = inMemorySession.pages.map((p) => ({
        ...p,
        thumbnailDataUrl: p.thumbnailDataUrl || '',
        rotation: p.rotation ?? 0,
        selected: false,
      }));
      return { documents: docs, pages };
    }
    return null;
  }

  try {
    const db = await openDatabase();
    return await new Promise((resolve) => {
      const hasDocStore = db.objectStoreNames.contains(STORE_DOCUMENTS);
      const storeNames = hasDocStore ? [STORE_SESSIONS, STORE_DOCUMENTS] : [STORE_SESSIONS];
      const tx = db.transaction(storeNames, 'readonly');
      const sessionStore = tx.objectStore(STORE_SESSIONS);
      const getSessionReq = sessionStore.get(SESSION_KEY);

      getSessionReq.onsuccess = () => {
        const rawResult = getSessionReq.result;
        if (!rawResult || !rawResult.pages || rawResult.pages.length === 0) {
          resolve(null);
          return;
        }

        // Check if legacy v1 monolithic format
        if (rawResult.version === 1 && Array.isArray((rawResult as LegacyStoredWorkspaceData).documents)) {
          const legacy = rawResult as LegacyStoredWorkspaceData;
          const documents: DocumentMetadata[] = legacy.documents.map((d) => ({
            id: d.id,
            filename: d.filename,
            size: d.size,
            pageCount: d.pageCount,
            fileBytes: d.fileBytes instanceof Uint8Array ? d.fileBytes : new Uint8Array(d.fileBytes),
            password: d.password,
          }));
          const pages: PDFPageItem[] = legacy.pages.map((p) => ({
            ...p,
            thumbnailDataUrl: p.thumbnailDataUrl || '',
            rotation: p.rotation ?? 0,
            selected: false,
          }));
          resolve({ documents, pages });
          return;
        }

        // v2 Decoupled schema
        const session = rawResult as StoredSessionPayload;
        if (!hasDocStore) {
          resolve(null);
          return;
        }

        const docStore = tx.objectStore(STORE_DOCUMENTS);
        const docs: DocumentMetadata[] = [];
        let fetched = 0;
        const totalDocs = session.docIds.length;

        if (totalDocs === 0) {
          resolve(null);
          return;
        }

        for (const docId of session.docIds) {
          const req = docStore.get(docId);
          req.onsuccess = () => {
            if (req.result) {
              const d = req.result as StoredDocumentRecord;
              const loadedBytes = d.fileBytes instanceof Uint8Array ? d.fileBytes : new Uint8Array(d.fileBytes);
              docs.push({
                id: d.id,
                filename: d.filename,
                size: d.size,
                pageCount: d.pageCount,
                fileBytes: loadedBytes,
                password: d.password,
              });
              persistedDocSignatures.set(d.id, {
            size: d.size,
            byteRef: loadedBytes,
            filename: d.filename,
            pageCount: d.pageCount,
            password: d.password,
          });
            }
            fetched++;
            if (fetched === totalDocs) {
              const pages: PDFPageItem[] = session.pages.map((p) => ({
                ...p,
                thumbnailDataUrl: p.thumbnailDataUrl || '',
                rotation: p.rotation ?? 0,
                selected: false,
              }));
              resolve({ documents: docs, pages });
            }
          };
          req.onerror = () => {
            fetched++;
            if (fetched === totalDocs) {
              const pages: PDFPageItem[] = session.pages.map((p) => ({
                ...p,
                thumbnailDataUrl: p.thumbnailDataUrl || '',
                rotation: p.rotation ?? 0,
                selected: false,
              }));
              resolve({ documents: docs, pages });
            }
          };
        }
      };

      getSessionReq.onerror = () => {
        console.warn('Failed to read workspace session from IndexedDB:', getSessionReq.error);
        resolve(null);
      };

      tx.oncomplete = () => {
        db.close();
      };

      tx.onerror = () => {
        db.close();
        resolve(null);
      };
    });
  } catch (err) {
    console.warn('IndexedDB load failed:', err);
    return null;
  }
}

/**
 * Completely clears the saved workspace session and raw documents from IndexedDB.
 */
export async function clearWorkspaceState(): Promise<boolean> {
  inMemorySession = null;
  inMemoryDocuments.clear();
  persistedDocSignatures.clear();

  if (!isIndexedDBAvailable()) {
    return true;
  }

  try {
    const db = await openDatabase();
    return await new Promise<boolean>((resolve) => {
      const hasDocStore = db.objectStoreNames.contains(STORE_DOCUMENTS);
      const storeNames = hasDocStore ? [STORE_SESSIONS, STORE_DOCUMENTS] : [STORE_SESSIONS];
      const tx = db.transaction(storeNames, 'readwrite');
      const sessionStore = tx.objectStore(STORE_SESSIONS);
      sessionStore.delete(SESSION_KEY);

      if (hasDocStore) {
        const docStore = tx.objectStore(STORE_DOCUMENTS);
        docStore.clear();
      }

      tx.oncomplete = () => {
        db.close();
        resolve(true);
      };

      tx.onerror = () => {
        console.warn('Failed to clear workspace in IndexedDB:', tx.error);
        db.close();
        resolve(false);
      };
    });
  } catch (err) {
    console.warn('IndexedDB clear failed:', err);
    return false;
  }
}

/**
 * Helper for test isolation to reset memory state
 */
export function _resetMemoryStore(): void {
  inMemorySession = null;
  inMemoryDocuments.clear();
  persistedDocSignatures.clear();
}

export function _isDocPersisted(id: string): boolean {
  return persistedDocSignatures.has(id);
}
