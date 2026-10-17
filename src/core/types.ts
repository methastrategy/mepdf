export interface PDFPageItem {
  id: string;
  docId: string;
  docName: string;
  pageIndex: number; // 0-based index in the source doc
  displayPageNumber: number; // 1-based index in the source doc
  rotation: number; // additional rotation in degrees: 0, 90, 180, 270
  thumbnailDataUrl: string;
  width: number;
  height: number;
  selected: boolean;
}

export interface DocumentMetadata {
  id: string;
  filename: string;
  size: number;
  pageCount: number;
  fileBytes: Uint8Array;
}

export type CompressionPreset = 'screen' | 'ebook' | 'printer' | 'custom';

export interface CompressionOptions {
  preset: CompressionPreset;
  dpi: number;
  quality: number; // 0.1 to 1.0
  maxDimension?: number;
}

export interface CompressionResult {
  pdfBytes: Uint8Array;
  originalSize: number;
  compressedSize: number;
  ratio: number; // e.g. 0.45 = 45% of original
  ineffective?: boolean;
}

export interface ProgressInfo {
  stage: string;
  current: number;
  total: number;
  percent: number;
}

export type ProgressCallback = (info: ProgressInfo) => void;

export type ImagePageFit = 'A4' | 'fit';

export interface ImageToPdfOptions {
  pageSize: ImagePageFit;
  orientation?: 'portrait' | 'landscape' | 'auto';
  margin?: number;
}

export interface ExtractedImageItem {
  name: string;
  blob: Blob;
  dataUrl: string;
  pageNumber: number;
  width: number;
  height: number;
}
