export type ToolRoute =
  | 'studio'
  | 'split'
  | 'compress'
  | 'protect'
  | 'watermark'
  | 'page-numbers'
  | 'metadata'
  | 'img2pdf'
  | 'pdf2img'
  | 'extract-text'
  | 'account'
  | 'cloud-library';

export const HASH_TO_ROUTE_MAP: Record<string, ToolRoute> = {
  '#/merge': 'studio',
  '#/studio': 'studio',
  '#/split': 'split',
  '#/compress': 'compress',
  '#/protect': 'protect',
  '#/encrypt': 'protect',
  '#/watermark': 'watermark',
  '#/page-numbers': 'page-numbers',
  '#/page-number': 'page-numbers',
  '#/pagenumber': 'page-numbers',
  '#/metadata': 'metadata',
  '#/info': 'metadata',
  '#/pdf-to-images': 'pdf2img',
  '#/pdf2img': 'pdf2img',
  '#/images-to-pdf': 'img2pdf',
  '#/img2pdf': 'img2pdf',
  '#/extract-text': 'extract-text',
  '#/account': 'account',
  '#/auth': 'account',
  '#/cloud-library': 'cloud-library',
  '#/library': 'cloud-library',
};

export const ROUTE_TO_HASH_MAP: Record<ToolRoute, string> = {
  studio: '#/merge',
  split: '#/split',
  compress: '#/compress',
  protect: '#/protect',
  watermark: '#/watermark',
  'page-numbers': '#/page-numbers',
  metadata: '#/metadata',
  img2pdf: '#/images-to-pdf',
  pdf2img: '#/pdf-to-images',
  'extract-text': '#/extract-text',
  account: '#/account',
  'cloud-library': '#/cloud-library',
};

/**
 * Resolves current window hash to a known tool route, or null if root / unknown
 */
export function getCurrentRoute(): ToolRoute | null {
  if (typeof window === 'undefined') return null;
  const hash = window.location.hash.toLowerCase();
  return HASH_TO_ROUTE_MAP[hash] ?? null;
}

/**
 * Safely updates browser URL hash without causing full page reload
 */
export function setHashRoute(route: ToolRoute): void {
  if (typeof window === 'undefined') return;
  const targetHash = ROUTE_TO_HASH_MAP[route] ?? '#/merge';
  if (window.location.hash !== targetHash) {
    if (window.history && window.history.replaceState) {
      window.history.replaceState(null, '', targetHash);
    }
    if (window.location.hash !== targetHash) {
      window.location.hash = targetHash;
    }
  }
}

/**
 * Registers a listener for hash changes
 */
export function onHashChange(callback: (route: ToolRoute) => void): () => void {
  if (typeof window === 'undefined') return () => {};

  const handler = () => {
    const route = getCurrentRoute();
    if (route) {
      callback(route);
    }
  };

  window.addEventListener('hashchange', handler);
  return () => {
    window.removeEventListener('hashchange', handler);
  };
}
