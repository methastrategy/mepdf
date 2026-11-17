import {
  processImageData,
  createImageData,
  type PhotoAdjustmentRecipe,
} from '../core/photo-processor';

export interface PhotoWorkerRequest {
  id: string;
  type: 'PROCESS_IMAGE_DATA';
  payload: {
    width: number;
    height: number;
    buffer: ArrayBuffer;
    recipe: PhotoAdjustmentRecipe;
  };
}

export interface PhotoWorkerResponseSuccess {
  id: string;
  type: 'SUCCESS';
  data: {
    width: number;
    height: number;
    buffer: ArrayBuffer;
  };
}

export interface PhotoWorkerResponseError {
  id: string;
  type: 'ERROR';
  error: string;
}

export type PhotoWorkerResponse = PhotoWorkerResponseSuccess | PhotoWorkerResponseError;

if (typeof self !== 'undefined' && 'addEventListener' in self) {
  self.addEventListener('message', (event: MessageEvent<PhotoWorkerRequest>) => {
    const { id, type, payload } = event.data;
    if (type !== 'PROCESS_IMAGE_DATA') return;

    try {
      const { width, height, buffer, recipe } = payload;
      const data = new Uint8ClampedArray(buffer);
      const img = createImageData(width, height, data);

      const processed = processImageData(img, recipe);

      // Ensure buffer is contiguous and safe for zero-copy transfer
      let transferBuf: ArrayBuffer;
      if (
        processed.data.byteOffset === 0 &&
        processed.data.byteLength === processed.data.buffer.byteLength
      ) {
        transferBuf = processed.data.buffer as ArrayBuffer;
      } else {
        transferBuf = processed.data.slice().buffer;
      }

      const response: PhotoWorkerResponseSuccess = {
        id,
        type: 'SUCCESS',
        data: {
          width: processed.width,
          height: processed.height,
          buffer: transferBuf,
        },
      };

      try {
        (self as unknown as Worker).postMessage(response, [transferBuf]);
      } catch {
        (self as unknown as Worker).postMessage(response);
      }
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      const errorResponse: PhotoWorkerResponseError = {
        id,
        type: 'ERROR',
        error: errorMsg,
      };
      (self as unknown as Worker).postMessage(errorResponse);
    }
  });
}
