# Responsive & Premium UI Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign and optimize [`public/index.html`](public/index.html) to be a fully responsive, modern dashboard utilizing a Premium Minimalist (Linear/Vercel-inspired slate & navy) design language that adapts fluidly to desktop, tablet, and mobile devices.

**Architecture:** Restructure CSS using custom variables and properties. Introduce responsive media queries (`@media (max-width: 768px)`) that dynamically morph the rigid desktop table structures (`<tr>` and `<td>` elements) into standalone, space-efficient, flex-based info-cards. Include micro-interactions (magnetic-feel hover transforms, pulsing status dots, and edit indicators).

**Tech Stack:** HTML5, CSS3 Grid/Flexbox, Vanilla ES6 JavaScript.

---

### Task 1: Modernize CSS Theme Variables, Canvas & Inputs

Upgrade the overall theme, canvas backgrounds, folders bars, and input blocks to a high-end dark-mode developer console look.

**Files:**
- Modify: `public/index.html:12-250` (The styling declarations)

- [ ] **Step 1: Upgrade Design Variables and background glow**
  Redefine the `:root` variables and background Canvas colors to a deep dark slate palette with top-centered radial light reflections.
  ```css
  /* Replace inside public/index.html style root: */
  :root {
    --bg: #060913;
    --surface: #0c1220;
    --surface-hover: #131b2e;
    --surface-light: #16223b;
    --border: rgba(255, 255, 255, 0.06);
    --border-hover: rgba(255, 255, 255, 0.12);
    --border-focus: #3b82f6;
    
    --text: #f8fafc;
    --text-muted: #94a3b8;
    --text-dark: #64748b;
    
    --accent: #3b82f6;
    --accent-hover: #2563eb;
    --accent-light: rgba(59, 130, 246, 0.08);
    --accent-border: rgba(59, 130, 246, 0.2);
    
    --green: #10b981;
    --green-hover: #059669;
    --green-bg: rgba(16, 185, 129, 0.08);
    --green-bd: rgba(16, 185, 129, 0.2);
    
    --red: #ef4444;
    --red-hover: #dc2626;
    --red-bg: rgba(239, 68, 68, 0.08);
    --red-bd: rgba(239, 68, 68, 0.2);
    
    --purple: #8b5cf6;
    --purple-bg: rgba(139, 92, 246, 0.08);
    --purple-bd: rgba(139, 92, 246, 0.2);
    
    --sans: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    --display: 'Outfit', var(--sans);
    --mono: 'JetBrains Mono', 'Fira Code', monospace;
    --radius: 12px;
    --shadow: 0 4px 30px rgba(0, 0, 0, 0.4), 0 1px 3px rgba(0, 0, 0, 0.1);
  }

  body {
    background: var(--bg);
    background-image: radial-gradient(circle at 50% 0%, #111b2d 0%, #060913 70%);
    color: var(--text);
    font-family: var(--sans);
    font-size: 13px;
    line-height: 1.5;
    min-height: 100vh;
    padding: 40px 24px 80px;
    display: flex;
    justify-content: center;
  }
  ```

- [ ] **Step 2: Restyle Content Cards & Input Bars**
  Upgrade the standard folder path bar, URL input fields, and toolbars to cast sharp, elegant focus lines and subtle backshadows on interactive states.
  ```css
  /* Modify input-bar, folder-bar, and cards inside style sheet: */
  .card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 24px;
    box-shadow: var(--shadow);
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  .folder-bar, .input-bar {
    background: rgba(255, 255, 255, 0.02);
    border: 1px solid var(--border);
    border-radius: 8px;
    display: flex;
    align-items: center;
    padding: 2px;
    transition: all 0.2s ease;
  }

  .folder-bar:focus-within, .input-bar:focus-within {
    border-color: var(--border-focus);
    box-shadow: 0 0 0 4px var(--accent-light);
  }

  .folder-path, #urlInput {
    background: transparent;
    border: none !important;
    outline: none !important;
    color: var(--text);
    font-family: var(--sans);
    padding: 10px 14px;
    flex: 1;
    font-size: 13px;
  }

  .folder-path {
    font-family: var(--mono);
    color: var(--text-muted);
  }

  button {
    font-family: var(--sans);
    font-weight: 500;
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  }

  button:hover:not(:disabled) {
    transform: translateY(-1px);
  }
  ```

---

### Task 2: Micro-Interactions, Status Pulsing & Table Enhancements

Add high-fidelity user cues, pulsing indicators, double-click/editable titles markers, and beautiful status badges.

**Files:**
- Modify: `public/index.html:251-500` (BADGE, STATUS, and TITLE styles)

- [ ] **Step 1: Create Soft Pulsing Status Animations**
  Define a keyframe pulsator to animate active status dots in extracting or downloading states.
  ```css
  @keyframes pulse-glow {
    0% { transform: scale(0.9); opacity: 0.4; }
    50% { transform: scale(1.15); opacity: 1; }
    100% { transform: scale(0.9); opacity: 0.4; }
  }

  .dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    display: inline-block;
    margin-right: 6px;
    flex-shrink: 0;
  }

  .badge.active .dot, .badge.waiting .dot {
    background-color: var(--purple);
    animation: pulse-glow 1.4s infinite ease-in-out;
  }

  .badge.done .dot {
    background-color: var(--green);
  }

  .badge.error .dot {
    background-color: var(--red);
  }
  ```

- [ ] **Step 2: Add Pencil Indicators to Inline-Editable Titles**
  Make titles reveal a tiny edit pencil `✏️` when hovered, communicating clarity of interaction.
  ```css
  .c-title {
    position: relative;
    padding-right: 24px;
  }

  .c-title::after {
    content: '✏️';
    position: absolute;
    right: 8px;
    top: 50%;
    transform: translateY(-50%);
    font-size: 10px;
    opacity: 0;
    transition: opacity 0.2s ease;
    pointer-events: none;
  }

  .c-title:hover::after {
    opacity: 0.5;
  }

  .c-title:focus::after {
    display: none;
  }
  ```

---

### Task 3: Grid-To-Card Media Responsive Transformations

Inject full responsive breakpoint rules to morph standard tables into standalone, rich card components on smaller viewports.

**Files:**
- Modify: `public/index.html` CSS sheet near the bottom (add responsive section)

- [ ] **Step 1: Write responsive media overrides**
  Write rules that break down tables and render fluid media cards for viewports under `768px`.
  ```css
  @media (max-width: 768px) {
    body {
      padding: 16px 8px 64px;
    }

    .container {
      gap: 16px;
    }

    /* Hide table layout & header tags */
    table, thead, tbody, tr, td {
      display: block;
      width: 100%;
    }

    thead {
      display: none;
    }

    /* Morph tr into Cards */
    tr {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 16px;
      margin-bottom: 16px;
      box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2);
      transition: border-color 0.2s ease, transform 0.2s ease;
      display: flex;
      flex-direction: column;
      gap: 12px;
      position: relative;
    }

    tr:hover {
      border-color: var(--border-hover);
    }

    /* Strip native table cell decorations */
    td {
      padding: 0 !important;
      border: none !important;
      text-align: left !important;
      width: auto !important;
      min-width: 0 !important;
    }

    /* Custom arrangements of cells inside cards */
    .c-num {
      font-family: var(--mono);
      color: var(--text-dark);
      font-size: 11px;
      position: absolute;
      top: 16px;
      right: 16px;
    }

    .c-url {
      font-size: 11px;
      color: var(--text-muted);
      word-break: break-all;
    }

    .c-title {
      font-size: 15px;
      font-weight: 600;
      color: var(--text);
      line-height: 1.4;
      padding-right: 32px !important;
      margin-top: 4px;
    }

    /* Render specs badges (Resolution, Format, Size, Duration) as inline chips row */
    .c-fmt, .c-size, .c-dur {
      display: inline-block;
      background: rgba(255, 255, 255, 0.04);
      border: 1px solid var(--border);
      padding: 4px 10px;
      border-radius: 12px;
      font-size: 11px;
      color: var(--text-muted);
      margin-right: 6px;
      font-family: var(--mono);
    }

    /* Wrap spec badges together */
    td:has(.badge) {
      order: -1; /* Place status badge high up */
    }

    /* Make stream URL field copyable on tap */
    .c-stream {
      border-top: 1px dashed var(--border) !important;
      padding-top: 12px !important;
      margin-top: 4px;
    }

    /* Action wrapper block */
    .act-wrap {
      border-top: 1px solid var(--border);
      padding-top: 12px;
      display: flex;
      flex-direction: column;
      gap: 10px;
      width: 100%;
    }

    .act-row {
      display: flex;
      gap: 8px;
      justify-content: flex-start;
      align-items: center;
    }
  }
  ```
