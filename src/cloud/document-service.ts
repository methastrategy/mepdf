import { supabase } from './supabase-client';
import { authService } from './auth-service';
import { storageService } from './storage-service';

export interface CloudDocument {
  id: string;
  userId: string;
  filename: string;
  sizeBytes: number;
  pageCount: number;
  storageKey: string;
  thumbnailDataUrl?: string;
  isPinned: boolean;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
  downloadUrl?: string;
}

export interface SaveDocumentInput {
  filename: string;
  fileBytes: Uint8Array;
  pageCount: number;
  thumbnailDataUrl?: string;
  isPinned?: boolean;
}

class DocumentService {
  /**
   * Calculates expiration date (default: 30 days from now)
   */
  getDefaultExpirationDate(days = 30): string {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return d.toISOString();
  }

  /**
   * Returns remaining days until expiration, or null if pinned/no expiration
   */
  getDaysUntilExpiration(doc: CloudDocument): number | null {
    if (doc.isPinned || !doc.expiresAt) return null;
    const now = Date.now();
    const expireTime = new Date(doc.expiresAt).getTime();
    const diffMs = expireTime - now;
    if (diffMs <= 0) return 0;
    return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  }

  /**
   * Fetches all cloud documents owned by the active user, sorted with pinned first then newest
   */
  async fetchUserDocuments(userId?: string): Promise<CloudDocument[]> {
    const targetUserId = userId || authService.getCurrentUser()?.id;
    if (!targetUserId) {
      return [];
    }

    const { data, error } = await supabase
      .from('documents')
      .select('*')
      .eq('user_id', targetUserId)
      .order('is_pinned', { ascending: false })
      .order('created_at', { ascending: false });

    if (error || !data) {
      console.warn('Failed to fetch documents from db:', error);
      return [];
    }

    return (data as any[]).map((r) => this.mapRowToDocument(r));
  }

  /**
   * Uploads PDF file and saves document metadata in database
   */
  async saveDocument(input: SaveDocumentInput): Promise<CloudDocument> {
    const user = authService.getCurrentUser();
    if (!user) {
      throw new Error('Authentication required to save document to cloud');
    }

    // 1. Upload bytes to storage
    const { storageKey, downloadUrl } = await storageService.uploadPdf(
      input.fileBytes,
      input.filename,
      user.id
    );

    const isPinned = input.isPinned ?? false;
    const expiresAt = isPinned ? null : this.getDefaultExpirationDate(30);

    const docRecord = {
      user_id: user.id,
      filename: input.filename,
      size_bytes: input.fileBytes.length,
      page_count: input.pageCount,
      storage_key: storageKey,
      thumbnail_data_url: input.thumbnailDataUrl || null,
      is_pinned: isPinned,
      expires_at: expiresAt,
    };

    // 2. Insert metadata record (chain .select() to request representation from PostgREST)
    const { data, error } = await supabase
      .from('documents')
      .insert(docRecord)
      .select()
      .single();

    if (error || !data) {
      // Rollback storage file on DB error
      await storageService.deletePdf(storageKey, input.fileBytes.length);
      throw new Error(`Failed to save document metadata: ${error?.message || 'Database error'}`);
    }

    const savedDoc = this.mapRowToDocument(data);
    savedDoc.downloadUrl = downloadUrl;
    return savedDoc;
  }

  /**
   * Toggles the pin state on a document. Pinned documents do not expire.
   */
  async togglePin(documentId: string): Promise<CloudDocument> {
    const user = authService.getCurrentUser();
    if (!user) throw new Error('Authentication required');

    // Retrieve current doc
    const { data: current } = await supabase
      .from('documents')
      .select('*')
      .eq('id', documentId)
      .single();

    if (!current) throw new Error('Document not found');

    const nextPinned = !current.is_pinned;
    const nextExpiresAt = nextPinned ? null : this.getDefaultExpirationDate(30);

    const { data, error } = await supabase
      .from('documents')
      .update({
        is_pinned: nextPinned,
        expires_at: nextExpiresAt,
      })
      .eq('id', documentId)
      .select()
      .single();

    if (error || !data) {
      throw new Error(`Failed to update pin state: ${error?.message}`);
    }

    return this.mapRowToDocument(data);
  }

  /**
   * Removes a document from database and deletes its file in storage
   */
  async deleteDocument(documentId: string): Promise<void> {
    // 1. Fetch record first to know storageKey and size
    const { data: doc } = await supabase
      .from('documents')
      .select('*')
      .eq('id', documentId)
      .single();

    if (doc) {
      // 2. Delete storage file
      if (doc.storage_key) {
        await storageService.deletePdf(doc.storage_key, Number(doc.size_bytes || 0));
      }

      // 3. Delete metadata row
      await supabase.from('documents').delete().eq('id', documentId);
    }
  }

  /**
   * Retrieves fresh signed download URL for document
   */
  async getDocumentDownloadUrl(doc: CloudDocument): Promise<string> {
    return storageService.getSignedUrl(doc.storageKey, 86400);
  }

  /**
   * Reads raw PDF bytes of the document
   */
  async getDocumentBytes(doc: CloudDocument): Promise<Uint8Array> {
    return storageService.downloadPdf(doc.storageKey);
  }

  /**
   * Scans and purges unpinned documents whose expiration date has passed
   */
  async cleanupExpiredDocuments(): Promise<number> {
    const user = authService.getCurrentUser();
    if (!user) return 0;

    const docs = await this.fetchUserDocuments(user.id);
    const now = Date.now();
    let purgedCount = 0;

    for (const doc of docs) {
      if (!doc.isPinned && doc.expiresAt) {
        const exp = new Date(doc.expiresAt).getTime();
        if (exp <= now) {
          await this.deleteDocument(doc.id);
          purgedCount++;
        }
      }
    }

    return purgedCount;
  }

  private mapRowToDocument(r: any): CloudDocument {
    return {
      id: r.id,
      userId: r.user_id,
      filename: r.filename,
      sizeBytes: Number(r.size_bytes || 0),
      pageCount: Number(r.page_count || 1),
      storageKey: r.storage_key,
      thumbnailDataUrl: r.thumbnail_data_url || undefined,
      isPinned: Boolean(r.is_pinned),
      expiresAt: r.expires_at || null,
      createdAt: r.created_at || new Date().toISOString(),
      updatedAt: r.updated_at || new Date().toISOString(),
    };
  }
}

export const documentService = new DocumentService();
