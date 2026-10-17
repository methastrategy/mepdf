import { supabase } from './supabase-client';
import { authService, FREE_STORAGE_LIMIT } from './auth-service';

export interface StorageUploadResult {
  storageKey: string;
  downloadUrl: string;
}

export class StorageQuotaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StorageQuotaError';
  }
}

class StorageService {
  private readonly BUCKET_NAME = 'documents';

  /**
   * Evaluates if the current user has enough quota left to store the file
   */
  checkQuota(fileSizeBytes: number): { allowed: boolean; remainingBytes: number; limitBytes: number } {
    const user = authService.getCurrentUser();
    const limit = user ? user.storageLimitBytes : FREE_STORAGE_LIMIT;
    const used = user ? user.storageUsedBytes : 0;
    const remaining = Math.max(0, limit - used);

    return {
      allowed: used + fileSizeBytes <= limit,
      remainingBytes: remaining,
      limitBytes: limit,
    };
  }

  /**
   * Uploads PDF bytes to the cloud storage bucket
   */
  async uploadPdf(fileBytes: Uint8Array, filename: string, userId: string): Promise<StorageUploadResult> {
    const quota = this.checkQuota(fileBytes.length);
    if (!quota.allowed) {
      throw new StorageQuotaError(
        `Cloud storage quota exceeded. Remaining: ${(quota.remainingBytes / (1024 * 1024)).toFixed(1)} MB`
      );
    }

    const sanitizedName = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    const storageKey = `${userId}/${Date.now()}_${sanitizedName}`;

    // Upload using Supabase storage (or mock adapter)
    const { error: uploadError } = await supabase.storage
      .from(this.BUCKET_NAME)
      .upload(storageKey, fileBytes, {
        contentType: 'application/pdf',
        upsert: true,
      });

    if (uploadError) {
      throw new Error(`Upload failed: ${uploadError.message}`);
    }

    // Generate signed download URL (valid for 24 hours / 86400 seconds)
    const downloadUrl = await this.getSignedUrl(storageKey, 86400);

    // Update user's storage quota
    await authService.updateStorageUsage(fileBytes.length);

    return {
      storageKey,
      downloadUrl,
    };
  }

  /**
   * Downloads PDF bytes from the cloud bucket
   */
  async downloadPdf(storageKey: string): Promise<Uint8Array> {
    const { data, error } = await supabase.storage
      .from(this.BUCKET_NAME)
      .download(storageKey);

    if (error || !data) {
      throw new Error(`Failed to download file: ${error?.message || 'Empty response'}`);
    }

    const arrayBuffer = await data.arrayBuffer();
    return new Uint8Array(arrayBuffer);
  }

  /**
   * Retrieves a signed temporary download URL for the file
   */
  async getSignedUrl(storageKey: string, expiresInSeconds = 3600): Promise<string> {
    try {
      const res = await (supabase.storage.from(this.BUCKET_NAME) as any).createSignedUrl(
        storageKey,
        expiresInSeconds
      );
      if (res?.data?.signedUrl) {
        return res.data.signedUrl;
      }
    } catch {
      // Fallback
    }
    return '#';
  }

  /**
   * Removes a file from cloud storage and credits back user quota
   */
  async deletePdf(storageKey: string, sizeBytes?: number): Promise<void> {
    const { error } = await supabase.storage
      .from(this.BUCKET_NAME)
      .remove([storageKey]);

    if (error) {
      console.warn(`Storage file removal warning for ${storageKey}:`, error);
    }

    if (typeof sizeBytes === 'number' && sizeBytes > 0) {
      await authService.updateStorageUsage(-sizeBytes);
    }
  }
}

export const storageService = new StorageService();
