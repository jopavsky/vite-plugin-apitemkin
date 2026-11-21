---
name: apitemkin
description: The Potemkin village for your API.
colors:
  ink-navy: "#111827"
  graphite-panel: "#1f2937"
  slate-rule: "#374151"
  slate-control: "#4b5563"
  ash-text: "#6b7280"
  fog-text: "#9ca3af"
  control-border: "#d1d5db"
  hairline: "#e5e7eb"
  mist: "#f3f4f6"
  frost: "#f9fafb"
  paper-white: "#ffffff"
  get-blue: "#2563eb"
  post-green: "#16a34a"
  put-amber: "#d97706"
  signal-red: "#dc2626"
  oxide-ink: "#7f1d1d"
  blush-wash: "#fef2f2"
typography:
  title:
    fontFamily: "system-ui, -apple-system, \"Segoe UI\", sans-serif"
    fontSize: "12px"
    fontWeight: 600
    letterSpacing: "0.02em"
  body:
    fontFamily: "system-ui, -apple-system, \"Segoe UI\", sans-serif"
    fontSize: "12px"
    fontWeight: 400
  label:
    fontFamily: "system-ui, -apple-system, \"Segoe UI\", sans-serif"
    fontSize: "12px"
    fontWeight: 700
    letterSpacing: "0.05em"
  code:
    fontFamily: "ui-monospace, \"SF Mono\", Menlo, monospace"
    fontSize: "11.5px"
    fontWeight: 400
  code-pill:
    fontFamily: "ui-monospace, \"SF Mono\", Menlo, monospace"
    fontSize: "10px"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "0.03em"
rounded:
  pill: "3px"
  control: "4px"
  panel: "8px"
  full: "999px"
spacing:
  2xs: "3px"
  xs: "6px"
  sm: "8px"
  md: "12px"
  lg: "24px"
  xl: "32px"
components:
  launcher:
    backgroundColor: "{colors.ink-navy}"
    textColor: "{colors.mist}"
    rounded: "{rounded.full}"
    padding: "6px 14px"
  launcher-hover:
    backgroundColor: "{colors.graphite-panel}"
  launcher-badge:
    backgroundColor: "{colors.signal-red}"
    textColor: "{colors.paper-white}"
    rounded: "{rounded.full}"
    padding: "1px 6px"
  panel:
    backgroundColor: "{colors.paper-white}"
    textColor: "{colors.ink-navy}"
    rounded: "{rounded.panel}"
    width: "440px"
  panel-dark:
    backgroundColor: "{colors.graphite-panel}"
    textColor: "{colors.mist}"
    rounded: "{rounded.panel}"
    width: "440px"
  panel-header:
    backgroundColor: "{colors.frost}"
    typography: "{typography.title}"
    padding: "10px 12px"
  button-secondary:
    backgroundColor: "{colors.paper-white}"
    textColor: "{colors.ink-navy}"
    rounded: "{rounded.control}"
    padding: "3px 8px"
  button-secondary-hover:
    backgroundColor: "{colors.mist}"
  button-danger:
    backgroundColor: "{colors.signal-red}"
    textColor: "{colors.paper-white}"
    rounded: "{rounded.control}"
    padding: "3px 10px"
  method-pill-get:
    backgroundColor: "{colors.get-blue}"
    textColor: "{colors.paper-white}"
    typography: "{typography.code-pill}"
    rounded: "{rounded.pill}"
    padding: "3px 6px"
  method-pill-post:
    backgroundColor: "{colors.post-green}"
    textColor: "{colors.paper-white}"
    typography: "{typography.code-pill}"
    rounded: "{rounded.pill}"
    padding: "3px 6px"
  method-pill-put:
    backgroundColor: "{colors.put-amber}"
    textColor: "{colors.paper-white}"
    typography: "{typography.code-pill}"
    rounded: "{rounded.pill}"
    padding: "3px 6px"
  method-pill-delete:
    backgroundColor: "{colors.signal-red}"
    textColor: "{colors.paper-white}"
    typography: "{typography.code-pill}"
    rounded: "{rounded.pill}"
    padding: "3px 6px"
  scenario-select:
    backgroundColor: "{colors.paper-white}"
    rounded: "{rounded.control}"
    padding: "2px 4px"
  table-header:
    backgroundColor: "{colors.frost}"
    textColor: "{colors.slate-control}"
    typography: "{typography.label}"
    padding: "6px 12px"
---

<!-- BASELINE: records the shipped v1.2 UI as of 2026-11-21, before a planned full redesign. Treat it as evidence of what exists, and as an anti-reference for the new look, not as direction. The redesign replaces this file through new-work. -->

# Design System: apitemkin

## Overview

**Creative North Star: "The Stock Devtools Drawer"**

*(A description of what shipped, not a chosen direction. The redesign picks a new North Star.)*

The only designed surface is the dev-tools overlay: a dark pill launcher pinned bottom-right, and a 440px side panel holding one dense table of routes. It borrows the look of a generic browser-devtools utility, built from the stock Tailwind gray, blue, green, amber and red values, hand-typed into a CSS string. The panel is utilitarian and compact (12px text, 6px row padding), and it has no brand expression beyond the lowercase wordmark "apitemkin" on the launcher and the "apitemkin · scenarios" header. The README's Potemkin wit appears nowhere in the UI.

It lives inside a closed shadow root in someone else's app, so every value is self-contained: no custom properties, no web fonts, no images, no icons. Light and dark follow the OS through `prefers-color-scheme`, not the host page. The other surfaces have no system at all. The playground is a browser-default page with one `<pre>`, and there is no docs site yet.

**Key Characteristics:**
- One surface, one table, one control per row (a native `<select>`).
- Color carries the HTTP method; everything else is gray.
- Flat inside, floating outside: two soft shadows lift the launcher and panel off the host page.
- No motion. The panel snaps between `display: none` and `flex`.
- Every value hard-coded; there are no tokens or variables.

## Colors

A cool Tailwind-gray utility palette, with four saturated method colors as the only accents.

### Primary
- **Ink Navy** (`ink-navy`): launcher background in both schemes; panel text in light mode; header and table-header background in dark mode. The closest thing to a brand color.

### Secondary
- **Method Blue** (`get-blue`): GET pill, plus the dot marking a route with an active scenario override. That second use is the only non-method job any accent has.
- **Method Green** (`post-green`): POST pill.
- **Method Amber** (`put-amber`): PUT and PATCH pills.
- **Signal Red** (`signal-red`): DELETE pill, the launcher's count badge, and the destructive "Clear" button. It carries three unrelated meanings.

### Neutral
- **Graphite Panel** (`graphite-panel`): dark-mode panel surface; launcher hover.
- **Slate Rule** (`slate-rule`): launcher border; all dark-mode dividers and row hover.
- **Slate Control** (`slate-control`): light-mode table-header text; dark-mode control borders.
- **Ash** (`ash-text`): empty-state text; fallback pill for unknown methods.
- **Fog** (`fog-text`): the italic em-dash shown for routes without scenarios; dark-mode empty state.
- **Control Border** (`control-border`): light-mode button, select and panel borders; dark-mode table-header text.
- **Hairline** (`hairline`): light-mode header divider.
- **Mist** (`mist`): light-mode row dividers and button hover; launcher text; dark-mode body text.
- **Frost** (`frost`): light-mode header, table header and row hover.
- **Paper White** (`paper-white`): light-mode panel and control surface.

### Alert
- **Oxide Ink** (`oxide-ink`) on **Blush Wash** (`blush-wash`): the reset-confirmation bar in light mode. Dark mode flips it to an oxide background with pale pink text.

**The Method-Is-the-Color Rule.** Saturated color appears only on method pills, plus the active dot, the badge and the danger button. Everything structural is gray.

## Typography

**Body Font:** system-ui (with -apple-system, "Segoe UI", sans-serif)
**Mono Font:** ui-monospace (with "SF Mono", Menlo, monospace)

**Character:** Zero-cost system type. The sans handles chrome and the mono handles API facts: methods and URLs.

### Hierarchy
- **Title** (600, 12px, 0.02em): the panel's single header, "apitemkin · scenarios".
- **Body** (400, 12px): table cells and empty-state messages (empty states at line-height 1.5).
- **Label** (bold, 12px, 0.05em, uppercase): table column headers. Authored as 600/10px, but see the defect note below.
- **Code** (400, 11.5px mono): route URLs, breaking anywhere (`word-break: break-all`).
- **Code Pill** (600, 10px/1 mono, 0.03em, uppercase): method pills.

**Known defect: invalid font shorthands.** `.launcher`, the header buttons, `.empty button` and `th` all set `font: <weight> <size>/1 inherit`. `inherit` is not a valid family inside the shorthand, so browsers drop the whole declaration. Buttons and the launcher render in the UA button font (about 13.3px, platform default family), and column headers render at the inherited 12px in UA bold. That's why the header buttons look larger than the table text. Record this as what ships; don't carry the pattern forward.

## Layout

- **Launcher:** fixed, 12px from the bottom and right edges, z-index `2147483647` (the maximum).
- **Panel:** fixed, 12px inset from top, right and bottom; 440px wide, capped at `100vw - 24px`. It's a full-height column: header, optional confirm bar, then a scrolling content area. z-index `2147483646`, one below the launcher, so the launcher always floats over the panel's bottom corner.
- **Table:** full width, collapsed borders, four columns (Method, URL, Scenario, and an unlabeled 24px active-dot column). The header row is sticky. Cells pad 6px vertically and 12px horizontally.
- **Empty states:** centered, padded 32px by 24px.
- **Density:** compact. Rows are about 30px tall with a pill, or about 37px with a select.
- **Responsive:** the width cap is the only responsive behavior. There are no breakpoints.
- **Playground:** browser defaults, 60rem centered column with 2rem top margin, one `<pre>` on a #f5f5f5 tint with 6px radius. No system.

## Elevation & Depth

Hybrid. Inside the panel everything is flat and separated by 1px dividers and tonal header fills. The overlay as a whole floats above the host page on two soft, neutral shadows. The shadows are identical in both color schemes, so they almost disappear in dark mode, where the 1px slate border does the work instead.

### Shadow Vocabulary
- **Launcher float** (`box-shadow: 0 4px 14px rgba(0,0,0,0.18)`): the resting launcher pill.
- **Panel float** (`box-shadow: 0 12px 32px rgba(0,0,0,0.18)`): the open panel.

## Shapes

Small, generic radii on a rectangular frame. The launcher and badge are full capsules (999px), the panel has gently curved corners (8px), controls are slightly softened (4px), and method pills are nearly square (3px). The active marker is a 7px circle. Every container has a 1px border; there are no dashed or heavier strokes.

## Components

### Launcher
*A dark capsule that names the tool and counts overrides.*
- **Shape:** full capsule (999px), 1px Slate Rule border, padding 6px by 14px.
- **Color:** Ink Navy with Mist text; Graphite Panel on hover. It doesn't change in dark mode.
- **Badge:** a Signal Red capsule after the wordmark showing how many routes have a non-default scenario. It's hidden when the count is zero.
- **States:** hover only. No focus-visible style beyond the UA default, and no pressed or open state; the launcher looks the same whether the panel is open or closed.

### Buttons
- **Secondary (header: Refresh, Reset all):** Paper White, 1px Control Border, 4px radius, 3px by 8px; hover goes to Mist. Dark mode: Graphite Panel surface with a Slate Control border. While refreshing, the label becomes "…" and the button is disabled.
- **Close:** a borderless, transparent "×" at 18px, with `aria-label="Close"`.
- **Danger (confirm "Clear"):** Signal Red, white text, borderless, 4px radius, 3px by 10px.
- **Cancel:** white with a 1px Control Border. It sets no text color, so its label relies on the UA default.
- **Focus:** no custom focus styles anywhere; it relies on UA outlines.

### Confirm bar
An inline strip inserted between the header and the table when "Reset all" is clicked with selections present. It reads "Clear all scenario selections?" with Clear and Cancel buttons. Light mode: Blush Wash background, a pale-pink #fecaca bottom border, Oxide Ink text. Dark mode: Oxide Ink background, a #991b1b border, #fee2e2 text.

### Method pill (signature)
- **Style:** solid fill in the method color, white mono text at 10px, 3px radius, 3px by 6px.
- **Mapping:** GET is blue; POST is green; PUT and PATCH are amber; DELETE is red; anything else is Ash.

### Route table
- **Header:** sticky, Frost fill (Ink Navy in dark mode), uppercase tracked labels in Slate Control.
- **Rows:** 1px Mist divider (Slate Rule in dark mode), full-row hover tint in Frost (Slate Rule in dark mode).
- **Scenario cell:** a full-width native `<select>` (4px radius, 1px Control Border, 2px by 4px padding), with `default` always first. Routes without scenarios show an italic Fog em-dash.
- **Active cell:** a 7px Method Blue dot when the route has a non-default selection.

### Empty states
Centered Ash text: "Loading routes…"; "No mocks discovered. Add one in mocks/ and click Refresh."; or a discovery error with a Retry button styled like the secondary button.

## Do's and Don'ts

These split into durable constraints that come from how the overlay must work (they survive the redesign) and observations about the incumbent look (evidence for the redesign, not rules).

### Do:
- **Do** keep every style self-contained inside the closed shadow root. Host CSS can't reach in and overlay CSS must not leak out. *(Durable.)*
- **Do** follow the OS color scheme. The overlay must read in both light and dark regardless of the host page's palette. *(Durable.)*
- **Do** keep the overlay above everything (`z-index` at or near `2147483647`), and keep the launcher clickable when the panel is open. *(Durable.)*
- **Do** set monospace for API facts (methods, URLs, scenario names). *(Incumbent pattern, worth keeping.)*
- **Do** fit the bundle budget: overlay JS plus CSS at or under 15 kB minified. Don't load anything over the network. *(Durable.)*

### Don't:
- **Don't** write `font: … inherit` shorthands. They are invalid and silently fall back to UA fonts. *(Known defect.)*
- **Don't** load web fonts, images or icon packages into the overlay. They cost bundle budget and network requests inside someone else's dev page. *(Durable; inline SVG is fine.)*
- **Don't** treat the incumbent's stock Tailwind palette, generic gray chrome or absence of brand voice as the identity to preserve. A full redesign is planned. *(Baseline note.)*
- **Don't** reuse one red for unrelated meanings (DELETE, a neutral count, destructive confirm), as the incumbent does. *(Observed issue.)*
