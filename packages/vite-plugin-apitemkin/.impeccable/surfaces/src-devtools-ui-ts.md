---
version: 1
slug: "src-devtools-ui-ts"
primary_target: "src/devtools/ui.ts"
related_targets: []
---

## Direction contract
THESIS: One colour means "this route is faked differently right now": mustard, everywhere it applies and nowhere else, on a calm navy-and-frost panel. Refuses the category's grey devtools drawer with method-coloured badges.
OWN-WORLD: Solid slate-navy #1F2A44 header and launcher; frosted #FAFAF7 body at 0.92 with blur(14px) saturate(0); solid white fields with #767E8F edges; mustard #E8B93A only as the filled scenario pill and count chips; brick #9E3328 only for errors, always with icon or word; rounded system face, mono paths, soft 10px radii, pill controls.
STORY: The dev glances at the launcher, reads "orders: error" and knows why the app shows its error state; opens the panel, finds the route by folder or search, flips the scenario, opens the request log when the app disagrees, resets when done.
FIRST VIEWPORT: Panel docked to the launcher's corner, 440px wide, hugging content: navy header (apitemkin, Rescan mocks, theme, Close); search when 8+ routes; folder groups of one-line rows (method 6ch · path with dimmed /api/ · scenario pill 136px, pale mustard tint when overridden · 28px request-log button that opens the route's recent requests); footer (Show N overridden · Reset scenarios · ⌥⇧M / Alt+Shift+M). 14px type, 24px side inset. Launcher hidden while open. Signature interaction: the launcher grows into the panel (200 ms, solid surface, glass switches on at the end), the pill tints on override (150 ms), and the request log unfolds under its row; all off under reduced motion.
FORM: grounded safer-register card "Crash-test dummy, softened" refined to "Mustard + Slate Navy, frosted" by owner steer (target mark later removed by owner); seed:a96734728d495284
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
