import type { ProgressInfo } from '../core/types';

export class ProgressOverlay {
  private overlay: HTMLElement | null = null;
  private stageEl: HTMLElement | null = null;
  private fillEl: HTMLElement | null = null;
  private percentEl: HTMLElement | null = null;
  private countEl: HTMLElement | null = null;

  constructor() {
    this.ensureElements();
  }

  private ensureElements(): boolean {
    if (typeof document === 'undefined') return false;
    if (!this.overlay) {
      let el = document.querySelector<HTMLElement>('.progress-overlay');
      if (!el) {
        el = document.createElement('div');
        el.className = 'progress-overlay';
        el.innerHTML = `
          <div class="progress-modal">
            <h3 class="progress-stage" style="font-size: 1.1rem; font-weight: 700; margin-bottom: 0.5rem;">Processing</h3>
            <div class="progress-bar-track">
              <div class="progress-bar-fill"></div>
            </div>
            <div class="progress-info">
              <span class="progress-count">0 / 0</span>
              <span class="progress-percent">0%</span>
            </div>
          </div>
        `;
        document.body.appendChild(el);
      }
      this.overlay = el;
      this.stageEl = el.querySelector('.progress-stage');
      this.fillEl = el.querySelector('.progress-bar-fill');
      this.percentEl = el.querySelector('.progress-percent');
      this.countEl = el.querySelector('.progress-count');
    }
    return true;
  }

  show(initialStage = 'Processing...'): void {
    if (!this.ensureElements() || !this.stageEl || !this.fillEl || !this.percentEl || !this.countEl || !this.overlay) return;
    this.stageEl.textContent = initialStage;
    this.fillEl.style.width = '0%';
    this.percentEl.textContent = '0%';
    this.countEl.textContent = '';
    this.overlay.classList.add('active');
  }

  update(info: ProgressInfo): void {
    if (!this.ensureElements() || !this.stageEl || !this.fillEl || !this.percentEl || !this.countEl) return;
    this.stageEl.textContent = info.stage;
    this.fillEl.style.width = `${info.percent}%`;
    this.percentEl.textContent = `${info.percent}%`;
    this.countEl.textContent = `${info.current} / ${info.total}`;
  }

  hide(): void {
    this.overlay?.classList.remove('active');
  }
}

export const progressOverlay = new ProgressOverlay();
