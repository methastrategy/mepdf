import { formatBytes, downloadBytes } from '../../utils/file-utils';
import { COMPRESSION_PRESETS, compressPdf } from '../../core/pdf-compressor';
import { pdfWorker } from '../../core/worker-client';
import { toast } from '../Toast';
import { progressOverlay } from '../ProgressOverlay';
import type { CompressionPreset } from '../../core/types';
import { t } from '../../core/i18n';
import type { ModalContext } from './ModalContext';

export function showCompressModal(
  modal: ModalContext,
  documentBytes: Uint8Array,
  filename = 'document.pdf',
  password?: string
): void {
  let selectedEngine: 'lossless' | 'scanned' = 'lossless';
  let selectedPreset: CompressionPreset = 'ebook';
  let currentQuality = 0.78;
  const originalSize = documentBytes.byteLength;

  const title = `<i data-lucide="minimize-2" style="width: 18px; height: 18px; color: var(--primary);"></i> ${t('compressModalTitle')}`;
  const bodyHtml = `
    <div style="font-size: 0.875rem; color: var(--text-secondary); line-height: 1.5; margin-bottom: 0.75rem;">
      ${t('compressModalDesc')}
    </div>

    <div class="form-group">
      <label class="form-label">${t('compressEngineLabel')}</label>
      <div class="preset-selector" id="compress-engine-selector" style="grid-template-columns: repeat(2, 1fr);">
        <div class="preset-card active" data-engine="lossless">
          <div class="preset-title" style="display: flex; align-items: center; gap: 0.4rem;">
            <i data-lucide="file-check" style="width: 16px; height: 16px; color: var(--success);"></i>
            ${t('compressEngineLossless')}
          </div>
          <div class="preset-desc">${t('compressEngineLosslessDesc')}</div>
        </div>
        <div class="preset-card" data-engine="scanned">
          <div class="preset-title" style="display: flex; align-items: center; gap: 0.4rem;">
            <i data-lucide="image" style="width: 16px; height: 16px; color: var(--primary);"></i>
            ${t('compressEngineScanned')}
          </div>
          <div class="preset-desc">${t('compressEngineScannedDesc')}</div>
        </div>
      </div>
    </div>

    <div id="compress-scanned-controls" style="display: none;">
      <div class="form-group">
        <label class="form-label">${t('compressPresetLabel')}</label>
        <div class="preset-selector">
          <div class="preset-card" data-preset="screen" data-dpi="96" data-quality="0.65">
            <div class="preset-title">${t('compressPresetScreen')}</div>
            <div class="preset-desc">${t('compressPresetScreenDesc')}</div>
          </div>
          <div class="preset-card active" data-preset="ebook" data-dpi="150" data-quality="0.78">
            <div class="preset-title">${t('compressPresetEbook')}</div>
            <div class="preset-desc">${t('compressPresetEbookDesc')}</div>
          </div>
          <div class="preset-card" data-preset="printer" data-dpi="300" data-quality="0.90">
            <div class="preset-title">${t('compressPresetPrint')}</div>
            <div class="preset-desc">${t('compressPresetPrintDesc')}</div>
          </div>
        </div>
      </div>

      <div class="form-group">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <label class="form-label" for="compress-quality-slider">${t('compressQualitySlider')}</label>
          <span id="compress-quality-value" style="font-size: 0.8125rem; font-weight: 700; color: var(--primary);">78%</span>
        </div>
        <input type="range" class="form-range" id="compress-quality-slider" min="10" max="95" value="78" step="1" />
        <div style="display: flex; justify-content: space-between; font-size: 0.6875rem; color: var(--text-muted); margin-top: 0.2rem;">
          <span>${t('compressMaxSavings')}</span>
          <span>${t('compressBalanced')}</span>
          <span>${t('compressMaxQuality')}</span>
        </div>
      </div>
    </div>

    <div class="size-comparison-card" style="background: var(--surface-raised); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); padding: 1.1rem; margin-top: 0.5rem;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
        <div>
          <div style="font-size: 0.75rem; color: var(--text-muted);">${t('compressCurrentSize')}</div>
          <div style="font-size: 1.15rem; font-weight: 700; color: var(--text-primary);">${formatBytes(originalSize)}</div>
        </div>
        <div id="compress-result-box" style="text-align: right; display: none;">
          <div style="font-size: 0.75rem; color: var(--success);">${t('compressOptimizedSize')}</div>
          <div id="compress-result-size" style="font-size: 1.15rem; font-weight: 700; color: var(--success);"></div>
        </div>
      </div>
      <div id="compress-stats-summary" style="font-size: 0.8125rem; color: var(--text-muted); border-top: 1px dashed var(--border-subtle); padding-top: 0.5rem; display: flex; justify-content: space-between;">
        <span id="compress-engine-note" style="color: var(--text-secondary);">Deflate Object Streams (Vector Preserved)</span>
        <span id="compress-est-label">${t('compressEstSavings')}</span>
      </div>
    </div>
  `;

  const footerHtml = `
    <button class="btn btn-secondary" id="modal-cancel-btn">${t('clearModalCancel')}</button>
    <button class="btn btn-primary" id="modal-start-compress-btn">
      <i data-lucide="minimize-2" style="width: 16px; height: 16px;"></i>
      <span>${t('compressStartBtn')}</span>
    </button>
  `;

  modal.open(title, bodyHtml, footerHtml);

  // Engine switcher interactions
  const engineCards = modal.bodyContent.querySelectorAll<HTMLElement>('#compress-engine-selector .preset-card');
  const scannedControls = modal.bodyContent.querySelector<HTMLElement>('#compress-scanned-controls')!;
  const engineNoteEl = modal.bodyContent.querySelector<HTMLElement>('#compress-engine-note');

  engineCards.forEach((card) => {
    card.addEventListener('click', () => {
      engineCards.forEach((c) => c.classList.remove('active'));
      card.classList.add('active');
      selectedEngine = (card.getAttribute('data-engine') as 'lossless' | 'scanned') || 'lossless';
      resetCompressionState();

      if (selectedEngine === 'lossless') {
        scannedControls.style.display = 'none';
        if (engineNoteEl) {
          engineNoteEl.textContent = 'Deflate Object Streams (Vector Preserved)';
        }
      } else {
        scannedControls.style.display = 'block';
        if (engineNoteEl) {
          engineNoteEl.innerHTML = t('compressTargetDpi', {
            dpi: '<strong style="color: var(--text-secondary);">' + (selectedPreset === 'screen' ? '96' : selectedPreset === 'printer' ? '300' : '150') + '</strong>',
          });
        }
      }
    });
  });

  // Preset selector interactions
  const presetCards = modal.bodyContent.querySelectorAll<HTMLElement>('#compress-scanned-controls .preset-card');
  const qualitySlider = modal.bodyContent.querySelector<HTMLInputElement>('#compress-quality-slider')!;
  const qualityValueEl = modal.bodyContent.querySelector<HTMLElement>('#compress-quality-value')!;

  presetCards.forEach((card) => {
    card.addEventListener('click', () => {
      presetCards.forEach((c) => c.classList.remove('active'));
      card.classList.add('active');
      selectedPreset = card.getAttribute('data-preset') as CompressionPreset;
      resetCompressionState();
      const presetDpi = card.getAttribute('data-dpi') ?? '150';
      const presetQ = parseFloat(card.getAttribute('data-quality') ?? '0.78');

      currentQuality = presetQ;
      qualitySlider.value = String(Math.round(presetQ * 100));
      qualityValueEl.textContent = `${Math.round(presetQ * 100)}%`;
      if (engineNoteEl && selectedEngine === 'scanned') {
        engineNoteEl.innerHTML = t('compressTargetDpi', {
          dpi: `<strong style="color: var(--text-secondary);">${presetDpi}</strong>`,
        });
      }
    });
  });

  qualitySlider.addEventListener('input', () => {
    const qVal = parseInt(qualitySlider.value, 10);
    currentQuality = qVal / 100;
    resetCompressionState();
    qualityValueEl.textContent = `${qVal}%`;
  });

  modal.footerActions.querySelector('#modal-cancel-btn')?.addEventListener('click', () => modal.close());

  const startBtn = modal.footerActions.querySelector<HTMLButtonElement>('#modal-start-compress-btn')!;
  let compressedResult: { pdfBytes: Uint8Array; compressedSize: number } | null = null;

  const resetCompressionState = () => {
    if (compressedResult) {
      compressedResult = null;
      startBtn.innerHTML = `
        <i data-lucide="minimize-2" style="width: 16px; height: 16px;"></i>
        <span>${t('compressStartBtn')}</span>
      `;
      modal.refreshIcons();
      const resultBox = modal.bodyContent.querySelector<HTMLElement>('#compress-result-box');
      if (resultBox) resultBox.style.display = 'none';
    }
  };

  startBtn.addEventListener('click', async () => {
    if (compressedResult) {
      const outName = filename.replace(/\.pdf$/i, '') + '_compressed.pdf';
      downloadBytes(compressedResult.pdfBytes, outName);
      toast.show('Compressed PDF downloaded!', 'success');
      modal.close();
      return;
    }

    try {
      startBtn.disabled = true;
      progressOverlay.show('Compressing PDF...');

      let result;
      if (selectedEngine === 'lossless') {
        result = await pdfWorker.compressLossless(documentBytes, (info) => {
          progressOverlay.update(info);
        });
      } else {
        const presetConfig = COMPRESSION_PRESETS[selectedPreset] ?? COMPRESSION_PRESETS['ebook']!;
        const options = {
          mode: 'scanned' as const,
          ...presetConfig,
          quality: currentQuality,
        };
        result = await compressPdf(
          documentBytes,
          options,
          (info) => {
            progressOverlay.update(info);
          },
          password
        );
      }

      progressOverlay.hide();

      const resultBox = modal.bodyContent.querySelector<HTMLElement>('#compress-result-box');
      const resultSize = modal.bodyContent.querySelector<HTMLElement>('#compress-result-size');
      const estLabel = modal.bodyContent.querySelector<HTMLElement>('#compress-est-label');

      if (resultBox && resultSize) {
        resultBox.style.display = 'block';
        const savedBytes = result.originalSize - result.compressedSize;
        const savedPercent = Math.round((1 - result.ratio) * 100);

        if (savedPercent > 0 && !result.ineffective) {
          resultSize.textContent = `${formatBytes(result.compressedSize)} (-${savedPercent}%)`;
          if (estLabel) {
            estLabel.innerHTML = t('compressSavedInfo', {
              saved: `<strong style="color: var(--success);">${formatBytes(savedBytes)}</strong>`,
              percent: savedPercent,
            });
          }
        } else {
          resultSize.textContent = `${formatBytes(result.compressedSize)} (Optimal)`;
          if (estLabel) {
            estLabel.innerHTML = `<span style="color: var(--warning, #eab308);">${t('compressAlreadyOptimal')}</span>`;
          }
        }
      }

      compressedResult = result;

      // Change button to download
      startBtn.disabled = false;
      startBtn.innerHTML = `
        <i data-lucide="download" style="width: 16px; height: 16px;"></i>
        <span>${t('compressDownloadBtn')}</span>
      `;
      modal.refreshIcons();

      toast.show(`Compression complete! Size: ${formatBytes(result.compressedSize)}`, 'success');
    } catch (err: unknown) {
      progressOverlay.hide();
      startBtn.disabled = false;
      const msg = err instanceof Error ? err.message : String(err);
      toast.show(`Compression failed: ${msg}`, 'error');
    }
  });
}
