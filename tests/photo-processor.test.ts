import { describe, it, expect } from 'vitest';
import {
  createDefaultAdjustmentRecipe,
  clampCrop,
  resizeCropRect,
  calculateOtsuThreshold,
  applyOtsuBinarization,
  applyMagicColor,
  applyUnsharpMask,
  applyColorAdjustments,
  applyFilterPreset,
  processImageData,
  processImageDataAsync,
  createImageData,
  type ImageDataLike,
  type PhotoAdjustmentRecipe,
} from '../src/core/photo-processor';

describe('Photo Processor Core Engine', () => {
  describe('createDefaultAdjustmentRecipe', () => {
    it('creates neutral default recipe with zero destructive offsets', () => {
      const recipe = createDefaultAdjustmentRecipe();
      expect(recipe.crop).toBeUndefined();
      expect(recipe.rotation).toBe(0);
      expect(recipe.flipH).toBe(false);
      expect(recipe.flipV).toBe(false);
      expect(recipe.brightness).toBe(0);
      expect(recipe.contrast).toBe(0);
      expect(recipe.saturation).toBe(0);
      expect(recipe.sharpness).toBe(0);
      expect(recipe.filterPreset).toBe('none');
    });
  });

  describe('clampCrop', () => {
    it('returns undefined if crop is not specified', () => {
      expect(clampCrop(undefined)).toBeUndefined();
    });

    it('preserves valid normalized crop coordinates', () => {
      const valid = { x: 0.1, y: 0.2, width: 0.5, height: 0.6 };
      expect(clampCrop(valid)).toEqual(valid);
    });

    it('clamps negative and out-of-bounds coordinates safely', () => {
      const clamped = clampCrop({ x: -0.5, y: -0.2, width: 1.5, height: 2.0 });
      expect(clamped).toBeDefined();
      expect(clamped!.x).toBe(0);
      expect(clamped!.y).toBe(0);
      expect(clamped!.width).toBe(1);
      expect(clamped!.height).toBe(1);
    });

    it('clamps crop boundary so that x + width <= 1 and y + height <= 1', () => {
      const clamped = clampCrop({ x: 0.8, y: 0.7, width: 0.5, height: 0.5 });
      expect(clamped).toBeDefined();
      expect(clamped!.x).toBe(0.8);
      expect(clamped!.y).toBe(0.7);
      expect(clamped!.width).toBeCloseTo(0.2, 5);
      expect(clamped!.height).toBeCloseTo(0.3, 5);
    });

    it('enforces minimum positive width and height', () => {
      const clamped = clampCrop({ x: 0.5, y: 0.5, width: 0, height: -0.1 });
      expect(clamped).toBeDefined();
      expect(clamped!.width).toBeGreaterThan(0);
      expect(clamped!.height).toBeGreaterThan(0);
    });
  });

  describe('resizeCropRect', () => {
    const initialCrop = { x: 0.2, y: 0.2, width: 0.6, height: 0.4 };

    it('handles "move" handle within bounds without changing dimensions', () => {
      const moved = resizeCropRect(initialCrop, {
        handle: 'move',
        deltaX: 0.1,
        deltaY: 0.05,
        rNorm: null,
      });
      expect(moved.x).toBeCloseTo(0.3, 4);
      expect(moved.y).toBeCloseTo(0.25, 4);
      expect(moved.width).toBeCloseTo(0.6, 4);
      expect(moved.height).toBeCloseTo(0.4, 4);
    });

    it('clamps "move" handle within [0, 1] bounds', () => {
      const moved = resizeCropRect(initialCrop, {
        handle: 'move',
        deltaX: 0.9,
        deltaY: -0.5,
        rNorm: null,
      });
      expect(moved.x).toBeCloseTo(0.4, 4); // 1 - 0.6
      expect(moved.y).toBeCloseTo(0.0, 4);
    });

    it('resizes freely with edge handles in free mode', () => {
      const resizedE = resizeCropRect(initialCrop, {
        handle: 'e',
        deltaX: 0.1,
        deltaY: 0,
        rNorm: null,
      });
      expect(resizedE.width).toBeCloseTo(0.7, 4);
      expect(resizedE.x).toBeCloseTo(0.2, 4);

      const resizedS = resizeCropRect(initialCrop, {
        handle: 's',
        deltaX: 0,
        deltaY: 0.1,
        rNorm: null,
      });
      expect(resizedS.height).toBeCloseTo(0.5, 4);
      expect(resizedS.y).toBeCloseTo(0.2, 4);

      const resizedW = resizeCropRect(initialCrop, {
        handle: 'w',
        deltaX: 0.05,
        deltaY: 0,
        rNorm: null,
      });
      expect(resizedW.x).toBeCloseTo(0.25, 4);
      expect(resizedW.width).toBeCloseTo(0.55, 4);

      const resizedN = resizeCropRect(initialCrop, {
        handle: 'n',
        deltaX: 0,
        deltaY: 0.05,
        rNorm: null,
      });
      expect(resizedN.y).toBeCloseTo(0.25, 4);
      expect(resizedN.height).toBeCloseTo(0.35, 4);
    });

    it('resizes with 1:1 locked aspect ratio from edge handles correctly', () => {
      // 1:1 ratio: rNorm = 1.0
      const startSquare = { x: 0.2, y: 0.2, width: 0.4, height: 0.4 };

      // Drag east handle: width expands, height follows and stays centered vertically
      const resE = resizeCropRect(startSquare, {
        handle: 'e',
        deltaX: 0.1,
        deltaY: 0,
        rNorm: 1.0,
      });
      expect(resE.width).toBeCloseTo(0.5, 4);
      expect(resE.height).toBeCloseTo(0.5, 4);
      expect(resE.width / resE.height).toBeCloseTo(1.0, 4);

      // Drag south handle: height expands, width follows and stays centered horizontally
      const resS = resizeCropRect(startSquare, {
        handle: 's',
        deltaX: 0,
        deltaY: 0.1,
        rNorm: 1.0,
      });
      expect(resS.height).toBeCloseTo(0.5, 4);
      expect(resS.width).toBeCloseTo(0.5, 4);
      expect(resS.width / resS.height).toBeCloseTo(1.0, 4);
    });

    it('resizes with corner handles maintaining aspect ratio from anchored corners', () => {
      const startSquare = { x: 0.2, y: 0.2, width: 0.4, height: 0.4 };

      // SE corner: top-left (0.2, 0.2) is anchored
      const resSE = resizeCropRect(startSquare, {
        handle: 'se',
        deltaX: 0.1,
        deltaY: 0.1,
        rNorm: 1.0,
      });
      expect(resSE.x).toBeCloseTo(0.2, 4);
      expect(resSE.y).toBeCloseTo(0.2, 4);
      expect(resSE.width).toBeCloseTo(0.5, 4);
      expect(resSE.height).toBeCloseTo(0.5, 4);

      // NW corner: bottom-right (0.6, 0.6) is anchored
      const resNW = resizeCropRect(startSquare, {
        handle: 'nw',
        deltaX: -0.1,
        deltaY: -0.1,
        rNorm: 1.0,
      });
      expect(resNW.x + resNW.width).toBeCloseTo(0.6, 4);
      expect(resNW.y + resNW.height).toBeCloseTo(0.6, 4);
      expect(resNW.width / resNW.height).toBeCloseTo(1.0, 4);
    });
  });

  describe('Otsu Binarization', () => {
    it('accurately separates bimodal distribution into dark foreground and light background', () => {
      // Create 4x4 image: 8 dark pixels (val=30) and 8 light pixels (val=220)
      const w = 4;
      const h = 4;
      const img = createImageData(w, h);
      const data = img.data;

      for (let i = 0; i < 8; i++) {
        data[i * 4] = 30;
        data[i * 4 + 1] = 30;
        data[i * 4 + 2] = 30;
        data[i * 4 + 3] = 255;
      }
      for (let i = 8; i < 16; i++) {
        data[i * 4] = 220;
        data[i * 4 + 1] = 220;
        data[i * 4 + 2] = 220;
        data[i * 4 + 3] = 255;
      }

      const threshold = calculateOtsuThreshold(data, w, h);
      expect(threshold).toBeGreaterThanOrEqual(30);
      expect(threshold).toBeLessThanOrEqual(220);

      const binarized = applyOtsuBinarization(img);
      // First 8 pixels should be 0 (black ink)
      for (let i = 0; i < 8; i++) {
        expect(binarized.data[i * 4]).toBe(0);
        expect(binarized.data[i * 4 + 1]).toBe(0);
        expect(binarized.data[i * 4 + 2]).toBe(0);
        expect(binarized.data[i * 4 + 3]).toBe(255);
      }
      // Last 8 pixels should be 255 (white paper)
      for (let i = 8; i < 16; i++) {
        expect(binarized.data[i * 4]).toBe(255);
        expect(binarized.data[i * 4 + 1]).toBe(255);
        expect(binarized.data[i * 4 + 2]).toBe(255);
        expect(binarized.data[i * 4 + 3]).toBe(255);
      }
    });

    it('safely handles uniform blank white image without crash', () => {
      const img = createImageData(2, 2);
      img.data.fill(255);
      const res = applyOtsuBinarization(img);
      expect(res.width).toBe(2);
      expect(res.height).toBe(2);
      expect(res.data[0]).toBe(255);
    });

    it('safely handles uniform black image without crash', () => {
      const img = createImageData(2, 2);
      img.data.fill(0);
      for (let i = 3; i < img.data.length; i += 4) img.data[i] = 255;
      const res = applyOtsuBinarization(img);
      expect(res.width).toBe(2);
      expect(res.data[0]).toBe(0);
    });

    it('safely handles 1-pixel image', () => {
      const img = createImageData(1, 1);
      img.data[0] = 120;
      img.data[1] = 120;
      img.data[2] = 120;
      img.data[3] = 255;
      const res = applyOtsuBinarization(img);
      expect(res.width).toBe(1);
      expect(res.height).toBe(1);
    });
  });

  describe('Magic Color (CamScanner Document Whitening)', () => {
    it('whitens grayish/shadowed paper background while maintaining dark text and colored ink', () => {
      const w = 4;
      const h = 4;
      const img = createImageData(w, h);
      const data = img.data;

      // 12 grayish background pixels (val=210)
      for (let i = 0; i < 12; i++) {
        data[i * 4] = 210;
        data[i * 4 + 1] = 210;
        data[i * 4 + 2] = 210;
        data[i * 4 + 3] = 255;
      }
      // 2 black ink text pixels (val=30)
      for (let i = 12; i < 14; i++) {
        data[i * 4] = 30;
        data[i * 4 + 1] = 30;
        data[i * 4 + 2] = 30;
        data[i * 4 + 3] = 255;
      }
      // 2 saturated blue signature pixels (R=20, G=50, B=220)
      for (let i = 14; i < 16; i++) {
        data[i * 4] = 20;
        data[i * 4 + 1] = 50;
        data[i * 4 + 2] = 220;
        data[i * 4 + 3] = 255;
      }

      const enhanced = applyMagicColor(img);

      // Background pixels (index 0..11) should be cleaned to pure white (255)
      expect(enhanced.data[0]).toBe(255);
      expect(enhanced.data[1]).toBe(255);
      expect(enhanced.data[2]).toBe(255);

      // Dark text (index 12) should remain dark
      expect(enhanced.data[12 * 4]!).toBeLessThan(60);

      // Blue signature (index 14) should retain blue prominence (B >> R)
      const blueR = enhanced.data[14 * 4]!;
      const blueB = enhanced.data[14 * 4 + 2]!;
      expect(blueB).toBeGreaterThan(blueR + 50);
    });

    it('cleans yellowed/aged scanner background paper to pure white', () => {
      const img = createImageData(3, 3);
      // Yellowed paper background: R=245, G=238, B=210 (saturation diff ~35, lum ~237)
      for (let i = 0; i < 8; i++) {
        img.data[i * 4] = 245;
        img.data[i * 4 + 1] = 238;
        img.data[i * 4 + 2] = 210;
        img.data[i * 4 + 3] = 255;
      }
      // 1 dark ink pixel
      img.data[8 * 4] = 25;
      img.data[8 * 4 + 1] = 25;
      img.data[8 * 4 + 2] = 25;
      img.data[8 * 4 + 3] = 255;

      const enhanced = applyMagicColor(img);
      // Yellowed paper must be whitened to 255, 255, 255
      expect(enhanced.data[0]).toBe(255);
      expect(enhanced.data[1]).toBe(255);
      expect(enhanced.data[2]).toBe(255);
      // Dark ink must remain dark
      expect(enhanced.data[8 * 4]!).toBeLessThan(50);
    });

    it('safely handles flat uniform gray image without NaN or crashing', () => {
      const img = createImageData(2, 2);
      img.data.fill(128);
      const enhanced = applyMagicColor(img);
      expect(enhanced.width).toBe(2);
      expect(Number.isNaN(enhanced.data[0])).toBe(false);
    });

    it('safely handles 1-pixel image', () => {
      const img = createImageData(1, 1);
      img.data[0] = 200;
      img.data[1] = 200;
      img.data[2] = 200;
      img.data[3] = 255;
      const enhanced = applyMagicColor(img);
      expect(enhanced.width).toBe(1);
      expect(enhanced.data[0]).toBe(255);
    });
  });

  describe('Unsharp Mask Text Sharpening', () => {
    it('returns identical buffer when strength is 0', () => {
      const img = createImageData(3, 3);
      img.data.fill(128);
      const out = applyUnsharpMask(img, 0);
      expect(out).toBe(img);
    });

    it('sharpens edge differences when strength > 0', () => {
      const img = createImageData(3, 3);
      img.data.fill(100);
      // Center pixel is brighter (edge)
      img.data[4 * 4] = 200;
      img.data[4 * 4 + 1] = 200;
      img.data[4 * 4 + 2] = 200;
      img.data[4 * 4 + 3] = 255;

      const sharpened = applyUnsharpMask(img, 80);
      // Center pixel should be amplified even higher than 200 due to contrast with 100 neighbors
      expect(sharpened.data[4 * 4]!).toBeGreaterThan(200);
    });
  });

  describe('Color Adjustments', () => {
    it('leaves image unchanged when adjustments are 0,0,0', () => {
      const img = createImageData(2, 2);
      img.data[0] = 50;
      img.data[1] = 100;
      img.data[2] = 150;
      img.data[3] = 255;

      const out = applyColorAdjustments(img, 0, 0, 0);
      expect(out).toBe(img);
    });

    it('boosts brightness when positive', () => {
      const img = createImageData(1, 1);
      img.data[0] = 100;
      img.data[1] = 100;
      img.data[2] = 100;
      img.data[3] = 255;

      const out = applyColorAdjustments(img, 20, 0, 0);
      expect(out.data[0]!).toBeGreaterThan(100);
    });

    it('converts to grayscale when saturation is -100', () => {
      const img = createImageData(1, 1);
      img.data[0] = 200;
      img.data[1] = 50;
      img.data[2] = 30;
      img.data[3] = 255;

      const out = applyColorAdjustments(img, 0, 0, -100);
      const r = out.data[0]!;
      const g = out.data[1]!;
      const b = out.data[2]!;
      expect(r).toBe(g);
      expect(g).toBe(b);
    });
  });

  describe('Filter Presets', () => {
    it('applies grayscale filter correctly', () => {
      const img = createImageData(1, 1);
      img.data[0] = 100;
      img.data[1] = 150;
      img.data[2] = 200;
      img.data[3] = 255;

      const res = applyFilterPreset(img, 'grayscale');
      expect(res.data[0]).toBe(res.data[1]);
      expect(res.data[1]).toBe(res.data[2]);
    });

    it('applies invert filter correctly', () => {
      const img = createImageData(1, 1);
      img.data[0] = 20;
      img.data[1] = 100;
      img.data[2] = 240;
      img.data[3] = 255;

      const res = applyFilterPreset(img, 'invert');
      expect(res.data[0]).toBe(235);
      expect(res.data[1]).toBe(155);
      expect(res.data[2]).toBe(15);
      expect(res.data[3]).toBe(255);
    });

    it('applies sepia filter correctly', () => {
      const img = createImageData(1, 1);
      img.data[0] = 120;
      img.data[1] = 120;
      img.data[2] = 120;
      img.data[3] = 255;

      const res = applyFilterPreset(img, 'sepia');
      // In sepia, Red should be greater than Blue
      expect(res.data[0]!).toBeGreaterThan(res.data[2]!);
    });
  });

  describe('processImageData pipeline', () => {
    it('chains preset, adjustments, and sharpening seamlessly', () => {
      const img = createImageData(3, 3);
      img.data.fill(120);

      const recipe: PhotoAdjustmentRecipe = {
        rotation: 0,
        flipH: false,
        flipV: false,
        brightness: 10,
        contrast: 15,
        saturation: 5,
        sharpness: 30,
        filterPreset: 'magic-color',
      };

      const out = processImageData(img, recipe);
      expect(out.width).toBe(3);
      expect(out.height).toBe(3);
      expect(out.data.length).toBe(36);
    });

    it('asynchronously processes image data with fallback support', async () => {
      const img = createImageData(2, 2);
      img.data.fill(150);

      const recipe: PhotoAdjustmentRecipe = {
        rotation: 0,
        flipH: false,
        flipV: false,
        brightness: 5,
        contrast: 5,
        saturation: 0,
        sharpness: 0,
        filterPreset: 'grayscale',
      };

      const out = await processImageDataAsync(img, recipe);
      expect(out.width).toBe(2);
      expect(out.height).toBe(2);
      expect(out.data.length).toBe(16);
      expect(out.data[0]).toBe(out.data[1]);
    });
  });
});
