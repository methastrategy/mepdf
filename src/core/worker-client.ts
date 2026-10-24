import type {
  PDFPageItem,
  DocumentMetadata,
  ProgressCallback,
  CompressionResult,
  WatermarkOptions,
  PageNumberOptions,
  PDFInfoMetadata,
} from './types';
import type {
  WorkerTaskRequest,
  WorkerTaskResponse,
  WorkerPageDescriptor,
} from '../workers/pdf-worker';

// Main-thread fallback imports
import {
  mergePages as fallbackMergePages,
  splitPagesByRanges as fallbackSplitPages,
  protectPdf as fallbackProtectPdf,
  addWatermarkToPdf as fallbackWatermark,
  addPageNumbersToPdf as fallbackPageNumbers,
  updatePdfMetadata as fallbackUpdateMetadata,
} from './pdf-operations';
import { compressPdfLossless as fallbackCompressLossless } from './pdf-compressor';

interface PendingRequest {
  resolve: (data: unknown) => void;
  reject: (err: Error) => void;
  onProgress?: ProgressCallback;
}

class PdfWorkerClient {
  private worker: Worker | null = null;
  private pending = new Map<string, PendingRequest>();
  private reqIdCounter = 0;
  private isWorkerSupported = true;

  constructor() {
    this.initWorker();
  }

  private initWorker(): void {
    if (typeof window === 'undefined' || typeof Worker === 'undefined') {
      this.isWorkerSupported = false;
      return;
    }

    try {
      this.worker = new Worker(new URL('../workers/pdf-worker.ts', import.meta.url), {
        type: 'module',
      });

      this.worker.onmessage = (event: MessageEvent<WorkerTaskResponse>) => {
        const msg = event.data;
        const entry = this.pending.get(msg.id);
        if (!entry) return;

        if (msg.type === 'PROGRESS') {
          if (entry.onProgress) {
            entry.onProgress({
              stage: msg.stage,
              current: msg.current,
              total: msg.total,
              percent: msg.percent,
            });
          }
        } else if (msg.type === 'SUCCESS') {
          this.pending.delete(msg.id);
          entry.resolve(msg.data);
        } else if (msg.type === 'ERROR') {
          this.pending.delete(msg.id);
          entry.reject(new Error(msg.error));
        }
      };

      this.worker.onerror = (err) => {
        console.warn('PDF Worker encountered an error, falling back to main-thread processing.', err);
        // Reject all pending with error to trigger fallback
        for (const [id, entry] of this.pending) {
          entry.reject(new Error('Worker crashed'));
          this.pending.delete(id);
        }
        this.terminate();
        this.isWorkerSupported = false;
      };
    } catch (e) {
      console.warn('Unable to initialize Web Worker, using main-thread fallback.', e);
      this.isWorkerSupported = false;
    }
  }

  private nextId(): string {
    return `req_${++this.reqIdCounter}_${Date.now()}`;
  }

  private send<T>(
    req: WorkerTaskRequest,
    transfer: Transferable[] = [],
    onProgress?: ProgressCallback
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      if (!this.worker || !this.isWorkerSupported) {
        return reject(new Error('Worker not available'));
      }

      this.pending.set(req.id, {
        resolve: (data) => resolve(data as T),
        reject,
        onProgress,
      });

      try {
        this.worker.postMessage(req, transfer);
      } catch (err) {
        this.pending.delete(req.id);
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
  }

  public terminate(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    this.pending.clear();
  }

  // -------------------------------------------------------------
  // PUBLIC HIGH-LEVEL WORKER METHODS (WITH SAFE FALLBACK)
  // -------------------------------------------------------------

  public async mergePages(
    pages: PDFPageItem[],
    documentMap: Map<string, DocumentMetadata>,
    onProgress?: ProgressCallback
  ): Promise<Uint8Array> {
    if (!this.isWorkerSupported || !this.worker) {
      return fallbackMergePages(pages, documentMap, onProgress);
    }

    try {
      const pageDescriptors: WorkerPageDescriptor[] = pages.map((p) => ({
        id: p.id,
        docId: p.docId,
        pageIndex: p.pageIndex,
        rotation: p.rotation,
      }));

      const docRecords: Record<string, Uint8Array> = {};
      const transferList: Transferable[] = [];

      for (const [id, meta] of documentMap) {
        // Send a copy slice so source bytes in memory are not detached
        const copy = new Uint8Array(meta.fileBytes);
        docRecords[id] = copy;
        transferList.push(copy.buffer);
      }

      const id = this.nextId();
      return await this.send<Uint8Array>(
        {
          id,
          type: 'MERGE_PAGES',
          payload: {
            pages: pageDescriptors,
            documents: docRecords,
          },
        },
        transferList,
        onProgress
      );
    } catch {
      // Graceful fallback to main thread
      return fallbackMergePages(pages, documentMap, onProgress);
    }
  }

  public async splitPagesByRanges(
    pages: PDFPageItem[],
    documentMap: Map<string, DocumentMetadata>,
    rangeString: string,
    baseFilename = 'split',
    onProgress?: ProgressCallback
  ): Promise<{ filename: string; bytes: Uint8Array }[]> {
    if (!this.isWorkerSupported || !this.worker) {
      return fallbackSplitPages(pages, documentMap, rangeString, baseFilename, onProgress);
    }

    try {
      const pageDescriptors: WorkerPageDescriptor[] = pages.map((p) => ({
        id: p.id,
        docId: p.docId,
        pageIndex: p.pageIndex,
        rotation: p.rotation,
      }));

      const docRecords: Record<string, Uint8Array> = {};
      const transferList: Transferable[] = [];

      for (const [id, meta] of documentMap) {
        const copy = new Uint8Array(meta.fileBytes);
        docRecords[id] = copy;
        transferList.push(copy.buffer);
      }

      const id = this.nextId();
      return await this.send<{ filename: string; bytes: Uint8Array }[]>(
        {
          id,
          type: 'SPLIT_PAGES',
          payload: {
            pages: pageDescriptors,
            documents: docRecords,
            rangeString,
            baseFilename,
          },
        },
        transferList,
        onProgress
      );
    } catch {
      return fallbackSplitPages(pages, documentMap, rangeString, baseFilename, onProgress);
    }
  }

  public async compressLossless(
    fileBytes: Uint8Array,
    onProgress?: ProgressCallback
  ): Promise<CompressionResult> {
    if (!this.isWorkerSupported || !this.worker) {
      return fallbackCompressLossless(fileBytes, onProgress);
    }

    try {
      const copy = new Uint8Array(fileBytes);
      const id = this.nextId();
      return await this.send<CompressionResult>(
        {
          id,
          type: 'COMPRESS_LOSSLESS',
          payload: { fileBytes: copy },
        },
        [copy.buffer],
        onProgress
      );
    } catch {
      return fallbackCompressLossless(fileBytes, onProgress);
    }
  }

  public async watermarkPdf(
    fileBytes: Uint8Array,
    options: WatermarkOptions,
    onProgress?: ProgressCallback
  ): Promise<Uint8Array> {
    // If watermark has custom image, fallback to main thread because image embedding can involve canvas
    if (options.type === 'image' || !this.isWorkerSupported || !this.worker) {
      return fallbackWatermark(fileBytes, options, onProgress);
    }

    try {
      const copy = new Uint8Array(fileBytes);
      const id = this.nextId();
      return await this.send<Uint8Array>(
        {
          id,
          type: 'WATERMARK_PDF',
          payload: { fileBytes: copy, options },
        },
        [copy.buffer],
        onProgress
      );
    } catch {
      return fallbackWatermark(fileBytes, options, onProgress);
    }
  }

  public async pageNumbers(
    fileBytes: Uint8Array,
    options: PageNumberOptions,
    onProgress?: ProgressCallback
  ): Promise<Uint8Array> {
    if (!this.isWorkerSupported || !this.worker) {
      return fallbackPageNumbers(fileBytes, options, onProgress);
    }

    try {
      const copy = new Uint8Array(fileBytes);
      const id = this.nextId();
      return await this.send<Uint8Array>(
        {
          id,
          type: 'PAGE_NUMBERS',
          payload: { fileBytes: copy, options },
        },
        [copy.buffer],
        onProgress
      );
    } catch {
      return fallbackPageNumbers(fileBytes, options, onProgress);
    }
  }

  public async protectPdf(
    fileBytes: Uint8Array,
    userPassword: string,
    ownerPassword?: string
  ): Promise<Uint8Array> {
    if (!this.isWorkerSupported || !this.worker) {
      return fallbackProtectPdf(fileBytes, userPassword, ownerPassword);
    }

    try {
      const copy = new Uint8Array(fileBytes);
      const id = this.nextId();
      return await this.send<Uint8Array>(
        {
          id,
          type: 'PROTECT_PDF',
          payload: { fileBytes: copy, userPassword, ownerPassword },
        },
        [copy.buffer]
      );
    } catch {
      return fallbackProtectPdf(fileBytes, userPassword, ownerPassword);
    }
  }

  public async updatePdfMetadata(
    fileBytes: Uint8Array,
    metadata: PDFInfoMetadata,
    sanitizeAll = false
  ): Promise<Uint8Array> {
    if (!this.isWorkerSupported || !this.worker) {
      return fallbackUpdateMetadata(fileBytes, metadata, sanitizeAll);
    }

    try {
      const copy = new Uint8Array(fileBytes);
      const id = this.nextId();
      return await this.send<Uint8Array>(
        {
          id,
          type: 'UPDATE_METADATA',
          payload: { fileBytes: copy, metadata, sanitizeAll },
        },
        [copy.buffer]
      );
    } catch {
      return fallbackUpdateMetadata(fileBytes, metadata, sanitizeAll);
    }
  }
}

export const pdfWorker = new PdfWorkerClient();
