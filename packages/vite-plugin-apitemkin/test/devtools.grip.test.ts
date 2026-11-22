// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mountPanel, type PanelHooks, type PanelController } from '../src/devtools/ui.js';
import { createActivity } from '../src/devtools/activity.js';

function memoryStorage(seed: Record<string, string> = {}) {
  const m = new Map(Object.entries(seed));
  const storage = {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  } as unknown as Storage;
  return { storage, saved: () => JSON.parse(m.get('apitemkin:ui') ?? 'null') as { corner: string; width: number } | null };
}

function mount(storage: Storage | null = null): PanelController {
  const hooks: PanelHooks = {
    state: {},
    getRoutes: () => [{ method: 'GET', url: '/api/orders', scenarios: ['default', 'error'] }],
    getStatus: () => 'ok',
    getError: () => null,
    refresh: () => Promise.resolve(),
    onChange: () => {},
    activity: createActivity(() => 0),
    origin: 'http://localhost:5173',
    storage,
  };
  const ctl = mountPanel(hooks);
  ctl.open();
  return ctl;
}

const part = (ctl: PanelController, name: string) =>
  ctl.shadowRoot.querySelector<HTMLElement>(`[data-part="${name}"]`)!;
const key = (target: EventTarget, k: string, init: KeyboardEventInit = {}) =>
  target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, composed: true, cancelable: true, ...init }));

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('resize grip', () => {
  it('has separator semantics with valuetext "440 pixels wide"', () => {
    const grip = part(mount(), 'grip');
    expect(grip.getAttribute('role')).toBe('separator');
    expect(grip.getAttribute('aria-orientation')).toBe('vertical');
    expect(grip.getAttribute('aria-valuemin')).toBe('400');
    expect(grip.getAttribute('aria-valuemax')).toBe('720');
    expect(grip.getAttribute('aria-valuenow')).toBe('440');
    expect(grip.getAttribute('aria-valuetext')).toBe('440 pixels wide');
    expect(grip.tabIndex).toBe(0);
  });

  it('ArrowLeft on a right-docked panel widens by 16, Shift+ArrowLeft by 64, clamped at 720', () => {
    const ctl = mount();
    const grip = part(ctl, 'grip');
    key(grip, 'ArrowLeft');
    expect(part(ctl, 'panel').style.width).toBe('456px');
    key(grip, 'ArrowLeft', { shiftKey: true });
    expect(part(ctl, 'panel').style.width).toBe('520px');
    for (let i = 0; i < 10; i++) key(grip, 'ArrowLeft', { shiftKey: true });
    expect(part(ctl, 'panel').style.width).toBe('720px');
    key(grip, 'ArrowRight');
    expect(part(ctl, 'panel').style.width).toBe('704px');
  });

  it('ArrowRight widens a left-docked panel', () => {
    const { storage } = memoryStorage({ 'apitemkin:ui': JSON.stringify({ corner: 'bl', width: 440 }) });
    const ctl = mount(storage);
    key(part(ctl, 'grip'), 'ArrowRight');
    expect(part(ctl, 'panel').style.width).toBe('456px');
  });

  it('Home/End jump to 400/720 and save prefs', () => {
    const { storage, saved } = memoryStorage();
    const ctl = mount(storage);
    key(part(ctl, 'grip'), 'Home');
    expect(part(ctl, 'panel').style.width).toBe('400px');
    expect(saved()).toEqual({ corner: 'br', width: 400, theme: 'auto' });
    key(part(ctl, 'grip'), 'End');
    expect(part(ctl, 'grip').getAttribute('aria-valuetext')).toBe('720 pixels wide');
    expect(saved()).toEqual({ corner: 'br', width: 720, theme: 'auto' });
  });
});

describe('rendered width', () => {
  it('narrow layout and the grip value follow the rendered width when the viewport squeezes the panel', () => {
    let cb: (() => void) | undefined;
    vi.stubGlobal('ResizeObserver', class {
      constructor(fn: () => void) { cb = fn; }
      observe() {}
      unobserve() {}
      disconnect() {}
    });
    const ctl = mount();
    const panel = part(ctl, 'panel');
    expect(panel.classList.contains('narrow')).toBe(false);
    panel.getBoundingClientRect = () => ({ width: 366 }) as DOMRect;
    cb!();
    expect(panel.classList.contains('narrow')).toBe(true);
    const grip = part(ctl, 'grip');
    expect(grip.getAttribute('aria-valuenow')).toBe('366');
    expect(grip.getAttribute('aria-valuetext')).toBe('366 pixels wide');
    expect(grip.getAttribute('aria-valuemin')).toBe('366');
    vi.unstubAllGlobals();
  });
});

describe('movable launcher', () => {
  it('Alt+Shift+ArrowUp from br moves to tr and saves prefs; panel data-corner follows', () => {
    const { storage, saved } = memoryStorage();
    const ctl = mount(storage);
    ctl.close();
    const launcher = part(ctl, 'launcher');
    expect(launcher.getAttribute('aria-description')).toBe('Alt+Shift+arrow keys move it to another corner');
    key(launcher, 'ArrowUp', { altKey: true, shiftKey: true });
    expect(launcher.dataset['corner']).toBe('tr');
    expect(part(ctl, 'panel').dataset['corner']).toBe('tr');
    expect(saved()).toEqual({ corner: 'tr', width: 440, theme: 'auto' });
    key(launcher, 'ArrowLeft', { altKey: true, shiftKey: true });
    expect(launcher.dataset['corner']).toBe('tl');
  });

  it('dragging the launcher captures the pointer and snaps to the nearest corner', () => {
    const { storage, saved } = memoryStorage();
    const ctl = mount(storage);
    ctl.close();
    const launcher = part(ctl, 'launcher');
    const capture = vi.fn();
    launcher.setPointerCapture = capture;
    launcher.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 7, clientX: 900, clientY: 700, bubbles: true }));
    expect(capture).toHaveBeenCalledWith(7);
    launcher.dispatchEvent(new PointerEvent('pointermove', { pointerId: 7, clientX: 40, clientY: 30, bubbles: true }));
    launcher.dispatchEvent(new PointerEvent('pointerup', { pointerId: 7, clientX: 40, clientY: 30, bubbles: true }));
    expect(launcher.dataset['corner']).toBe('tl');
    expect(saved()?.corner).toBe('tl');
  });

  it('a click on the launcher without movement still opens the panel', () => {
    const ctl = mount();
    ctl.close();
    const launcher = part(ctl, 'launcher');
    launcher.dispatchEvent(new PointerEvent('pointerdown', { clientX: 100, clientY: 100, bubbles: true }));
    launcher.dispatchEvent(new PointerEvent('pointerup', { clientX: 102, clientY: 101, bubbles: true }));
    launcher.click();
    expect(part(ctl, 'panel').hidden).toBe(false);
  });
});
