export class ToastManager {
  private container: HTMLElement;

  constructor() {
    let el = document.querySelector<HTMLElement>('.toast-container');
    if (!el) {
      el = document.createElement('div');
      el.className = 'toast-container';
      document.body.appendChild(el);
    }
    this.container = el;
  }

  show(message: string, type: 'success' | 'error' | 'info' = 'info', duration = 3500): void {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;

    this.container.appendChild(toast);

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
