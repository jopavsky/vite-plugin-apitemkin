import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const css = readFileSync(
  fileURLToPath(new URL('../src/devtools/styles.css', import.meta.url)),
  'utf8',
);

describe('overlay styles.css', () => {
  it('never uses rem or em units (host font-size must not leak in)', () => {
    expect(css).not.toMatch(/\d(rem|em)\b/);
  });

  it('never uses an invalid "inherit" family inside a font shorthand', () => {
    expect(css).not.toMatch(/font:[^;]*\binherit\b/);
  });

  it('defines every brief token on :host', () => {
    for (const t of ['#FAFAF7', '#1F2A44', '#E8B93A', '#4A5363', '#767E8F', '#D9DCE3', '#9E3328']) {
      expect(css.toUpperCase()).toContain(t);
    }
  });

  it('has a dark-scheme block that redefines the panel tokens', () => {
    expect(css).toMatch(/@media\s*\(prefers-color-scheme:\s*dark\)/);
    expect(css.toUpperCase()).toContain('#161D2E');
  });

  it('has forced-colors rules for the override select and launcher', () => {
    expect(css).toMatch(/@media\s*\(forced-colors:\s*active\)[\s\S]*Highlight/);
  });

  it('a manual theme overrides the system setting', () => {
    expect(css).toMatch(/:host\(\[data-theme="dark"\]\)/);
    expect(css).toMatch(/prefers-color-scheme:\s*dark\)\s*\{\s*:host\(:not\(\[data-theme="light"\]\)\)/);
  });

  it('the request log animates height on the panel curve and never uses mustard', () => {
    expect(css).toMatch(/\.log\s*\{[^}]*grid-template-rows:\s*0fr[^}]*transition:[^}]*grid-template-rows 200ms cubic-bezier\(\.16, 1, \.3, 1\)[^}]*opacity 150ms ease-out/);
    expect(css).toMatch(/\.log\.open\s*\{[^}]*grid-template-rows:\s*1fr/);
    for (const rule of css.match(/\.(lg|log)[^{]*\{[^}]*\}/g) ?? []) expect(rule).not.toMatch(/mustard/);
  });

  it('footer and reset confirm wrap instead of clipping on narrow screens', () => {
    expect(css).toMatch(/\.foot\s*\{[^}]*flex-wrap:\s*wrap/);
    expect(css).toMatch(/\.confirm\s*\{[^}]*flex-wrap:\s*wrap/);
  });

  it('the active filter button is drawn from ink and panel, so it stays visible in dark', () => {
    expect(css).toMatch(/\.fb\.on\s*\{[^}]*background:\s*var\(--ink\)[^}]*color:\s*var\(--panel\)[^}]*border-color:\s*var\(--ink\)/);
  });

  it('polish: dynamic viewport height, radius on the scale, forced-colors edges on borderless buttons', () => {
    expect(css).toMatch(/max-height:\s*calc\(100vh - 24px\);\s*max-height:\s*calc\(100dvh - 24px\)/);
    expect(css).toMatch(/\.skel\s*\{[^}]*border-radius:\s*(6|8)px/);
    expect(css).toMatch(/\.qx\s*\{[^}]*border:\s*1px solid transparent/);
  });

  it('rows are one line: method, path, picker, log button', () => {
    expect(css).toMatch(/\.row\s*\{[^}]*grid-template-areas:\s*"m p s l"/);
    expect(css).toMatch(/\.row\.ns\s*\{[^}]*grid-template-areas:\s*"m p p l"/);
    expect(css).toMatch(/\.lg\.bad\s*\{[^}]*var\(--brick\)/);
  });

  it('content sits further from the panel edge', () => {
    expect(css).toMatch(/\.rows\s*\{[^}]*padding:\s*0\s+16px/);
  });

  it('the active picker is a pale mustard tint, not a full fill', () => {
    expect(css).toMatch(/\.sel\.on\s*\{[^}]*background-color:\s*color-mix\(in srgb, var\(--mustard\) 26%, var\(--field\)\)/);
    expect(css).not.toMatch(/\.sel\.on\s*\{[^}]*background-color:\s*var\(--mustard\)/);
  });

  it('text is 14px throughout (nothing at 13px)', () => {
    expect(css).not.toMatch(/13px/);
    expect(css).toMatch(/\.p\s*\{[^}]*font:\s*14px\/20px var\(--mono\)/);
  });

  it('the dark header stays navy', () => {
    expect(css).not.toMatch(/--head:\s*#0F1524/);
  });

  it('focus rings stay visible on navy in every scheme', () => {
    expect(css).toMatch(/\.launch:focus-visible\s*\{[^}]*0 0 0 2px var\(--header-text\)/);
    expect(css).toMatch(/\.head \.hb:focus-visible\s*\{[^}]*outline-color:\s*var\(--header-text\)/);
  });

  it('turns glass off under reduced transparency', () => {
    expect(css).toMatch(/prefers-reduced-transparency:\s*reduce/);
  });

  it('the panel grows from the launcher footprint instead of a scale-and-fade', () => {
    expect(css).toMatch(/@keyframes grow\s*\{\s*from\s*\{\s*clip-path:\s*inset\(var\(--from\)/);
    expect(css).not.toMatch(/scale\(\.96\)/);
  });

  it('keeps backdrop-filter off (prefixed too) while the panel animates', () => {
    expect(css).toMatch(/\.panel\[data-anim\]\s*\{[^}]*-webkit-backdrop-filter:\s*none/);
  });

  it('disabled footer buttons use the dimmer --off token', () => {
    expect(css).toMatch(/\.fb:disabled\s*\{[^}]*color:\s*var\(--off\)/);
  });
});
