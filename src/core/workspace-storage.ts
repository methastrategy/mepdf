import type { DocumentMetadata, PDFPageItem } from './types';

const DB_NAME = 'mepdf_workspace_db';
const DB_VERSION = 1;
const STORE_NAME = 'workspace_sessions';
const SESSION_KEY = 'active_session';

export interface StoredWorkspaceData {
  version: number;
  updatedAt: number;
  documents: Array<{
    id: string;
    filename: string;
    size: number;
    pageCount: number;
    fileBytes: Uint8Array;
    password?: string;
  }>;
  pages: Array<{
    id: string;
    docId: string;
    docName: string;
    pageIndex: number;
    displayPageNumber: number;
    rotation: number;
    thumbnailDataUrl: string;
    width: number;
    height: number;
    selected?: boolean;
  }>;
}

let inMemoryStore: StoredWorkspaceData | null = null;

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
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
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
 * Persists the current workspace state (documents and pages) into IndexedDB.
 */
export async function saveWorkspaceState(
  documents: DocumentMetadata[] | Map<string, DocumentMetadata>,
  pages: PDFPageItem[]
): Promise<boolean> {
  const docList = Array.isArray(documents) ? documents : Array.from(documents.values());

  const storedDocs = docList.map((doc) => ({
    id: doc.id,
    filename: doc.filename,
    size: doc.size,
    pageCount: doc.pageCount,
    fileBytes: doc.fileBytes,
    password: doc.password,
  }));

  const storedPages = pages.map((page) => ({
    id: page.id,
    docId: page.docId,
    docName: page.docName,
    pageIndex: page.pageIndex,
    displayPageNumber: page.displayPageNumber,
    rotation: page.rotation,
    thumbnailDataUrl: page.thumbnailDataUrl,
    width: page.width,
    height: page.height,
    selected: false,
  }));

  const payload: StoredWorkspaceData = {
    version: 1,
    updatedAt: Date.now(),
    documents: storedDocs,
    pages: storedPages,
  };

  if (!isIndexedDBAvailable()) {
    inMemoryStore = payload;
    return true;
  }

  try {
    const db = await openDatabase();
    return await new Promise<boolean>((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const putRequest = store.put(payload, SESSION_KEY);

      putRequest.onsuccess = () => {
        resolve(true);
      };

      putRequest.onerror = () => {
        console.warn('Failed to put workspace state in IndexedDB:', putRequest.error);
        inMemoryStore = payload;
        resolve(false);
      };

      tx.oncomplete = () => {
        db.close();
      };

      tx.onerror = () => {
        db.close();
        resolve(false);
      };
    });
  } catch (err) {
    console.warn('IndexedDB save failed, falling back to in-memory:', err);
    inMemoryStore = payload;
    return false;
  }
}

/**
 * Restores the previous workspace session from IndexedDB if available.
 */
export async function loadWorkspaceState(): Promise<{
  documents: DocumentMetadata[];
  pages: PDFPageItem[];
} | null> {
  if (!isIndexedDBAvailable()) {
    if (inMemoryStore && inMemoryStore.pages.length > 0) {
      return hydrateWorkspace(inMemoryStore);
    }
    return null;
  }

  try {
    const db = await openDatabase();
    return await new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const getRequest = store.get(SESSION_KEY);

      getRequest.onsuccess = () => {
        const result = getRequest.result as StoredWorkspaceData | undefined;
        if (result && result.pages && result.pages.length > 0) {
          resolve(hydrateWorkspace(result));
        } else {
          resolve(null);
        }
      };

      getRequest.onerror = () => {
        console.warn('Failed to read workspace state from IndexedDB:', getRequest.error);
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

function hydrateWorkspace(data: StoredWorkspaceData): {
  documents: DocumentMetadata[];
  pages: PDFPageItem[];
} {
  const documents: DocumentMetadata[] = data.documents.map((d) => ({
    id: d.id,
    filename: d.filename,
    size: d.size,
    pageCount: d.pageCount,
    fileBytes: d.fileBytes instanceof Uint8Array ? d.fileBytes : new Uint8Array(d.fileBytes),
    password: d.password,
  }));

  const pages: PDFPageItem[] = data.pages.map((p) => ({
    id: p.id,
    docId: p.docId,
    docName: p.docName,
    pageIndex: p.pageIndex,
    displayPageNumber: p.displayPageNumber,
    rotation: p.rotation ?? 0,
    thumbnailDataUrl: p.thumbnailDataUrl,
    width: p.width,
    height: p.height,
    selected: false,
  }));

  return { documents, pages };
}

/**
 * Completely clears the saved workspace session from IndexedDB.
 */
export async function clearWorkspaceState(): Promise<boolean> {
  inMemoryStore = null;

  if (!isIndexedDBAvailable()) {
    return true;
  }

  try {
    const db = await openDatabase();
    return await new Promise<boolean>((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const deleteRequest = store.delete(SESSION_KEY);

      deleteRequest.onsuccess = () => {
        resolve(true);
      };

      deleteRequest.onerror = () => {
        console.warn('Failed to clear workspace in IndexedDB:', deleteRequest.error);
        resolve(false);
      };

      tx.oncomplete = () => {
        db.close();
      };

      tx.onerror = () => {
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
  inMemoryStore = null;
}
