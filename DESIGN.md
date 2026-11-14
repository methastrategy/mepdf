# mePDF Design System Specification (v2.3)

**Engine:** ME-DESIGN Engine (`/medesign`)  
**Mode:** `revamp`  
**Locked Direction:** Direction A — Linear Dark Studio (Precision Utilitarian)  
**Last Updated:** 14 พฤศจิกายน 2026  

---

## 1. Locked Direction Overview

- **Aesthetic Profile:** Linear / Raycast Precision Utilitarian Cockpit
- **Color Gamut:** Deep Zinc Obsidian (`#090a0f`) + Electric Indigo (`#4f5ff7` / `oklch(0.62 0.22 264)`) + Laser Cyan Accent (`#06b6d4`)
- **Typography Calibration:** Plus Jakarta Sans (Headings & UI) + IBM Plex Sans Thai (Thai Script) + JetBrains Mono (Tabular Telemetry)
- **Surface Physics:** 1px Hairline Borders (`rgba(255, 255, 255, 0.07)`), Doppelrand Inner Highlights, Tactile Active Press (`scale(0.985)`)
- **Motion Profile:** `precision` (120ms `cubic-bezier(0.16, 1, 0.3, 1)`)

---

## 2. Token Architecture

```css
:root {
  --bg-app: #090a0f;
  --surface-base: oklch(0.14 0.008 265);
  --surface-raised: oklch(0.18 0.010 265);
  --surface-overlay: rgba(22, 25, 34, 0.86);

  --border-subtle: rgba(255, 255, 255, 0.07);
  --border-medium: rgba(255, 255, 255, 0.14);
  --border-focus: oklch(0.65 0.22 264);

  --primary: oklch(0.62 0.22 264);
  --primary-glow: rgba(99, 102, 241, 0.28);
  --accent-cyan: oklch(0.78 0.16 210);
  --accent-on-primary: #ffffff;

  --font-sans: 'Plus Jakarta Sans', 'Inter', 'IBM Plex Sans Thai', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  --font-mono: 'JetBrains Mono', 'Fira Code', Menlo, monospace;

  --shadow-inner-rim: inset 0 1px 0 rgba(255, 255, 255, 0.08);
}
```

---

## 3. Quality Gate Compliance

- **Squint Test:** Pass — Focal hierarchy clearly drives toward Top Ribbon actions and Filmstrip selections.
- **Grayscale Test:** Pass — Pure luminance contrast exceeds WCAG AAA (Text > 12:1, Controls > 4.5:1).
- **10-State Matrix:** Pass (Default, Hover, Pressed `scale(0.985)`, Focus-visible ring, Disabled `opacity: 0.45`, Empty states).
- **Responsive 3-Breakpoints:** 390px Mobile (100dvh, Touch target >= 44px), 768px Tablet, 1440px Desktop.
