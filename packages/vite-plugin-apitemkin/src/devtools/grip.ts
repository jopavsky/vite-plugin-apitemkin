// Resize grip on the panel edge that faces the page. A real separator:
// focusable, arrow keys resize, pointer drag throttled to animation frames.

import { h } from './dom.js';
import { MAX_WIDTH, MIN_WIDTH, type UiPrefs } from './prefs.js';

const STEP = 16;
const BIG_STEP = 64;

export function syncGrip(grip: HTMLElement, width: number): void {
  grip.setAttribute('aria-valuenow', String(width));
  // Rendered width can sit below MIN_WIDTH on a small viewport; keep now within min.
  grip.setAttribute('aria-valuemin', String(Math.min(MIN_WIDTH, width)));
  grip.setAttribute('aria-valuetext', `${width} pixels wide`);
}

export function mountGrip(
  panel: HTMLElement,
  getPrefs: () => UiPrefs,
  setWidth: (px: number) => void,
): HTMLElement {
  const grip = h('div', {
    class: 'grip',
    'data-part': 'grip',
    role: 'separator',
    tabindex: '0',
    'aria-label': 'Resize panel',
    'aria-orientation': 'vertical',
    'aria-controls': 'apitemkin-panel',
    'aria-valuemin': String(MIN_WIDTH),
    'aria-valuemax': String(MAX_WIDTH),
  });
  syncGrip(grip, getPrefs().width);

  // Moving toward the page widens: left for a right-docked panel.
  const towardPage = (): number => (getPrefs().corner.endsWith('r') ? 1 : -1);

  grip.addEventListener('keydown', (e) => {
    const { width } = getPrefs();
    const step = e.shiftKey ? BIG_STEP : STEP;
    let next: number | null = null;
    if (e.key === 'ArrowLeft') next = width + step * towardPage();
    else if (e.key === 'ArrowRight') next = width - step * towardPage();
    else if (e.key === 'Home') next = MIN_WIDTH;
    else if (e.key === 'End') next = MAX_WIDTH;
    if (next === null) return;
    e.preventDefault();
    setWidth(next);
  });

  let startX = 0;
  let startW = 0;
  let frame = 0;
  let pendingX: number | null = null;

  grip.addEventListener('pointerdown', (e) => {
    startX = e.clientX;
    startW = getPrefs().width;
    grip.setPointerCapture?.(e.pointerId);
    panel.dataset['resizing'] = '';
  });
  grip.addEventListener('pointermove', (e) => {
    if (!grip.hasPointerCapture?.(e.pointerId)) return;
    pendingX = e.clientX;
    frame ||= requestAnimationFrame(() => {
      frame = 0;
      if (pendingX !== null) setWidth(startW + (startX - pendingX) * towardPage());
    });
  });
  const end = (e: PointerEvent): void => {
    grip.releasePointerCapture?.(e.pointerId);
    delete panel.dataset['resizing'];
  };
  grip.addEventListener('pointerup', end);
  grip.addEventListener('pointercancel', end);

  return grip;
}
