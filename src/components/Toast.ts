export class ToastManager {
  private container: HTMLElement | null = null;

  private ensureContainer(): HTMLElement | null {
    if (typeof document === 'undefined') return null;
    if (!this.container) {
      let el = document.querySelector<HTMLElement>('.toast-container');
      if (!el) {
        el = document.createElement('div');
        el.className = 'toast-container';
        document.body.appendChild(el);
      }
      this.container = el;
    }
    return this.container;
  }

  show(message: string, type: 'success' | 'error' | 'info' = 'info', duration = 3500): void {
    const container = this.ensureContainer();
    if (!container || typeof document === 'undefined') return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;

    container.appendChild(toast);

    setTimeout(() => {
      toast.style.transition = 'opacity 200ms ease, transform 200ms ease';
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(8px)';
      setTimeout(() => {
        if (toast.parentElement) toast.parentElement.removeChild(toast);
      }, 200);
    }, duration);
  }
}

export const toast = new ToastManager();
