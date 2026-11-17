import { canvasToBlob } from '../utils/file-utils';

export interface CropRect {
  x: number; // Relative 0..1
  y: number; // Relative 0..1
  width: number; // Relative 0..1
  height: number; // Relative 0..1
}

export type PhotoFilterPreset =
  | 'none'
  | 'magic-color'
  | 'bw-clean'
  | 'grayscale'
  | 'sepia'
  | 'invert';

export interface PhotoAdjustmentRecipe {
  crop?: CropRect;
  rotation: number; // In degrees (-180..180 or arbitrary)
  flipH: boolean;
  flipV: boolean;
  brightness: number; // -100..100 (0 = neutral)
  contrast: number; // -100..100 (0 = neutral)
  saturation: number; // -100..100 (0 = neutral)
  sharpness: number; // 0..100 (Unsharp mask strength)
  filterPreset: PhotoFilterPreset;
}

export interface ProcessedPhotoResult {
  dataUrl: string;
  blob: Blob;
  width: number;
  height: number;
}

export interface ImageDataLike {
  readonly data: Uint8ClampedArray;
  readonly width: number;
  readonly height: number;
}

/**
 * Creates an ImageData-compatible buffer safely in any environment (Browser, Worker, Node.js).
 */
export function createImageData(
  width: number,
  height: number,
  data?: Uint8ClampedArray
): ImageDataLike {
  const safeW = Math.max(1, Math.floor(width));
  const safeH = Math.max(1, Math.floor(height));
  if (data) {
    return { width: safeW, height: safeH, data };
  }
  if (typeof ImageData !== 'undefined') {
    return new ImageData(safeW, safeH);
  }
  return {
    width: safeW,
    height: safeH,
    data: new Uint8ClampedArray(safeW * safeH * 4),
  };
}

/**
 * Default non-destructive photo adjustment recipe
 */
export function createDefaultAdjustmentRecipe(): PhotoAdjustmentRecipe {
  return {
    crop: undefined,
    rotation: 0,
    flipH: false,
    flipV: false,
    brightness: 0,
    contrast: 0,
    saturation: 0,
    sharpness: 0,
    filterPreset: 'none',
  };
}

/**
 * Clamps crop coordinates to normalized [0, 1] range to avoid out-of-bounds or zero-size slicing.
 */
export function clampCrop(crop?: CropRect): CropRect | undefined {
  if (!crop) return undefined;
  const x = Math.max(0, Math.min(0.999, crop.x));
  const y = Math.max(0, Math.min(0.999, crop.y));
  const width = Math.max(0.001, Math.min(1 - x, crop.width));
  const height = Math.max(0.001, Math.min(1 - y, crop.height));
  return { x, y, width, height };
}

export interface ResizeCropOptions {
  handle: string; // 'move' | 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'
  deltaX: number;
  deltaY: number;
  rNorm: number | null; // target aspect ratio (width / height in normalized coordinates)
}

/**
 * Resizes or moves a normalized crop rectangle within [0, 1] bounds,
 * maintaining optional aspect ratio constraints without distortion or sticking.
 */
export function resizeCropRect(
  startCrop: CropRect,
  options: ResizeCropOptions
): CropRect {
  const { handle, deltaX, deltaY, rNorm } = options;
  const minDim = 0.02;

  if (handle === 'move') {
    const newX = Math.max(0, Math.min(1 - startCrop.width, startCrop.x + deltaX));
    const newY = Math.max(0, Math.min(1 - startCrop.height, startCrop.y + deltaY));
    return {
      x: Number(newX.toFixed(5)),
      y: Number(newY.toFixed(5)),
      width: Number(startCrop.width.toFixed(5)),
      height: Number(startCrop.height.toFixed(5)),
    };
  }

  // Free aspect ratio resizing
  if (!rNorm || rNorm <= 0) {
    let x = startCrop.x;
    let y = startCrop.y;
    let width = startCrop.width;
    let height = startCrop.height;

    if (handle.includes('e')) {
      width = Math.max(minDim, Math.min(1 - x, startCrop.width + deltaX));
    }
    if (handle.includes('s')) {
      height = Math.max(minDim, Math.min(1 - y, startCrop.height + deltaY));
    }
    if (handle.includes('w')) {
      const right = startCrop.x + startCrop.width;
      x = Math.max(0, Math.min(right - minDim, startCrop.x + deltaX));
      width = right - x;
    }
    if (handle.includes('n')) {
      const bottom = startCrop.y + startCrop.height;
      y = Math.max(0, Math.min(bottom - minDim, startCrop.y + deltaY));
      height = bottom - y;
    }

    return {
      x: Number(x.toFixed(5)),
      y: Number(y.toFixed(5)),
      width: Number(width.toFixed(5)),
      height: Number(height.toFixed(5)),
    };
  }

  // Locked aspect ratio: width = height * rNorm, height = width / rNorm
  if (handle === 'e') {
    const x = startCrop.x;
    let w = Math.max(minDim, Math.min(1 - x, startCrop.width + deltaX));
    let h = w / rNorm;
    if (h > 1) {
      h = 1;
      w = h * rNorm;
    }
    let y = startCrop.y + (startCrop.height - h) / 2;
    if (y < 0) y = 0;
    if (y + h > 1) y = 1 - h;
    return {
      x: Number(x.toFixed(5)),
      y: Number(y.toFixed(5)),
      width: Number(w.toFixed(5)),
      height: Number(h.toFixed(5)),
    };
  }

  if (handle === 'w') {
    const right = startCrop.x + startCrop.width;
    let w = Math.max(minDim, Math.min(right, startCrop.width - deltaX));
    let h = w / rNorm;
    if (h > 1) {
      h = 1;
      w = h * rNorm;
    }
    const x = right - w;
    let y = startCrop.y + (startCrop.height - h) / 2;
    if (y < 0) y = 0;
    if (y + h > 1) y = 1 - h;
    return {
      x: Number(x.toFixed(5)),
      y: Number(y.toFixed(5)),
      width: Number(w.toFixed(5)),
      height: Number(h.toFixed(5)),
    };
  }

  if (handle === 's') {
    const y = startCrop.y;
    let h = Math.max(minDim, Math.min(1 - y, startCrop.height + deltaY));
    let w = h * rNorm;
    if (w > 1) {
      w = 1;
      h = w / rNorm;
    }
    let x = startCrop.x + (startCrop.width - w) / 2;
    if (x < 0) x = 0;
    if (x + w > 1) x = 1 - w;
    return {
      x: Number(x.toFixed(5)),
      y: Number(y.toFixed(5)),
      width: Number(w.toFixed(5)),
      height: Number(h.toFixed(5)),
    };
  }

  if (handle === 'n') {
    const bottom = startCrop.y + startCrop.height;
    let h = Math.max(minDim, Math.min(bottom, startCrop.height - deltaY));
    let w = h * rNorm;
    if (w > 1) {
      w = 1;
      h = w / rNorm;
    }
    const y = bottom - h;
    let x = startCrop.x + (startCrop.width - w) / 2;
    if (x < 0) x = 0;
    if (x + w > 1) x = 1 - w;
    return {
      x: Number(x.toFixed(5)),
      y: Number(y.toFixed(5)),
      width: Number(w.toFixed(5)),
      height: Number(h.toFixed(5)),
    };
  }

  if (handle === 'se') {
    const x = startCrop.x;
    const y = startCrop.y;
    const maxW = 1 - x;
    const maxH = 1 - y;
    const candW = startCrop.width + deltaX;
    const candH = startCrop.height + deltaY;
    let w = Math.abs(deltaX) > Math.abs(deltaY * rNorm) ? candW : candH * rNorm;
    w = Math.max(minDim, Math.min(maxW, maxH * rNorm, w));
    const h = w / rNorm;
    return {
      x: Number(x.toFixed(5)),
      y: Number(y.toFixed(5)),
      width: Number(w.toFixed(5)),
      height: Number(h.toFixed(5)),
    };
  }

  if (handle === 'sw') {
    const right = startCrop.x + startCrop.width;
    const y = startCrop.y;
    const maxW = right;
    const maxH = 1 - y;
    const candW = startCrop.width - deltaX;
    const candH = startCrop.height + deltaY;
    let w = Math.abs(deltaX) > Math.abs(deltaY * rNorm) ? candW : candH * rNorm;
    w = Math.max(minDim, Math.min(maxW, maxH * rNorm, w));
    const h = w / rNorm;
    const x = right - w;
    return {
      x: Number(x.toFixed(5)),
      y: Number(y.toFixed(5)),
      width: Number(w.toFixed(5)),
      height: Number(h.toFixed(5)),
    };
  }

  if (handle === 'ne') {
    const x = startCrop.x;
    const bottom = startCrop.y + startCrop.height;
    const maxW = 1 - x;
    const maxH = bottom;
    const candW = startCrop.width + deltaX;
    const candH = startCrop.height - deltaY;
    let w = Math.abs(deltaX) > Math.abs(deltaY * rNorm) ? candW : candH * rNorm;
    w = Math.max(minDim, Math.min(maxW, maxH * rNorm, w));
    const h = w / rNorm;
    const y = bottom - h;
    return {
      x: Number(x.toFixed(5)),
      y: Number(y.toFixed(5)),
      width: Number(w.toFixed(5)),
      height: Number(h.toFixed(5)),
    };
  }

  if (handle === 'nw') {
    const right = startCrop.x + startCrop.width;
    const bottom = startCrop.y + startCrop.height;
    const maxW = right;
    const maxH = bottom;
    const candW = startCrop.width - deltaX;
    const candH = startCrop.height - deltaY;
    let w = Math.abs(deltaX) > Math.abs(deltaY * rNorm) ? candW : candH * rNorm;
    w = Math.max(minDim, Math.min(maxW, maxH * rNorm, w));
    const h = w / rNorm;
    const x = right - w;
    const y = bottom - h;
    return {
      x: Number(x.toFixed(5)),
      y: Number(y.toFixed(5)),
      width: Number(w.toFixed(5)),
      height: Number(h.toFixed(5)),
    };
  }

  return startCrop;
}

/**
 * Calculates optimal Otsu binarization threshold for document scanning.
 */
export function calculateOtsuThreshold(
  data: Uint8ClampedArray,
  width: number,
  height: number
): number {
  const totalPixels = width * height;
  if (totalPixels === 0) return 128;

  const histogram = new Int32Array(256);
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]!;
    const g = data[i + 1]!;
    const b = data[i + 2]!;
    const gray = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
    histogram[gray] = (histogram[gray] ?? 0) + 1;
  }

  let totalSum = 0;
  for (let t = 0; t < 256; t++) {
    totalSum += t * histogram[t]!;
  }

  let backgroundWeight = 0;
  let backgroundSum = 0;
  let maxVariance = 0;
  let optimalThreshold = 128;

  for (let t = 0; t < 256; t++) {
    backgroundWeight += histogram[t]!;
    if (backgroundWeight === 0) continue;
    const foregroundWeight = totalPixels - backgroundWeight;
    if (foregroundWeight === 0) break;

    backgroundSum += t * histogram[t]!;
    const meanBg = backgroundSum / backgroundWeight;
    const meanFg = (totalSum - backgroundSum) / foregroundWeight;
    const betweenVariance =
      backgroundWeight * foregroundWeight * (meanBg - meanFg) * (meanBg - meanFg);

    if (betweenVariance > maxVariance) {
      maxVariance = betweenVariance;
      optimalThreshold = t;
    }
  }

  // Safety clamp to avoid extreme document edge noise
  return Math.max(60, Math.min(210, optimalThreshold));
}

/**
 * B&W Clean (Adaptive Otsu Binarization)
 * Converts scanned documents into clean, noise-free pure black & white.
 */
export function applyOtsuBinarization(img: ImageDataLike): ImageDataLike {
  const threshold = calculateOtsuThreshold(img.data, img.width, img.height);
  const out = createImageData(img.width, img.height);
  const src = img.data;
  const dst = out.data;

  for (let i = 0; i < src.length; i += 4) {
    const r = src[i]!;
    const g = src[i + 1]!;
    const b = src[i + 2]!;
    const gray = 0.299 * r + 0.587 * g + 0.114 * b;
    const val = gray < threshold ? 0 : 255;
    dst[i] = val;
    dst[i + 1] = val;
    dst[i + 2] = val;
    dst[i + 3] = src[i + 3]!;
  }

  return out;
}

/**
 * Magic Color (CamScanner Pro Document Whitening)
 * Automatically detects paper background white-point, whitens shadows/gray tones,
 * and stretches dynamic range while preserving colored ink (signatures, seals).
 */
export function applyMagicColor(img: ImageDataLike): ImageDataLike {
  const out = createImageData(img.width, img.height);
  const src = img.data;
  const dst = out.data;
  const totalPixels = img.width * img.height;
  if (totalPixels === 0) return out;

  // 1. Build luminance histogram
  const histogram = new Int32Array(256);
  for (let i = 0; i < src.length; i += 4) {
    const y = Math.round(0.299 * src[i]! + 0.587 * src[i + 1]! + 0.114 * src[i + 2]!);
    histogram[y] = (histogram[y] ?? 0) + 1;
  }

  // 2. Determine White Point (around 90th percentile) and Black Point (around 5th percentile)
  let count = 0;
  let p5 = 0;
  let p90 = 255;
  let p5Found = false;
  let p90Found = false;
  const target5 = totalPixels * 0.05;
  const target90 = totalPixels * 0.90;

  for (let i = 0; i < 256; i++) {
    count += histogram[i]!;
    if (!p5Found && count >= target5) {
      p5 = i;
      p5Found = true;
    }
    if (!p90Found && count >= target90) {
      p90 = i;
      p90Found = true;
      break;
    }
  }

  const whitePoint = Math.max(180, Math.min(252, p90));
  const blackPoint = Math.max(0, Math.min(70, p5));
  const range = Math.max(1, whitePoint - blackPoint);

  // 3. Stretch pixels with ink saturation and contrast preservation
  for (let i = 0; i < src.length; i += 4) {
    const r = src[i]!;
    const g = src[i + 1]!;
    const b = src[i + 2]!;
    const a = src[i + 3]!;

    const lum = 0.299 * r + 0.587 * g + 0.114 * b;

    // Detect if color is saturated (e.g. blue pen ink, red official stamp, signature)
    const maxC = Math.max(r, g, b);
    const minC = Math.min(r, g, b);
    const saturationDiff = maxC - minC;
    // A pixel is true colored ink (signature, stamp) if it has high saturation and is not near-white paper
    const isColoredInk = saturationDiff > 32 && lum < whitePoint + 5;

    // Detect paper background: bright pixels or tinted paper (yellowish/grayish background)
    const isPaperBackground =
      lum >= whitePoint - 14 && (!isColoredInk || saturationDiff < 55);

    if (isPaperBackground) {
      // Clean pure paper background
      dst[i] = 255;
      dst[i + 1] = 255;
      dst[i + 2] = 255;
      dst[i + 3] = a;
    } else {
      // Linear stretching with black point offset
      let stretchedLum = ((lum - blackPoint) / range) * 255;
      stretchedLum = Math.max(0, Math.min(255, stretchedLum));

      if (isColoredInk) {
        // Boost colored ink richness
        const gain = lum > 0 ? stretchedLum / lum : 1;
        dst[i] = Math.max(0, Math.min(255, Math.round(r * gain * 1.05)));
        dst[i + 1] = Math.max(0, Math.min(255, Math.round(g * gain * 1.05)));
        dst[i + 2] = Math.max(0, Math.min(255, Math.round(b * gain * 1.05)));
      } else {
        // Dark text sharpening: enhance dark ink contrast
        const inkFactor = Math.pow(stretchedLum / 255, 1.25) * 255;
        const finalVal = Math.round(inkFactor);
        dst[i] = Math.max(0, Math.min(255, finalVal));
        dst[i + 1] = Math.max(0, Math.min(255, finalVal));
        dst[i + 2] = Math.max(0, Math.min(255, finalVal));
      }
      dst[i + 3] = a;
    }
  }

  return out;
}

/**
 * 3x3 Unsharp Mask convolution kernel for text sharpening
 */
export function applyUnsharpMask(img: ImageDataLike, strength: number): ImageDataLike {
  if (strength <= 0) return img;
  const out = createImageData(img.width, img.height);
  const src = img.data;
  const dst = out.data;
  const w = img.width;
  const h = img.height;

  // Sharpness factor (0..100 -> k=0..0.8)
  const k = (Math.max(0, Math.min(100, strength)) / 100) * 0.8;
  const centerWeight = 1 + 4 * k;

  for (let y = 0; y < h; y++) {
    const yTop = y > 0 ? y - 1 : 0;
    const yBottom = y < h - 1 ? y + 1 : h - 1;

    for (let x = 0; x < w; x++) {
      const xLeft = x > 0 ? x - 1 : 0;
      const xRight = x < w - 1 ? x + 1 : w - 1;

      const idx = (y * w + x) * 4;
      const idxT = (yTop * w + x) * 4;
      const idxB = (yBottom * w + x) * 4;
      const idxL = (y * w + xLeft) * 4;
      const idxR = (y * w + xRight) * 4;

      for (let c = 0; c < 3; c++) {
        const val =
          centerWeight * src[idx + c]! -
          k * (src[idxT + c]! + src[idxB + c]! + src[idxL + c]! + src[idxR + c]!);
        dst[idx + c] = Math.max(0, Math.min(255, Math.round(val)));
      }
      dst[idx + 3] = src[idx + 3]!;
    }
  }

  return out;
}

/**
 * Applies brightness, contrast, and saturation adjustments to pixel data.
 */
export function applyColorAdjustments(
  img: ImageDataLike,
  brightness: number,
  contrast: number,
  saturation: number
): ImageDataLike {
  if (brightness === 0 && contrast === 0 && saturation === 0) {
    return img;
  }

  const out = createImageData(img.width, img.height);
  const src = img.data;
  const dst = out.data;

  // Brightness offset in [-255, 255]
  const bOffset = (brightness / 100) * 255;
  // Contrast factor
  const cClamped = Math.max(-100, Math.min(100, contrast));
  const cFactor = (259 * (cClamped + 255)) / (255 * (259 - cClamped));
  // Saturation factor (0 = grayscale, 1 = normal, >1 = saturated)
  const sFactor = 1 + saturation / 100;

  for (let i = 0; i < src.length; i += 4) {
    let r = src[i]!;
    let g = src[i + 1]!;
    let b = src[i + 2]!;

    // 1. Brightness & Contrast
    if (brightness !== 0 || contrast !== 0) {
      r = cFactor * (r + bOffset - 128) + 128;
      g = cFactor * (g + bOffset - 128) + 128;
      b = cFactor * (b + bOffset - 128) + 128;
    }

    // 2. Saturation
    if (saturation !== 0) {
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      r = lum + sFactor * (r - lum);
      g = lum + sFactor * (g - lum);
      b = lum + sFactor * (b - lum);
    }

    dst[i] = Math.max(0, Math.min(255, Math.round(r)));
    dst[i + 1] = Math.max(0, Math.min(255, Math.round(g)));
    dst[i + 2] = Math.max(0, Math.min(255, Math.round(b)));
    dst[i + 3] = src[i + 3]!;
  }

  return out;
}

/**
 * Applies a document/photo preset to pixel data.
 */
export function applyFilterPreset(
  img: ImageDataLike,
  preset: PhotoFilterPreset
): ImageDataLike {
  switch (preset) {
    case 'magic-color':
      return applyMagicColor(img);
    case 'bw-clean':
      return applyOtsuBinarization(img);
    case 'grayscale': {
      const out = createImageData(img.width, img.height);
      const src = img.data;
      const dst = out.data;
      for (let i = 0; i < src.length; i += 4) {
        const gray = Math.round(0.299 * src[i]! + 0.587 * src[i + 1]! + 0.114 * src[i + 2]!);
        dst[i] = gray;
        dst[i + 1] = gray;
        dst[i + 2] = gray;
        dst[i + 3] = src[i + 3]!;
      }
      return out;
    }
    case 'sepia': {
      const out = createImageData(img.width, img.height);
      const src = img.data;
      const dst = out.data;
      for (let i = 0; i < src.length; i += 4) {
        const r = src[i]!;
        const g = src[i + 1]!;
        const b = src[i + 2]!;
        dst[i] = Math.min(255, Math.round(0.393 * r + 0.769 * g + 0.189 * b));
        dst[i + 1] = Math.min(255, Math.round(0.349 * r + 0.686 * g + 0.168 * b));
        dst[i + 2] = Math.min(255, Math.round(0.272 * r + 0.534 * g + 0.131 * b));
        dst[i + 3] = src[i + 3]!;
      }
      return out;
    }
    case 'invert': {
      const out = createImageData(img.width, img.height);
      const src = img.data;
      const dst = out.data;
      for (let i = 0; i < src.length; i += 4) {
        dst[i] = 255 - src[i]!;
        dst[i + 1] = 255 - src[i + 1]!;
        dst[i + 2] = 255 - src[i + 2]!;
        dst[i + 3] = src[i + 3]!;
      }
      return out;
    }
    case 'none':
    default:
      return img;
  }
}

/**
 * Complete pixel processing pipeline for a non-destructive recipe
 */
export function processImageData(
  source: ImageDataLike,
  recipe: PhotoAdjustmentRecipe
): ImageDataLike {
  let curr = applyFilterPreset(source, recipe.filterPreset);
  curr = applyColorAdjustments(
    curr,
    recipe.brightness,
    recipe.contrast,
    recipe.saturation
  );
  if (recipe.sharpness > 0) {
    curr = applyUnsharpMask(curr, recipe.sharpness);
  }
  return curr;
}

let photoWorkerInstance: Worker | null = null;
let reqId = 0;

/**
 * Offloads heavy image processing to Web Worker with zero-copy ArrayBuffer transfer,
 * falling back gracefully to main-thread processing when Worker is unsupported or fails.
 */
export async function processImageDataAsync(
  img: ImageDataLike,
  recipe: PhotoAdjustmentRecipe
): Promise<ImageDataLike> {
  if (typeof window === 'undefined' || typeof Worker === 'undefined') {
    return processImageData(img, recipe);
  }

  try {
    if (!photoWorkerInstance) {
      photoWorkerInstance = new Worker(
        new URL('../workers/photo-worker.ts', import.meta.url),
        { type: 'module' }
      );
    }

    const id = `pw_${++reqId}_${Date.now()}`;
    const copyBuffer = img.data.slice().buffer;

    return await new Promise<ImageDataLike>((resolve, reject) => {
      let settled = false;

      const cleanup = () => {
        photoWorkerInstance?.removeEventListener('message', handler);
        photoWorkerInstance?.removeEventListener('error', errorHandler);
        clearTimeout(timer);
      };

      const handler = (e: MessageEvent) => {
        if (e.data?.id !== id) return;
        if (settled) return;
        settled = true;
        cleanup();

        if (e.data.type === 'SUCCESS') {
          const res = e.data.data;
          resolve(
            createImageData(
              res.width,
              res.height,
              new Uint8ClampedArray(res.buffer)
            )
          );
        } else {
          reject(new Error(e.data?.error || 'Worker processing failed'));
        }
      };

      const errorHandler = (err: ErrorEvent) => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(err);
      };

      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(new Error('Photo worker processing timed out'));
      }, 5000);

      photoWorkerInstance?.addEventListener('message', handler);
      photoWorkerInstance?.addEventListener('error', errorHandler);

      try {
        photoWorkerInstance?.postMessage(
          {
            id,
            type: 'PROCESS_IMAGE_DATA',
            payload: {
              width: img.width,
              height: img.height,
              buffer: copyBuffer,
              recipe,
            },
          },
          [copyBuffer]
        );
      } catch {
        photoWorkerInstance?.postMessage({
          id,
          type: 'PROCESS_IMAGE_DATA',
          payload: {
            width: img.width,
            height: img.height,
            buffer: copyBuffer,
            recipe,
          },
        });
      }
    });
  } catch (err) {
    console.warn('Photo worker fallback to main thread:', err);
    return processImageData(img, recipe);
  }
}

/**
 * Loads an image from a URL or Blob into an HTMLImageElement
 */
export function loadImageElement(source: string | Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    if (typeof Image === 'undefined') {
      reject(new Error('Image constructor not available'));
      return;
    }
    const img = new Image();
    const isBlob = typeof source !== 'string';
    const url = isBlob ? URL.createObjectURL(source) : source;

    img.onload = () => {
      if (isBlob) URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = (err) => {
      if (isBlob) URL.revokeObjectURL(url);
      reject(err);
    };
    img.src = url;
  });
}

/**
 * Renders an image or canvas through rotation, flip, crop, and pixel adjustments onto a new canvas.
 */
export function renderRecipeToCanvas(
  source: HTMLImageElement | HTMLCanvasElement | ImageBitmap,
  recipe: PhotoAdjustmentRecipe
): HTMLCanvasElement {
  if (typeof document === 'undefined') {
    throw new Error('renderRecipeToCanvas requires DOM canvas environment');
  }

  const rawWidth = 'naturalWidth' in source ? source.naturalWidth || source.width : source.width;
  const rawHeight = 'naturalHeight' in source ? source.naturalHeight || source.height : source.height;
  const srcWidth = Math.max(1, rawWidth || 1);
  const srcHeight = Math.max(1, rawHeight || 1);

  // 1. Calculate rotation and bounding dimensions
  const rotRad = (recipe.rotation * Math.PI) / 180;
  const cos = Math.abs(Math.cos(rotRad));
  const sin = Math.abs(Math.sin(rotRad));
  const rotWidth = Math.max(1, Math.round(srcWidth * cos + srcHeight * sin));
  const rotHeight = Math.max(1, Math.round(srcWidth * sin + srcHeight * cos));

  const rotCanvas = document.createElement('canvas');
  rotCanvas.width = rotWidth;
  rotCanvas.height = rotHeight;
  const rotCtx = rotCanvas.getContext('2d', { willReadFrequently: true });
  if (!rotCtx) throw new Error('Failed to create 2d canvas context');

  // Fill with clean white backdrop to avoid transparent artifact fringing
  rotCtx.fillStyle = '#ffffff';
  rotCtx.fillRect(0, 0, rotWidth, rotHeight);

  // Apply center transform, rotation, and flips
  rotCtx.save();
  rotCtx.translate(rotWidth / 2, rotHeight / 2);
  rotCtx.rotate(rotRad);
  rotCtx.scale(recipe.flipH ? -1 : 1, recipe.flipV ? -1 : 1);
  rotCtx.drawImage(source, -srcWidth / 2, -srcHeight / 2);
  rotCtx.restore();

  // 2. Non-destructive Crop
  const clampedCrop = clampCrop(recipe.crop);
  let finalCanvas: HTMLCanvasElement;

  if (clampedCrop) {
    const cropX = Math.round(clampedCrop.x * rotWidth);
    const cropY = Math.round(clampedCrop.y * rotHeight);
    const cropW = Math.max(1, Math.min(rotWidth - cropX, Math.round(clampedCrop.width * rotWidth)));
    const cropH = Math.max(1, Math.min(rotHeight - cropY, Math.round(clampedCrop.height * rotHeight)));

    finalCanvas = document.createElement('canvas');
    finalCanvas.width = cropW;
    finalCanvas.height = cropH;
    const finalCtx = finalCanvas.getContext('2d', { willReadFrequently: true });
    if (!finalCtx) throw new Error('Failed to create final 2d context');

    finalCtx.drawImage(rotCanvas, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

    // Free intermediate canvas
    rotCanvas.width = 0;
    rotCanvas.height = 0;
  } else {
    finalCanvas = rotCanvas;
  }

  // 3. Pixel Enhancement Pipeline (Filters, Magic Color, Sharpening)
  const finalCtx = finalCanvas.getContext('2d', { willReadFrequently: true });
  if (finalCtx) {
    const imgData = finalCtx.getImageData(0, 0, finalCanvas.width, finalCanvas.height);
    const processed = processImageData(imgData, recipe);
    // Put back into canvas
    if (typeof ImageData !== 'undefined' && processed instanceof ImageData) {
      finalCtx.putImageData(processed, 0, 0);
    } else {
      const targetData = finalCtx.createImageData(finalCanvas.width, finalCanvas.height);
      targetData.data.set(processed.data);
      finalCtx.putImageData(targetData, 0, 0);
    }
  }

  return finalCanvas;
}

/**
 * Renders an image or canvas through geometry transform and asynchronous worker pixel adjustments.
 */
export async function renderRecipeToCanvasAsync(
  source: HTMLImageElement | HTMLCanvasElement | ImageBitmap,
  recipe: PhotoAdjustmentRecipe
): Promise<HTMLCanvasElement> {
  const geomRecipe: PhotoAdjustmentRecipe = {
    ...recipe,
    brightness: 0,
    contrast: 0,
    saturation: 0,
    sharpness: 0,
    filterPreset: 'none',
  };
  const canvas = renderRecipeToCanvas(source, geomRecipe);

  const hasPixelChanges =
    recipe.filterPreset !== 'none' ||
    recipe.brightness !== 0 ||
    recipe.contrast !== 0 ||
    recipe.saturation !== 0 ||
    recipe.sharpness > 0;

  if (hasPixelChanges) {
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (ctx) {
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const processed = await processImageDataAsync(imgData, recipe);
      if (typeof ImageData !== 'undefined' && processed instanceof ImageData) {
        ctx.putImageData(processed, 0, 0);
      } else {
        const targetData = ctx.createImageData(canvas.width, canvas.height);
        targetData.data.set(processed.data);
        ctx.putImageData(targetData, 0, 0);
      }
    }
  }

  return canvas;
}

/**
 * End-to-end photo processing function that outputs high-resolution Blob and DataURL
 */
export async function processPhoto(
  source: HTMLImageElement | HTMLCanvasElement | ImageBitmap | string,
  recipe: PhotoAdjustmentRecipe,
  options: {
    format?: 'image/png' | 'image/jpeg' | 'image/webp';
    quality?: number;
  } = {}
): Promise<ProcessedPhotoResult> {
  let imgElement: HTMLImageElement | HTMLCanvasElement | ImageBitmap;
  if (typeof source === 'string') {
    imgElement = await loadImageElement(source);
  } else {
    imgElement = source;
  }

  const canvas = await renderRecipeToCanvasAsync(imgElement, recipe);
  const format = options.format || 'image/png';
  const quality = options.quality !== undefined ? options.quality : 0.95;

  const blob = await canvasToBlob(canvas, format, quality);
  const dataUrl = canvas.toDataURL(format, quality);
  const width = canvas.width;
  const height = canvas.height;

  // Clean up canvas
  canvas.width = 0;
  canvas.height = 0;

  return {
    dataUrl,
    blob,
    width,
    height,
  };
}
