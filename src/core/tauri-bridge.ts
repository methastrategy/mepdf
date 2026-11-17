import { downloadBytes } from '../utils/file-utils';

export interface FileFilter {
  name: string;
  extensions: string[];
}

export interface PlatformBridge {
  isTauri: boolean;
  openFileDialog: (options?: { multi?: boolean; filters?: FileFilter[] }) => Promise<File[] | null>;
  saveFileDialog: (defaultName: string, bytes: Uint8Array) => Promise<boolean>;
  writeNativeFile: (filePath: string, bytes: Uint8Array) => Promise<boolean>;
  readFileFromPath: (filePath: string) => Promise<File | null>;
  getInitialPdfPath: () => Promise<string | null>;
  openExternalUrl: (url: string) => Promise<void>;
  setWindowTitle: (title: string) => Promise<void>;
}

export function isTauriEnvironment(): boolean {
  return (
    typeof window !== 'undefined' &&
    Boolean((window as unknown as { __TAURI_INTERNALS__?: unknown; __TAURI__?: unknown }).__TAURI_INTERNALS__ ||
            (window as unknown as { __TAURI_INTERNALS__?: unknown; __TAURI__?: unknown }).__TAURI__)
  );
}

class TauriBridge implements PlatformBridge {
  public get isTauri(): boolean {
    return isTauriEnvironment();
  }

  public async openFileDialog(options?: { multi?: boolean; filters?: FileFilter[] }): Promise<File[] | null> {
    if (this.isTauri) {
      try {
        const { open } = await import('@tauri-apps/plugin-dialog');
        const { readFile } = await import('@tauri-apps/plugin-fs');

        const filters = options?.filters ?? [
          { name: 'PDF & Images', extensions: ['pdf', 'png', 'jpg', 'jpeg', 'webp'] },
          { name: 'All Files', extensions: ['*'] },
        ];

        const selected = await open({
          multiple: options?.multi ?? true,
          filters,
        });

        if (!selected) return null;
        const paths = Array.isArray(selected) ? selected : [selected];
        const files: File[] = [];

        for (const filePath of paths) {
          const bytes = await readFile(filePath);
          const filename = filePath.split(/[/\\]/).pop() || 'document.pdf';
          const ext = filename.split('.').pop()?.toLowerCase();
          let mimeType = 'application/pdf';
          if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'avif'].includes(ext || '')) {
            mimeType = `image/${ext === 'jpg' ? 'jpeg' : ext}`;
          }
          const file = new File([bytes], filename, { type: mimeType });
          Object.defineProperty(file, 'nativePath', {
            value: filePath,
            writable: false,
            enumerable: true,
          });
          files.push(file);
        }

        return files.length > 0 ? files : null;
      } catch (err) {
        console.warn('Tauri openFileDialog failed, falling back to browser input:', err);
      }
    }

    // Web Browser fallback
    return new Promise<File[] | null>((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.multiple = options?.multi ?? true;
      if (options?.filters && options.filters.length > 0) {
        const acceptList = options.filters
          .flatMap((f) => f.extensions.map((ext) => (ext === '*' ? '*/*' : `.${ext}`)))
          .join(',');
        input.accept = acceptList;
      } else {
        input.accept = '.pdf,image/*';
      }

      input.onchange = () => {
        if (input.files && input.files.length > 0) {
          resolve(Array.from(input.files));
        } else {
          resolve(null);
        }
      };

      input.oncancel = () => {
        resolve(null);
      };

      input.click();
    });
  }

  public async saveFileDialog(defaultName: string, bytes: Uint8Array): Promise<boolean> {
    if (this.isTauri) {
      try {
        const { save } = await import('@tauri-apps/plugin-dialog');
        const { writeFile } = await import('@tauri-apps/plugin-fs');

        const filePath = await save({
          defaultPath: defaultName,
          filters: [
            { name: 'PDF Document', extensions: ['pdf'] },
            { name: 'All Files', extensions: ['*'] },
          ],
        });

        if (!filePath) {
          return false; // User cancelled
        }

        await writeFile(filePath, bytes);
        return true;
      } catch (err) {
        console.warn('Tauri saveFileDialog failed, falling back to browser download:', err);
      }
    }

    // Web Browser fallback
    downloadBytes(bytes, defaultName);
    return true;
  }

  public async writeNativeFile(filePath: string, bytes: Uint8Array): Promise<boolean> {
    if (this.isTauri) {
      try {
        const { writeFile } = await import('@tauri-apps/plugin-fs');
        await writeFile(filePath, bytes);
        return true;
      } catch (err) {
        console.warn('Tauri writeNativeFile failed:', err);
        return false;
      }
    }
    return false;
  }

  public async readFileFromPath(filePath: string): Promise<File | null> {
    if (this.isTauri) {
      try {
        const { readFile } = await import('@tauri-apps/plugin-fs');
        const bytes = await readFile(filePath);
        const filename = filePath.split(/[/\\]/).pop() || 'document.pdf';
        const ext = filename.split('.').pop()?.toLowerCase();
        let mimeType = 'application/pdf';
        if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'avif'].includes(ext || '')) {
          mimeType = `image/${ext === 'jpg' ? 'jpeg' : ext}`;
        }
        const file = new File([bytes], filename, { type: mimeType });
        Object.defineProperty(file, 'nativePath', {
          value: filePath,
          writable: false,
          enumerable: true,
        });
        return file;
      } catch (err) {
        console.warn('Tauri readFileFromPath failed:', err);
      }
    }
    return null;
  }

  public async getInitialPdfPath(): Promise<string | null> {
    if (this.isTauri) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const path = await invoke<string | null>('get_cli_pdf_path');
        return path || null;
      } catch {
        return null;
      }
    }
    return null;
  }

  public async openExternalUrl(url: string): Promise<void> {
    if (typeof window !== 'undefined') {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  }

  public async setWindowTitle(title: string): Promise<void> {
    if (typeof document !== 'undefined') {
      document.title = title;
    }
    if (this.isTauri) {
      try {
        const { getCurrentWindow } = await import('@tauri-apps/api/window');
        await getCurrentWindow().setTitle(title);
      } catch (err) {
        console.warn('Tauri setWindowTitle failed:', err);
      }
    }
  }
}

export const platformBridge: PlatformBridge = new TauriBridge();
