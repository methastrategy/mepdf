# 📄 mePDF

**Pure Client-Side PDF Visual Studio (100% In-Browser)**

A high-performance, private, zero-server-upload PDF toolbox built with **Vite, TypeScript, pdf-lib, and PDF.js**.

---

## ✨ Features

- **🛡️ 100% Private & In-Browser:** All PDF rendering, merging, reordering, and compression happen directly in your browser. Zero server uploads, zero network latency, and zero payload size limitations.
- **🎨 Visual Studio Workspace:** Real-time thumbnail preview grid of every page. Drag-and-drop to reorder pages across multiple documents seamlessly.
- **🔄 Page Controls:** Rotate individual pages (90° increments), delete pages, multi-select, and invert selection.
- **🗜️ Smart In-Browser Compression:** Canvas-based resolution downsampling and re-encoding presets (`Screen 96 DPI`, `Ebook 144 DPI`, `Print 200 DPI`) with live file size comparison.
- **✂️ Document Splitting:** Extract every page into separate PDFs or define custom page ranges (e.g. `1-3, 5, 7-10`) bundled into a single ZIP.
- **🖼️ Images ↔ PDF:** Convert PNG, JPG, WebP into standardized A4 or fit-to-image PDFs, and export PDF pages to high-resolution PNG or JPG ZIP archives.
- **📝 Text Extraction:** Extract plain text with formatted page boundaries, copy to clipboard, or download as `.txt`.
- **⌨️ Keyboard Shortcuts:** `Ctrl+S` / `⌘S` to export, `Ctrl+A` / `⌘A` to select all, `Delete` / `Backspace` to remove selected pages.

---

## 🚀 Quick Start

### Development
```bash
npm install
npm run dev
```

### Type Checking & Testing
```bash
npm run typecheck
npm run test
```

### Production Build
```bash
npm run build
npm run preview
```

---

## 📦 Deployment

The application compiles into static HTML/JS/CSS assets in `dist/` and is deployed to **Vercel** as a static Single Page Application via `vercel.json`.
