---
name: apitemkin
description: The Potemkin village for your API.
colors:
  slate-navy: "#1F2A44"
  slate-navy-hover: "#2B3858"
  header-text: "#F3F4F8"
  frost-panel: "#FAFAF7"
  frost-glass: "rgba(250, 250, 247, 0.92)"
  field-white: "#FFFFFF"
  mustard: "#E8B93A"
  brick: "#9E3328"
  muted-slate: "#4A5363"
  edge-slate: "#767E8F"
  hairline: "#D9DCE3"
  disabled-slate: "#8A92A3"
  tint: "rgba(31, 42, 68, 0.06)"
typography:
  title:
    fontFamily: "ui-rounded, \"SF Pro Rounded\", system-ui, -apple-system, \"Segoe UI\", sans-serif"
    fontSize: "17px"
    fontWeight: 600
    lineHeight: 1.2
  headline:
    fontFamily: "ui-rounded, \"SF Pro Rounded\", system-ui, -apple-system, \"Segoe UI\", sans-serif"
    fontSize: "15px"
    fontWeight: 600
    lineHeight: 1.35
  body:
    fontFamily: "ui-rounded, \"SF Pro Rounded\", system-ui, -apple-system, \"Segoe UI\", sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.45
  label:
    fontFamily: "ui-rounded, \"SF Pro Rounded\", system-ui, -apple-system, \"Segoe UI\", sans-serif"
    fontSize: "14px"
    fontWeight: 600
    lineHeight: 1
  code:
    fontFamily: "ui-monospace, \"SF Mono\", Menlo, Consolas, monospace"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: "20px"
  code-strong:
    fontFamily: "ui-monospace, \"SF Mono\", Menlo, Consolas, monospace"
    fontSize: "14px"
    fontWeight: 600
    lineHeight: "20px"
rounded:
  chip: "6px"
  control: "8px"
  field: "10px"
  row: "10px"
  panel: "12px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "20px"
  xxl: "24px"
components:
  launcher:
    backgroundColor: "{colors.slate-navy}"
    textColor: "{colors.header-text}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "0 15px"
    height: "40px"
  launcher-hover:
    backgroundColor: "{colors.slate-navy-hover}"
  launcher-chip:
    backgroundColor: "{colors.mustard}"
    textColor: "{colors.slate-navy}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "0 10px"
    height: "24px"
  panel:
    backgroundColor: "{colors.frost-glass}"
    textColor: "{colors.slate-navy}"
    rounded: "{rounded.panel}"
    width: "440px"
  panel-header:
    backgroundColor: "{colors.slate-navy}"
    textColor: "{colors.header-text}"
    typography: "{typography.title}"
    padding: "12px 16px 12px 24px"
  header-button:
    backgroundColor: "rgba(250, 250, 247, 0.12)"
    textColor: "{colors.header-text}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "0 14px"
    height: "32px"
  footer-button:
    backgroundColor: "{colors.field-white}"
    textColor: "{colors.slate-navy}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "0 12px"
    height: "32px"
  footer-button-on:
    backgroundColor: "{colors.slate-navy}"
    textColor: "{colors.frost-panel}"
  footer-button-disabled:
    backgroundColor: "transparent"
    textColor: "{colors.disabled-slate}"
  search-field:
    backgroundColor: "{colors.field-white}"
    textColor: "{colors.slate-navy}"
    rounded: "{rounded.field}"
    padding: "0 40px 0 36px"
    height: "38px"
  scenario-pill:
    backgroundColor: "{colors.field-white}"
    textColor: "{colors.slate-navy}"
    typography: "{typography.body}"
    rounded: "{rounded.pill}"
    padding: "0 28px 0 12px"
    height: "28px"
    width: "136px"
  scenario-pill-overridden:
    backgroundColor: "color-mix(in srgb, {colors.mustard} 26%, {colors.field-white})"
    textColor: "{colors.slate-navy}"
  log-button:
    backgroundColor: "transparent"
    textColor: "{colors.muted-slate}"
    rounded: "{rounded.control}"
    padding: "0"
    size: "28px"
  log-button-hover:
    backgroundColor: "{colors.field-white}"
    textColor: "{colors.slate-navy}"
  log-button-disabled:
    backgroundColor: "transparent"
    textColor: "{colors.disabled-slate}"
  log-button-bad:
    backgroundColor: "transparent"
    textColor: "{colors.brick}"
  request-log:
    backgroundColor: "transparent"
    textColor: "{colors.slate-navy}"
    typography: "{typography.code}"
    padding: "4px 0 2px 12px"
  group-chip:
    backgroundColor: "{colors.mustard}"
    textColor: "{colors.slate-navy}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "0 8px"
    height: "22px"
  route-row:
    backgroundColor: "transparent"
    textColor: "{colors.slate-navy}"
    typography: "{typography.code}"
    rounded: "{rounded.row}"
    padding: "8px"
  kbd-hint:
    backgroundColor: "{colors.field-white}"
    textColor: "{colors.muted-slate}"
    typography: "{typography.code}"
    rounded: "{rounded.chip}"
    padding: "1px 6px"
---

# Design System: apitemkin

## Overview

**Creative North Star: "The One Mustard Rule"**

One colour in this overlay means a single thing: this route is faked differently right now. Mustard appears wherever that is true and nowhere else, on an otherwise calm panel of slate navy and frosted off-white. Everything that is not an override is quiet: navy, frost, slate greys, white fields. A developer glancing at the launcher should read "orders: error" and know why their app is showing its error state, without opening anything.

The overlay lives inside someone else's app, in a closed shadow root, so it behaves like a polite guest with a clear voice. The header and launcher are always solid navy, so the tool is findable over any host page. The body is a frosted glass surface held at a 0.92 opacity floor with no saturation boost, so the host never bleeds through enough to hurt legibility. Type is the system's own rounded face where the platform has one, with mono for paths and numbers. Controls are pills; containers take soft 10 to 12px radii. There is no target or crash-test mark; the owner removed it, and the wordmark `apitemkin` (always lowercase) carries identity alone.

It rejects the category's grey devtools drawer with method-coloured badges. Method is plain mono text; colour is reserved for state.

**Key Characteristics:**
- Mustard (override) and brick (error) are the only two state colours; each has exactly one job.
- Solid navy header and launcher, frosted body, solid white fields with visible edges.
- System fonts only, 14px body, nothing under 14px, mono for API facts.
- Pill controls, 10px row and field radii, 12px panel radius.
- Motion is three short moves (launcher growing into the panel, the picker tinting, the request log unfolding), all off under reduced motion.
- Self-contained: no web fonts, images or network; overlay bundle at or under 150 kB minified.

## Colors

A cool navy-and-frost palette with one warm signal (mustard) and one alarm (brick), both used sparingly.

### Primary
- **Slate Navy** (`slate-navy`): the header, the launcher, text on frost (as the ink token), the focus ring, and the filled "on" state of the footer filter toggle. In dark, ink turns light and the header stays this navy, like the launcher. The structural voice of the tool. Hover lifts to **Slate Navy Hover** (`slate-navy-hover`), used on the launcher only.
- **Header Text** (`header-text`): text and icon colour on navy surfaces.

### Secondary
- **Mustard** (`mustard`): only for "faked differently right now": the pale mustard tint of an overridden scenario pill, the count or name chip on the launcher, and the "N overridden" chip on a collapsed folder group. Text on mustard is always Slate Navy.

### Tertiary
- **Brick** (`brick`): only for errors (the discovery failure heading, the log button's `.bad` state when the route's last request failed unexpectedly, and unexpected lines in the request log), always paired with an icon or a word, never colour alone.

### Neutral
- **Frost Panel** (`frost-panel`): the opaque panel surface, used during the grow animation, under reduced transparency, and where backdrop blur is unsupported; also the text on an ink fill (the active filter button, text selection), so that fill stays legible in dark.
- **Frost Glass** (`frost-glass`): the resting panel body, with `blur(14px) saturate(0)`. The 0.92 alpha is a floor, not a tuning knob.
- **Field White** (`field-white`): inputs, scenario pills at rest, footer buttons, kbd hint, the log button on hover or open.
- **Muted Slate** (`muted-slate`): secondary text, dimmed `/api/` prefix, method labels, request-log results and the log button's glyph at rest.
- **Edge Slate** (`edge-slate`): control borders (including the log button), resize grip, scrollbar thumb.
- **Hairline** (`hairline`): row and footer dividers, the request log's left rule, the disabled log button's border, skeleton bars, kbd border.
- **Disabled Slate** (`disabled-slate`): disabled control text only; deliberately dimmer than muted and exempt from the text contrast floor.
- **Tint** (`tint`): a 6% ink wash for inline code backgrounds in the discovery states; 8% light ink in dark. (The header buttons' frost fill is its own rgba value, not this token.)

### Named Rules
**The One Mustard Rule.** Mustard means an override and nothing else. It is never decoration, never a hover, never a brand flourish. If nothing is overridden, no mustard is on screen.

**The Words-Beside-Brick Rule.** Brick never stands alone. An error carries an icon or a word so it survives colour-blindness and forced colors.

**The Black-Host Contrast Rule.** Text meets 4.5:1 and control edges meet 3:1, measured with the panel over a black host page, the worst case for glass. Solid navy surfaces are exempt because they do not depend on the host.

## Typography

**Display Font:** none; the title is the system face at 17px.
**Body Font:** `ui-rounded` (with "SF Pro Rounded", system-ui, -apple-system, "Segoe UI", sans-serif)
**Label/Mono Font:** `ui-monospace` (with "SF Mono", Menlo, Consolas, monospace)

**Character:** Zero-cost system type that picks up the platform's friendly rounded face where it exists and stays neutral where it does not. Sans speaks to the developer; mono speaks for the API (methods, paths, timings, shortcuts).

### Hierarchy
- **Title** (600, 17px, 1.2): the single header, `apitemkin`.
- **Headline** (600, 15px, 1.35): state headings such as "Couldn't load routes".
- **Body** (400, 14px, 1.45): search input, state paragraphs.
- **Label** (600, 14px, line-height 1): buttons, pills, chips, the launcher wordmark (14px).
- **Code** (400, 14px, 20px): route paths, request log lines, notes, inline code; method is the same size at 600; numbers use tabular figures.

### Named Rules
**The Fourteen Floor Rule.** Nothing is smaller than 14px (raised from 13px on 2026-11-22 for legibility). Sizes are always in px so the host page's root font-size cannot leak in.

**The Mono-For-Facts Rule.** Method, path, timing, status, URL and shortcut are mono. Everything that talks to the developer is sans.

## Layout

A single docked panel, 440px wide by default (resizable from 400 to 720px by a grip on the edge facing the page), hugging its content and capped at the viewport minus 24px (height uses 100dvh with a 100vh fallback). When the panel's rendered width is under 440px, whether from a resize or a small viewport squeezing it, the narrow layout applies and the scenario pill shrinks to 112px; the panel's measured width drives this, not the saved one. While a search or the overridden filter is active the panel keeps the height it had, so the footer doesn't jump as rows disappear. It docks to whichever of four corners holds the launcher, 12px from the edges. The launcher is hidden while the panel is open.

Inside: navy header, optional search (shown at 8+ routes), a scrolling list of folder groups, and a footer. Each row does one job on a single line, a four-column grid (`"m p s l"`): method in 6ch, path filling the rest, scenario pill at 136px (112px when narrow), and the 28px request-log button. Routes with no scenarios let the path take the pill column (`"m p p l"`). The request log opens under the row, spanning all columns. Rhythm is 4, 8, 12, 16, 20, 24px; content sits 24px from the panel edge on both sides (header 12px 16px 12px 24px, search 12px 24px 4px, rows container 0 16px 8px plus 8px row padding, states 16px 24px 20px, footer 12px 24px), so it aligns under the header title. Groups are 36px collapsible summaries; rows are at least 44px tall.

Responsive behavior is width-only: the panel shrinks to fit narrow viewports, the pill narrows with it, and the footer and the Reset confirm wrap onto a second line on small screens.

## Elevation & Depth

Hybrid of tonal and blurred depth. The panel is a frosted-glass slab over the host, lifted by one long soft shadow; inside it is flat, separated by 1px hairlines. The launcher is the only solid object that floats on its own shadow. Glass is switched off (opaque frost) during the grow animation, under reduced transparency, and where backdrop-filter is unsupported.

### Shadow Vocabulary
- **Launcher float** (`box-shadow: 0 8px 24px rgba(0,0,0,.26)`): the resting launcher. On keyboard focus it adds a 2px frost ring inside the navy outline.
- **Panel float** (`box-shadow: 0 18px 50px rgba(0,0,0,.2), 0 2px 6px rgba(0,0,0,.08)`): the open panel, with a 1px navy 16% border.
- **Glass** (`backdrop-filter: blur(14px) saturate(0)` on frost at 0.92): the panel body.

### Named Rules
**The Solid-Anchors Rule.** The header and launcher are always solid navy, never glass, so the tool is identifiable over any host.

**The Flat-Inside Rule.** Nothing inside the panel casts a shadow. Depth inside is a hairline or a tonal fill.

## Shapes

Soft, rounded, and pill-led. Action controls (launcher, header and footer buttons, scenario pill, chips) are full pills (999px). Fields and rows take 10px, square icon buttons and the grouping summary 8px, inline code and kbd 6px, the panel 12px. Borders are 1px; the "on" state of a scenario pill is a tint fill and bold text, not a heavier stroke. The resize grip is a two-line 6px by 24px handle on the page-facing edge. Icons are inline SVG, 16px (14px for the alert inside request-log lines), stroked at 1.6 with round caps; the alert is a stroked triangle and the log glyph is three dotted lines.

## Components

### Launcher
*A solid navy pill that names the tool and, when something is faked, says what.*
- **Shape:** 40px high pill, 15px side padding (7px right when a chip is present), 1px frost 30% border.
- **Chip:** mustard pill, 24px high, up to 190px wide, ellipsis; appears only when routes are overridden.
- **States:** hover lifts to Slate Navy Hover; focus shows a navy 2px outline with a frost inner ring. Draggable by more than 8px to snap to the nearest corner; Alt+Shift+arrows move it by keyboard. Grows into the panel in 200ms.

### Panel and header
- **Panel:** frosted body, 12px radius, 440px default. Header is solid navy in both themes with the title, a "Rescan mocks" pill (32px, frost 12% fill, 20% on hover, 60% opacity when disabled; it reloads the mock files, it does not re-run app requests), a 32px round theme button that cycles Auto, Light and Dark with its own icon each (the label names the current theme), and a 32px round Close button.
- **Motion:** the panel clips outward from the launcher's footprint over 200ms (`cubic-bezier(.16,1,.3,1)`) on an opaque surface, then glass switches on.

### Buttons (footer)
- **Shape:** 32px pills, 12px padding, 600 14px label, 1px Edge Slate border on Field White.
- **Hover:** border darkens to Slate Navy. **On** (the "Show N overridden" filter toggle): ink fill, ink border, Frost Panel text, so it inverts correctly in dark. **Disabled:** transparent, hairline border, Disabled Slate text.
- **Destructive confirm:** an inline row replaces the footer ("Reset N routes to default?" with Cancel and Reset); Cancel takes focus first. The footer and the confirm both wrap on small screens. No brick or red fill; the confirm is a sentence, not an alarm.

### Search field
Rounded 10px, 38px high, Field White with an Edge Slate border, leading search icon, a clear button when filled, and a mono `/` hint when empty. Placeholder reads "Filter N routes".

### Route row (signature)
One job per row, on a single line: method (mono 600, muted) · path (mono, `/api/` prefix dimmed) · scenario pill · request-log button. There is no second line; what the route answered lives in the request log. Rows are separated by an inset hairline.

### Scenario pill (signature)
A native select styled as a 28px pill with a drawn chevron. At rest white with an edge border; when overridden it takes a pale mustard tint (26% mustard over Field White, `#F8EDD0` where `color-mix` is unsupported) in 150ms with bold ink text and the normal edge, and its accessible name says "overridden". The page's own `?_scenario=` never locks it.

### Request-log button
A 28px square, 8px radius, 1px Edge Slate border on transparent, with the muted 16px stroked list glyph. Hover or open: Field White background, ink border, ink glyph. Disabled until the route has been called: Disabled Slate glyph, hairline border. When the route's last request failed unexpectedly (a 5xx that carried no scenario) it takes `.bad`: the list glyph is replaced by the alert triangle, in brick with a brick border, and its accessible name adds ", last request failed unexpectedly". The shape change carries the state in forced colors and for colour-blind users, so brick never stands alone. Never mustard. Forced colors: ButtonText edge.

### Request log
Opens under the row, spanning all columns: a 2px hairline left rule, 12px inner left padding, no heading (the button names it). Lines are a 3-column mono grid, newest first, at most 10 requests: the scenario name (ink 600); the result (`status · ms` muted, `… 1.2 s` while in flight, brick 600 with the alert icon and "unexpected 500 · ms" for an unexpected failure, ink with the alert icon and "not in mocks → default" for a name the route doesn't define); and a source tag in 14px mono, muted: `via _scenario param` when the request carried its own `?_scenario=` (tooltip: it wins over the picker), `via picker` when the scenario came from this panel; lines served at default with no scenario carry no tag. A 5xx the scenario asked for stays muted like any result. It opens and closes with the same animation: grid rows 0fr to 1fr in 200ms on the panel curve, a 150ms fade and a 4px slide; Esc collapses it first.

### Group summary
A 36px collapsible row with a stroked chevron, path in mono (prefix dimmed). When collapsed and containing overrides, a mustard "N overridden" chip appears; open groups hide it.

### Discovery states
Loading is three hairline skeleton bars with a screen-reader label. Empty reads "No mocks yet. The village is empty." with a `mocks/hello.json` to `GET /api/hello` example in inline code. Error shows a brick heading with an alert icon, a mono detail line naming the failing discovery request, plain-language next step, and a Retry pill. Wit sits in the empty state; errors stay exact first.

## Do's and Don'ts

### Do:
- **Do** use mustard (`#E8B93A`) solely for overrides: the tinted scenario pill, the solid launcher chip and the solid collapsed-group chip. Put Slate Navy text on it.
- **Do** use brick (`#9E3328`) solely for errors, and pair it with an icon or word.
- **Do** keep the header and launcher solid navy, and the glass body at or above 0.92 with `blur(14px) saturate(0)`.
- **Do** keep every control edge at 3:1 or better and text at 4.5:1, measured over a black host.
- **Do** use system fonts only: the rounded stack for chrome, mono for paths, numbers and shortcuts; 14px body and minimum, sizes in px.
- **Do** keep everything inside the closed shadow root with no web fonts, images or network requests, and the overlay bundle at or under 150 kB minified. Follow the OS light/dark setting unless the user picked a theme with the header button (Auto / Light / Dark, saved).
- **Do** give every control a visible edge in forced colors, and turn off the grow, tint and unfold motion under reduced motion; fall back to an opaque panel under reduced transparency.
- **Do** copy PRODUCT.md voice: dry wit in empty states, exact and actionable in errors.

### Don't:
- **Don't** use mustard for anything that is not an override (no hover states, accents or decoration).
- **Don't** colour HTTP methods or add method-coloured badges.
- **Don't** let brick appear without an icon or a word.
- **Don't** make the header or launcher translucent, or boost glass saturation or lower its 0.92 floor.
- **Don't** add a target, crash-test or other mark to the overlay; the owner removed it.
- **Don't** add shadows inside the panel, web fonts, icon packages or raster images.
- **Don't** set anything below 14px or in rem/em.
