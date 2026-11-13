export interface ModalContext {
  overlay: HTMLElement;
  headerTitle: HTMLElement;
  bodyContent: HTMLElement;
  footerActions: HTMLElement;
  closeBtn: HTMLButtonElement;
  isOpen(): boolean;
  setOnClose(cb: (() => void) | null): void;
  open(title: string, bodyHtml: string, footerHtml: string): void;
  close(): void;
  refreshIcons(): void;
}
