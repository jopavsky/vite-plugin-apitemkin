import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { minifyCss } from '../build/minify-css.js';

describe('minifyCss', () => {
  it('strips comments and collapses whitespace', () => {
    expect(minifyCss('/* x */ .a { color : red ; }\n\n.b>c { margin: 0 }')).toBe(
      '.a{color:red}.b>c{margin:0}',
    );
  });

  it('keeps strings and url() contents intact', () => {
    expect(minifyCss('.a{content:"a  b"}')).toBe('.a{content:"a  b"}');
    expect(minifyCss('.a { background: url( "x  y.png" ) }')).toBe(
      '.a{background:url( "x  y.png" )}',
    );
  });

  it('keeps spaces that are significant inside values', () => {
    expect(minifyCss('.a { margin: 0 auto; font: 600 14px/1 sans-serif }')).toBe(
      '.a{margin:0 auto;font:600 14px/1 sans-serif}',
    );
  });

  it('keeps the space in descendant selectors and media queries', () => {
    expect(minifyCss('.a .b { x: 1 }\n@media (prefers-color-scheme: dark) { .a { x: 2 } }')).toBe(
      '.a .b{x:1}@media (prefers-color-scheme:dark){.a{x:2}}',
    );
  });

  it('keeps the space before a pseudo-class in a descendant selector', () => {
    expect(minifyCss('.head :focus-visible { outline: 0 }')).toBe('.head :focus-visible{outline:0}');
    expect(minifyCss('@media (x) { .a :hover { c: d } }')).toBe('@media (x){.a :hover{c:d}}');
    expect(minifyCss('.a{b:c}.d :e{f:g}')).toBe('.a{b:c}.d :e{f:g}');
  });

  it('keeps every selector of the real overlay stylesheet intact', () => {
    const src = readFileSync(fileURLToPath(new URL('../src/devtools/styles.css', import.meta.url)), 'utf8');
    const out = minifyCss(src);
    expect(out).toContain('.head .hb:focus-visible{');
    expect(out).not.toMatch(/\.head:focus-visible/);
  });

  it('drops quotes around simple attribute selector values', () => {
    expect(minifyCss('.p[data-corner="br"] .g, .p[data-corner$="r"] { x: 1 }')).toBe(
      '.p[data-corner=br] .g,.p[data-corner$=r]{x:1}',
    );
  });
});
