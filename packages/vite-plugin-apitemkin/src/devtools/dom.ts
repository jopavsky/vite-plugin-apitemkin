// Tiny DOM helpers shared by the overlay modules.

const SVG_NS = 'http://www.w3.org/2000/svg';

type Attrs = Record<string, string | boolean | undefined>;

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...children: (Node | string | null | false | undefined)[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === false || v === undefined) continue;
    if (k === 'class') el.className = String(v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children) if (c) el.append(c);
  return el;
}

/** Inline icon from 16x16 path data (stroked, currentColor). */
export function icon(d: string): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('class', 'ic');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', d);
  svg.append(path);
  return svg;
}

export const ICON = {
  close: 'M4 4l8 8M12 4l-8 8',
  alert: 'M8 2.5l6 11H2zM8 7v3M8 12h.01',
  search: 'M7 12A5 5 0 1 0 7 2a5 5 0 0 0 0 10zM14 14l-3.5-3.5',
  chevron: 'M4 6l4 4 4-4',
  log: 'M5 4.5h8M5 8h8M5 11.5h8M2.5 4.5h.01M2.5 8h.01M2.5 11.5h.01',
  auto: 'M8 2a6 6 0 1 1 0 12A6 6 0 0 1 8 2zM8 2v12',
  light: 'M8 5a3 3 0 1 1 0 6 3 3 0 0 1 0-6zM8 1v2M8 13v2M1 8h2M13 8h2M3 3l1.5 1.5M11.5 11.5L13 13M3 13l1.5-1.5M11.5 4.5L13 3',
  dark: 'M13 9.5A5.5 5.5 0 0 1 6.5 3a5.5 5.5 0 1 0 6.5 6.5z',
};

export const isMac = (): boolean => /Mac|iPhone|iPad/.test(navigator.platform);

export const isTextField = (el: EventTarget | null): boolean =>
  el instanceof HTMLElement && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT');

/** shadowRoot.activeElement, tolerant of DOMs that throw when focus was detached. */
export function activeIn(root: ShadowRoot): Element | null {
  try {
    return root.activeElement;
  } catch {
    return null;
  }
}
