# Design Document: Responsive & Premium UI Dashboard Upgrade

This document outlines the visual and structural design to upgrade the YTV Downloader frontend dashboard ([`public/index.html`](public/index.html)) to a premium, modern, responsive, and ultra-fluid interface inspired by Linear and Vercel.

---

## 1. Design System & Tokens

### A. Color Palette (Slate & Deep Navy)
* **Background Canvas:** `#060913` with a top-centered radial glow (`radial-gradient(circle at 50% 0%, #111b2d 0%, #060913 70%)`).
* **Surfaces (Cards/Containment):** `#0c1220` with a semi-transparent opacity for glassmorphic elements.
* **Accent/Interactive:** `#3b82f6` (Vercel Primary Blue) transitioning to `#2563eb` on hover. Focus shadows use `rgba(59, 130, 246, 0.15)`.
* **State Badges:**
  * **Done:** Background `rgba(16, 185, 129, 0.08)`, Border `rgba(16, 185, 129, 0.2)`, Text `#10b981`.
  * **Error:** Background `rgba(239, 68, 68, 0.08)`, Border `rgba(239, 68, 68, 0.2)`, Text `#ef4444`.
  * **Active/Extracting:** Background `rgba(139, 92, 246, 0.08)`, Border `rgba(139, 92, 246, 0.2)`, Text `#a78bfa`.
  * **Queued:** Background `rgba(100, 116, 139, 0.08)`, Border `rgba(100, 116, 139, 0.2)`, Text `#94a3b8`.

### B. Typography
* **Headings:** `Outfit`, `-apple-system`, Sans-Serif (font-weight: `600` or `700`, letter-spacing: `-0.02em`).
* **UI Elements / Labels:** `Inter`, Sans-Serif (font-weight: `500` or `600`).
* **Technical Readouts / Sizes / Paths:** `JetBrains Mono`, `Geist Mono`, Monospace (font-size: `11px` or `12px`).

### C. Layout Grid & Dividers
* **Page Wrapper Container:** Centered width maximum of `1240px` with responsive paddings (`24px` on desktop, `16px` on mobile).
* **Borders / Dividers:** Ultra-thin lines (`1px solid rgba(255, 255, 255, 0.06)`).
* **Rounded Corners:** Consistent bounding boxes (`border-radius: 12px` for main cards, `8px` for inputs/buttons, `20px` for badges/chips).

---

## 2. Desktop Tabular Grid Layout ($> 768px$)

On wide monitors and tablet devices in landscape mode, the interface keeps a structured, high-density table.

### Interactions & Micro-effects:
1. **Title Hover indicator:** When hovering over the `c-title` column, a small pencil icon `✏️` fades in slightly on the right side to visually communicate to the user that they can click and edit the filename inline.
2. **Buttons Grow Effect:** Icon action buttons on hover transition with a smooth scale and slight rise:
   ```css
   transform: translateY(-1px);
   box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
   transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
   ```
3. **Pill Status Dots:** Done/Active status pills have a CSS pulsing glow dot inside them, providing dynamic movement.

---

## 3. Mobile Card Layout ($< 768px$)

On small screens, the horizontal table structure is hidden. Every `<tr>` converts into a self-contained, border-boxed mobile media card.

```css
@media (max-width: 768px) {
  /* Hide the desktop headers completely */
  table, thead, tbody, tr, td {
    display: block;
    width: 100%;
  }
  thead {
    display: none;
  }
  
  /* Convert Row into Cards */
  tr {
    background: #0c1220;
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 12px;
    padding: 16px;
    margin-bottom: 16px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
  }
  
  /* Arrange internal row elements inside Card */
  td {
    padding: 0 !important;
    margin-bottom: 12px;
    border: none !important;
    text-align: left !important;
  }
}
```

### Mobile Card Content Sections:
1. **Header Group:** The item index (e.g. `#1`) is shown as a tiny badge. Next to it, the **Title** is displayed as a large, bold, editable headline. Below the title, the source URL is displayed as a small, truncated secondary link.
2. **Badge Row (Technical Metadata):** `Resolution`, `Format`, `Size`, and `Duration` are rendered as a horizontal wrap row of small, rounded, dark slate chips.
3. **Actions Row:** Displays a row of flat, tactile icon buttons to trigger copying the stream link, downloading the video, or deleting the item.
4. **Download Progress:** The progress bar scales to `100%` of the card width, displaying download speed and fragment count in a clean, compact font.

---

## 4. CSS Transitions & Performance

* **GPU Accelerated Animations:** All hover and scale state changes use `transform` and `opacity` properties to prevent page layout recalculation and keep frames locked at `60fps`.
* **Pulse Animations:** Soft keyframe animations for checking/active statuses:
  ```css
  @keyframes pulse-glow {
    0% { transform: scale(0.95); opacity: 0.5; }
    50% { transform: scale(1.05); opacity: 1; }
    100% { transform: scale(0.95); opacity: 0.5; }
  }
  ```
