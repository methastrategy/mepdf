# 🎨 meCraft Studio

**Pure Client-Side Creative & Document Engineering Suite (100% In-Browser & Native Desktop)**

A high-performance, private, zero-server-upload PDF and Photo toolbox built with **Vite, TypeScript, Tauri v2 (Rust), pdf-lib, PDF.js, and Web Workers**.

---

## ✨ Features

- **🛡️ 100% Private & In-Browser / Desktop:** All PDF rendering, photo enhancement, merging, reordering, and compression happen directly on your device. Zero server uploads, zero network latency, and zero payload size limitations.
- **🎨 Visual Studio Workspace:** Real-time thumbnail preview grid of every page. Drag-and-drop to reorder pages across multiple documents seamlessly.
- **🪄 Photo Studio (Beyond PhotoCraft):** Built-in non-destructive photo workbench with CamScanner-grade Magic Color (document background whitening), B&W Adaptive Binarization, Unsharp Mask, aspect-ratio locked crop, and precision straighten deskew ($-45^\circ \dots +45^\circ$).
- **🖥️ Native Desktop Shell (Tauri v2):** Runs as a native Windows `.exe` / `.msi` application with direct disk overwrite on `Ctrl+S`, `.pdf` file associations, and ultra-low RAM footprint (~30MB).
- **🔄 Page Controls:** Rotate individual pages (90° increments), delete pages, multi-select, and invert selection.
- **🗜️ Dual-Engine Smart Compression:** Canvas-based downsampling and lossless stream deflation with live file size comparison.
- **✂️ Document Splitting:** Extract every page into separate PDFs or define custom page ranges (e.g. `1-3, 5, 7-10`) bundled into a single ZIP.
- **🖼️ Images ↔ PDF:** Convert PNG, JPG, WebP into standardized A4 or fit-to-image PDFs, and export PDF pages to high-resolution PNG or JPG ZIP archives.
- **🔒 Security & Pro Tools:** 256-bit AES password encryption, custom text/image watermarks, automated page numbering, and 1-click metadata sanitizer.
- **⌨️ Desktop Keyboard Shortcuts:** `Ctrl+O` to open, `Ctrl+S` to export/save, `Ctrl+E` for Photo Studio, `Ctrl+Z` to undo, `Ctrl+A` to select all, `Delete` / `Backspace` to remove selected pages, and `Spacebar + Drag` to pan canvas.

---

## 🚀 Quick Start

### Web Development
```bash
npm install
npm run dev
```

### Desktop Development (Tauri v2)
```bash
npm run desktop:dev
```

### Desktop Production Build (.exe / .msi)
```bash
npm run desktop:build
```

### Type Checking & Testing
```bash
npm run typecheck
npm run test
```

### Web Production Build
```bash
npm run build
npm run preview
```

---

## 📦 Deployment

The application compiles into static HTML/JS/CSS assets in `dist/` and is deployed to **Vercel** as a static Single Page Application via `vercel.json`, while native binaries are packaged via Tauri.
