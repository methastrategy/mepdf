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
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');
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

  showAction(
    message: string,
    actionLabel: string,
    onAction: () => void,
    duration = 6000
  ): { dismiss: () => void } {
    const container = this.ensureContainer();
    if (!container || typeof document === 'undefined') return { dismiss: () => {} };

    const toast = document.createElement('div');
    toast.className = 'toast toast-action toast-info';
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');

    const textSpan = document.createElement('span');
    textSpan.textContent = message;

    let dismissed = false;
    let timer: any = null;

    const dismiss = () => {
      if (dismissed) return;
      dismissed = true;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      toast.style.transition = 'opacity 200ms ease, transform 200ms ease';
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(8px)';
      setTimeout(() => {
        if (toast.parentElement) toast.parentElement.removeChild(toast);
      }, 200);
    };

    const actionBtn = document.createElement('button');
    actionBtn.className = 'toast-action-btn';
    actionBtn.type = 'button';
    actionBtn.textContent = actionLabel;
    actionBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      dismiss();
      onAction();
    });

    toast.appendChild(textSpan);
    toast.appendChild(actionBtn);
    container.appendChild(toast);

    timer = setTimeout(() => {
      dismiss();
    }, duration);

    return { dismiss };
  }
}

export const toast = new ToastManager();
