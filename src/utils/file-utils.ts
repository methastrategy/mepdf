/**
 * Formats a byte number into human-readable string (KB, MB, GB)
 */
export function formatBytes(bytes: number, decimals = 1): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i] ?? 'B'}`;
}

/**
 * Triggers a client-side file download for a Blob
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Triggers a client-side file download for a Uint8Array byte array
 */
export function downloadBytes(
  bytes: Uint8Array,
  filename: string,
  mimeType = 'application/pdf'
): void {
  const blob = new Blob([bytes as unknown as BlobPart], { type: mimeType });
  downloadBlob(blob, filename);
}

/**
 * Reads a File object into a Uint8Array
 */
export async function readFileAsUint8Array(file: File): Promise<Uint8Array> {
  const arrayBuffer = await file.arrayBuffer();
  return new Uint8Array(arrayBuffer);
}

/**
 * Generates a clean filename base without extension
 */
export function getFileBaseName(filename: string): string {
  return filename.replace(/\.[^/.]+$/, '');
}

/**
 * Safely escapes HTML special characters to prevent DOM-based XSS attacks
 */
export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Safely converts an HTMLCanvasElement to a Blob with fallback to toDataURL.
 */
export async function canvasToBlob(
  canvas: HTMLCanvasElement,
  mimeType = 'image/png',
  quality?: number
): Promise<Blob> {
  if (typeof canvas.toBlob === 'function') {
    try {
      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob((b) => resolve(b), mimeType, quality);
      });
      if (blob) return blob;
    } catch {
      // Fall through to toDataURL fallback
    }
  }

  // Universal fallback using toDataURL
  const dataUrl = canvas.toDataURL(mimeType, quality);
  const commaIdx = dataUrl.indexOf(',');
  const binStr = atob(commaIdx >= 0 ? dataUrl.slice(commaIdx + 1) : dataUrl);
  const len = binStr.length;
  const arr = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    arr[i] = binStr.charCodeAt(i);
  }
  return new Blob([arr], { type: mimeType });
}

