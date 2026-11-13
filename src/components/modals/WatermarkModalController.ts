import { downloadBytes } from '../../utils/file-utils';
import { pdfWorker } from '../../core/worker-client';
import { toast } from '../Toast';
import { progressOverlay } from '../ProgressOverlay';
import type { WatermarkOptions, WatermarkPosition } from '../../core/types';
import { t } from '../../core/i18n';
import type { ModalContext } from './ModalContext';

export function showWatermarkModal(
  modal: ModalContext,
  documentBytes: Uint8Array,
  filename = 'document.pdf',
  onSuccess?: () => void
): void {
  const title = `<i data-lucide="stamp" style="width: 18px; height: 18px; color: var(--primary);"></i> ${t('watermarkModalTitle')}`;
  const baseName = filename.replace(/\.pdf$/i, '');

  let watermarkType: 'text' | 'image' = 'text';
  let uploadedImageBytes: Uint8Array | null = null;
  let uploadedImageType: 'png' | 'jpeg' = 'png';
  let selectedColor = { r: 0.5, g: 0.5, b: 0.5 };
  let selectedFontSize = 48;
  let selectedRotation = 45;
  let selectedPosition: WatermarkPosition = 'center';
  let selectedOpacity = 0.3;

  const bodyHtml = `
    <div style="font-size: 0.875rem; color: var(--text-secondary); line-height: 1.5; margin-bottom: 1rem;">
      ${t('watermarkModalDesc')}
    </div>

    <!-- Watermark Type Selector Tabs -->
    <div style="display: flex; gap: 0.5rem; margin-bottom: 1rem;">
      <button type="button" class="btn btn-secondary active" id="wm-type-text-btn" style="flex: 1;">
        <i data-lucide="file-text" style="width: 15px; height: 15px;"></i>
        <span>${t('watermarkTypeText')}</span>
      </button>
      <button type="button" class="btn btn-secondary" id="wm-type-image-btn" style="flex: 1;">
        <i data-lucide="image" style="width: 15px; height: 15px;"></i>
        <span>${t('watermarkTypeImage')}</span>
      </button>
    </div>

    <!-- Text Watermark Section -->
    <div id="wm-text-section">
      <div class="form-group" style="margin-bottom: 0.85rem;">
        <label class="form-label" for="wm-text-input">${t('watermarkTextLabel')}</label>
        <input 
          type="text" 
          class="form-input" 
          id="wm-text-input" 
          value="CONFIDENTIAL" 
          placeholder="${t('watermarkTextPlaceholder')}" 
        />
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; margin-bottom: 0.85rem;">
        <div class="form-group">
          <label class="form-label" for="wm-size-select">${t('watermarkSizeLabel')}</label>
          <select class="form-input" id="wm-size-select">
            <option value="28">${t('watermarkSizeSmall')}</option>
            <option value="48" selected>${t('watermarkSizeMedium')}</option>
            <option value="72">${t('watermarkSizeLarge')}</option>
          </select>
        </div>

        <div class="form-group">
          <label class="form-label" for="wm-color-select">${t('watermarkColorLabel')}</label>
          <select class="form-input" id="wm-color-select">
            <option value="gray" selected>${t('watermarkColorGray')}</option>
            <option value="red">${t('watermarkColorRed')}</option>
            <option value="blue">${t('watermarkColorBlue')}</option>
            <option value="black">${t('watermarkColorBlack')}</option>
          </select>
        </div>
      </div>
    </div>

    <!-- Image Watermark Section (Hidden by default) -->
    <div id="wm-image-section" style="display: none; margin-bottom: 0.85rem;">
      <label class="form-label">${t('watermarkImageLabel')}</label>
      <input type="file" id="wm-image-file-input" accept="image/png,image/jpeg,image/webp" style="display: none;" />
      <button type="button" class="btn btn-secondary" id="wm-browse-image-btn" style="width: 100%; justify-content: center; padding: 0.75rem;">
        <i data-lucide="image" style="width: 16px; height: 16px;"></i>
        <span id="wm-image-filename-label">${t('watermarkImageHint')}</span>
      </button>
    </div>

    <!-- Common Controls: Opacity, Rotation, Position -->
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; margin-bottom: 0.85rem;">
      <div class="form-group">
        <label class="form-label" for="wm-rotation-select">${t('watermarkRotationLabel')}</label>
        <select class="form-input" id="wm-rotation-select">
          <option value="45" selected>${t('watermarkRotationDiagonal')}</option>
          <option value="0">${t('watermarkRotationHorizontal')}</option>
          <option value="90">${t('watermarkRotationVertical')}</option>
          <option value="-45">-45°</option>
        </select>
      </div>

      <div class="form-group">
        <label class="form-label" for="wm-position-select">${t('watermarkPositionLabel')}</label>
        <select class="form-input" id="wm-position-select">
          <option value="center" selected>${t('watermarkPositionCenter')}</option>
          <option value="top-left">${t('watermarkPositionTopLeft')}</option>
          <option value="top-center">${t('watermarkPositionTopCenter')}</option>
          <option value="top-right">${t('watermarkPositionTopRight')}</option>
          <option value="bottom-left">${t('watermarkPositionBottomLeft')}</option>
          <option value="bottom-center">${t('watermarkPositionBottomCenter')}</option>
          <option value="bottom-right">${t('watermarkPositionBottomRight')}</option>
        </select>
      </div>
    </div>

    <div class="form-group" style="margin-bottom: 1rem;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.35rem;">
        <label class="form-label" for="wm-opacity-slider" style="margin-bottom: 0;">${t('watermarkOpacityLabel')}</label>
        <span id="wm-opacity-display" style="font-size: 0.75rem; font-family: var(--font-mono); color: var(--text-primary); font-weight: 600;">30%</span>
      </div>
      <input 
        type="range" 
        id="wm-opacity-slider" 
        min="5" 
        max="90" 
        step="5" 
        value="30" 
        style="width: 100%; accent-color: var(--primary); cursor: pointer;" 
      />
    </div>

    <div style="display: flex; align-items: center; gap: 0.5rem; padding: 0.65rem 0.85rem; background: var(--surface-raised); border: 1px solid var(--border-subtle); border-radius: var(--radius-sm); font-size: 0.75rem; color: var(--text-muted);">
      <i data-lucide="shield-check" style="width: 16px; height: 16px; color: var(--success); flex-shrink: 0;"></i>
      <span>${t('dropzoneZeroUpload')}</span>
    </div>
  `;

  const footerHtml = `
    <button class="btn btn-secondary" id="modal-watermark-cancel-btn">${t('clearModalCancel')}</button>
    <button class="btn btn-primary" id="modal-watermark-submit-btn">
      <i data-lucide="stamp" style="width: 15px; height: 15px;"></i>
      <span>${t('watermarkBtn')}</span>
    </button>
  `;

  modal.open(title, bodyHtml, footerHtml);

  const textSection = modal.bodyContent.querySelector<HTMLElement>('#wm-text-section')!;
  const imageSection = modal.bodyContent.querySelector<HTMLElement>('#wm-image-section')!;
  const typeTextBtn = modal.bodyContent.querySelector<HTMLButtonElement>('#wm-type-text-btn')!;
  const typeImageBtn = modal.bodyContent.querySelector<HTMLButtonElement>('#wm-type-image-btn')!;
  const textInput = modal.bodyContent.querySelector<HTMLInputElement>('#wm-text-input')!;
  const sizeSelect = modal.bodyContent.querySelector<HTMLSelectElement>('#wm-size-select')!;
  const colorSelect = modal.bodyContent.querySelector<HTMLSelectElement>('#wm-color-select')!;
  const rotationSelect = modal.bodyContent.querySelector<HTMLSelectElement>('#wm-rotation-select')!;
  const positionSelect = modal.bodyContent.querySelector<HTMLSelectElement>('#wm-position-select')!;
  const opacitySlider = modal.bodyContent.querySelector<HTMLInputElement>('#wm-opacity-slider')!;
  const opacityDisplay = modal.bodyContent.querySelector<HTMLElement>('#wm-opacity-display')!;
  const imageFileInput = modal.bodyContent.querySelector<HTMLInputElement>('#wm-image-file-input')!;
  const browseImageBtn = modal.bodyContent.querySelector<HTMLButtonElement>('#wm-browse-image-btn')!;
  const imageLabel = modal.bodyContent.querySelector<HTMLElement>('#wm-image-filename-label')!;
  const cancelBtn = modal.footerActions.querySelector<HTMLButtonElement>('#modal-watermark-cancel-btn')!;
  const submitBtn = modal.footerActions.querySelector<HTMLButtonElement>('#modal-watermark-submit-btn')!;

  // Type toggles
  typeTextBtn.addEventListener('click', () => {
    watermarkType = 'text';
    typeTextBtn.classList.add('active');
    typeImageBtn.classList.remove('active');
    textSection.style.display = 'block';
    imageSection.style.display = 'none';
  });

  typeImageBtn.addEventListener('click', () => {
    watermarkType = 'image';
    typeImageBtn.classList.add('active');
    typeTextBtn.classList.remove('active');
    textSection.style.display = 'none';
    imageSection.style.display = 'block';
  });

  // Image upload trigger
  browseImageBtn.addEventListener('click', () => imageFileInput.click());
  imageFileInput.addEventListener('change', async () => {
    if (imageFileInput.files && imageFileInput.files[0]) {
      const file = imageFileInput.files[0];
      const bytes = new Uint8Array(await file.arrayBuffer());
      uploadedImageBytes = bytes;
      uploadedImageType = file.type === 'image/jpeg' || file.name.match(/\.jpe?g$/i) ? 'jpeg' : 'png';
      imageLabel.textContent = file.name;
      toast.show(`Selected image: ${file.name}`, 'info');
    }
  });

  // Opacity slider live update
  opacitySlider.addEventListener('input', () => {
    const val = parseInt(opacitySlider.value, 10);
    selectedOpacity = val / 100;
    opacityDisplay.textContent = `${val}%`;
  });

  // Select updates
  sizeSelect.addEventListener('change', () => {
    selectedFontSize = parseInt(sizeSelect.value, 10);
  });

  colorSelect.addEventListener('change', () => {
    switch (colorSelect.value) {
      case 'red':
        selectedColor = { r: 0.88, g: 0.11, b: 0.28 };
        break;
      case 'blue':
        selectedColor = { r: 0.15, g: 0.39, b: 0.92 };
        break;
      case 'black':
        selectedColor = { r: 0.05, g: 0.05, b: 0.05 };
        break;
      case 'gray':
      default:
        selectedColor = { r: 0.5, g: 0.5, b: 0.5 };
        break;
    }
  });

  rotationSelect.addEventListener('change', () => {
    selectedRotation = parseInt(rotationSelect.value, 10);
  });

  positionSelect.addEventListener('change', () => {
    selectedPosition = positionSelect.value as WatermarkPosition;
  });

  cancelBtn.addEventListener('click', () => modal.close());

  // Submit handler
  submitBtn.addEventListener('click', async () => {
    if (watermarkType === 'image' && !uploadedImageBytes) {
      toast.show('Please select an image file for the watermark', 'info');
      return;
    }

    submitBtn.disabled = true;
    try {
      progressOverlay.show('Applying watermark to PDF...');
      const options: WatermarkOptions = {
        type: watermarkType,
        text: textInput.value.trim() || 'CONFIDENTIAL',
        imageBytes: uploadedImageBytes ?? undefined,
        imageType: uploadedImageType,
        fontSize: selectedFontSize,
        color: selectedColor,
        opacity: selectedOpacity,
        rotation: selectedRotation,
        position: selectedPosition,
      };

      const watermarkedBytes = await pdfWorker.watermarkPdf(documentBytes, options, (info) => {
        progressOverlay.update(info);
      });

      progressOverlay.hide();
      modal.close();

      downloadBytes(watermarkedBytes, `${baseName}_watermarked.pdf`);
      toast.show(t('toastWatermarkSuccess'), 'success');
      onSuccess?.();
    } catch (err: unknown) {
      progressOverlay.hide();
      submitBtn.disabled = false;
      const msg = err instanceof Error ? err.message : String(err);
      toast.show(`Watermark failed: ${msg}`, 'error');
    }
  });
}
