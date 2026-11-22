// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mountPanel, type PanelHooks, type PanelController } from '../src/devtools/ui.js';
import type { SelectionMap } from '../src/devtools/state.js';
import type { RouteEntry } from '../src/devtools/match.js';
import { createActivity } from '../src/devtools/activity.js';

const ORDERS: RouteEntry = { method: 'GET', url: '/api/orders', kind: 'code', scenarios: ['default', 'empty', 'error'] };
const PROFILE: RouteEntry = { method: 'GET', url: '/api/profile', kind: 'code', scenarios: ['default', 'darkMode'] };
const HEALTH: RouteEntry = { method: 'GET', url: '/api/healthcheck', kind: 'json', scenarios: [] };

interface Rig {
  hooks: PanelHooks;
  state: SelectionMap;
  set: (p: Partial<{ routes: RouteEntry[]; status: PanelHooksStatus; error: string | null }>) => void;
  refresh: ReturnType<typeof vi.fn>;
  onChange: ReturnType<typeof vi.fn>;
}
type PanelHooksStatus = 'loading' | 'ok' | 'empty' | 'error';

function rig(opts: { state?: SelectionMap; routes?: RouteEntry[]; status?: PanelHooksStatus; error?: string | null; storage?: Storage | null } = {}): Rig {
  const data = { routes: opts.routes ?? [ORDERS, PROFILE, HEALTH], status: opts.status ?? ('ok' as PanelHooksStatus), error: opts.error ?? null };
  const state = opts.state ?? {};
  const refresh = vi.fn(() => Promise.resolve());
  const onChange = vi.fn();
  const hooks: PanelHooks = {
    state,
    getRoutes: () => data.routes,
    getStatus: () => data.status,
    getError: () => data.error,
    refresh,
    onChange,
    activity: createActivity(() => 0),
    origin: 'http://localhost:5173',
    storage: opts.storage === undefined ? null : opts.storage,
  };
  return { hooks, state, refresh, onChange, set: (p) => Object.assign(data, p) };
}

const part = (ctl: PanelController, name: string) =>
  ctl.shadowRoot.querySelector<HTMLElement>(`[data-part="${name}"]`);
const text = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
const key = (target: EventTarget, init: KeyboardEventInit) =>
  target.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, composed: true, cancelable: true, ...init }));

beforeEach(() => {
  document.body.innerHTML = '';
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('launcher', () => {
  it('shows only "apitemkin" and no chip at 0 overrides', () => {
    const ctl = mountPanel(rig().hooks);
    expect(text(part(ctl, 'launcher'))).toBe('apitemkin');
    expect(part(ctl, 'launcher-chip')?.hidden ?? true).toBe(true);
    expect(part(ctl, 'launcher')?.getAttribute('aria-label')).toBe('apitemkin. Open panel');
  });

  it('chip reads "orders: error" and aria-label names the route at 1 override', () => {
    const ctl = mountPanel(rig({ state: { 'GET /api/orders': 'error' } }).hooks);
    expect(text(part(ctl, 'launcher-chip'))).toBe('orders: error');
    expect(part(ctl, 'launcher')?.getAttribute('aria-label')).toBe(
      'apitemkin orders: error. GET /api/orders is overridden. Open panel',
    );
  });

  it('chip reads "2 overridden" at 2 overrides', () => {
    const ctl = mountPanel(rig({ state: { 'GET /api/orders': 'error', 'GET /api/profile': 'darkMode' } }).hooks);
    expect(text(part(ctl, 'launcher-chip'))).toBe('2 overridden');
  });
});

describe('open and close', () => {
  it('opening hides the launcher; Escape closes and refocuses the launcher', () => {
    const ctl = mountPanel(rig().hooks);
    part(ctl, 'launcher')!.click();
    expect(part(ctl, 'panel')!.hidden).toBe(false);
    expect(part(ctl, 'launcher')!.hidden).toBe(true);
    key(part(ctl, 'panel')!, { key: 'Escape', code: 'Escape' });
    expect(part(ctl, 'panel')!.hidden).toBe(true);
    expect(part(ctl, 'launcher')!.hidden).toBe(false);
    expect(ctl.shadowRoot.activeElement).toBe(part(ctl, 'launcher'));
  });

  it('the panel itself is focusable, so a click on its chrome keeps Esc working', () => {
    const ctl = mountPanel(rig().hooks);
    ctl.open();
    const panel = part(ctl, 'panel')!;
    expect(panel.getAttribute('tabindex')).toBe('-1');
    panel.focus();
    key(panel, { key: 'Escape', code: 'Escape' });
    expect(panel.hidden).toBe(true);
  });

  it('the close button closes the panel', () => {
    const ctl = mountPanel(rig().hooks);
    ctl.open();
    part(ctl, 'close')!.click();
    expect(part(ctl, 'panel')!.hidden).toBe(true);
  });

  it('Alt+Shift+M (event.code KeyM) toggles from the host page; plain M does nothing', () => {
    const ctl = mountPanel(rig().hooks);
    key(window, { key: 'm', code: 'KeyM' });
    expect(part(ctl, 'panel')!.hidden).toBe(true);
    key(window, { key: 'Â', code: 'KeyM', altKey: true, shiftKey: true });
    expect(part(ctl, 'panel')!.hidden).toBe(false);
    key(window, { key: 'M', code: 'KeyM', altKey: true, shiftKey: true });
    expect(part(ctl, 'panel')!.hidden).toBe(true);
  });

  it('kbd shows ⌥⇧M on Mac and Alt+Shift+M elsewhere', () => {
    vi.spyOn(navigator, 'platform', 'get').mockReturnValue('MacIntel');
    expect(text(part(mountPanel(rig().hooks), 'kbd'))).toBe('⌥⇧M');
    document.body.innerHTML = '';
    vi.spyOn(navigator, 'platform', 'get').mockReturnValue('Win32');
    expect(text(part(mountPanel(rig().hooks), 'kbd'))).toBe('Alt+Shift+M');
  });
});

describe('theme', () => {
  it('cycles Auto → Light → Dark → Auto, sets data-theme on the host and saves it', () => {
    const store = new Map<string, string>();
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) } as unknown as Storage;
    const ctl = mountPanel(rig({ storage }).hooks);
    const host = document.getElementById('apitemkin-devtools-host')!;
    const btn = part(ctl, 'theme')!;
    expect(btn.getAttribute('aria-label')).toBe('Theme: auto (follows system). Change theme');
    expect(host.hasAttribute('data-theme')).toBe(false);
    btn.click();
    expect(host.getAttribute('data-theme')).toBe('light');
    expect(btn.getAttribute('aria-label')).toBe('Theme: light. Change theme');
    expect(JSON.parse(store.get('apitemkin:ui')!).theme).toBe('light');
    btn.click();
    expect(host.getAttribute('data-theme')).toBe('dark');
    btn.click();
    expect(host.hasAttribute('data-theme')).toBe(false);
    expect(JSON.parse(store.get('apitemkin:ui')!).theme).toBe('auto');
  });

  it('applies a saved theme on mount', () => {
    const storage = { getItem: () => JSON.stringify({ corner: 'br', width: 440, theme: 'dark' }), setItem: () => {} } as unknown as Storage;
    mountPanel(rig({ storage }).hooks);
    expect(document.getElementById('apitemkin-devtools-host')!.getAttribute('data-theme')).toBe('dark');
  });
});

describe('footer', () => {
  it('shows "No overrides" and a disabled "Reset scenarios" at 0', () => {
    const ctl = mountPanel(rig().hooks);
    expect(text(part(ctl, 'footer'))).toContain('No overrides');
    expect(part(ctl, 'filter')).toBeNull();
    const reset = part(ctl, 'reset') as HTMLButtonElement;
    expect(text(reset)).toBe('Reset scenarios');
    expect(reset.disabled).toBe(true);
  });

  it('shows "Show 2 overridden", which toggles to "Show all 3 routes"', () => {
    const ctl = mountPanel(rig({ state: { 'GET /api/orders': 'error', 'GET /api/profile': 'darkMode' } }).hooks);
    expect(text(part(ctl, 'filter'))).toBe('Show 2 overridden');
    part(ctl, 'filter')!.click();
    expect(text(part(ctl, 'filter'))).toBe('Show all 3 routes');
  });

  it('Reset scenarios → confirm → clears state, fires onChange, announces "2 routes reset to default"', () => {
    const r = rig({ state: { 'GET /api/orders': 'error', 'GET /api/profile': 'darkMode' } });
    const ctl = mountPanel(r.hooks);
    ctl.open();
    part(ctl, 'reset')!.click();
    expect(text(part(ctl, 'reset-confirm'))).toContain('Reset 2 routes to default?');
    expect(ctl.shadowRoot.activeElement).toBe(part(ctl, 'reset-cancel'));
    part(ctl, 'reset-yes')!.click();
    expect(r.state).toEqual({});
    expect(r.onChange).toHaveBeenCalled();
    expect(text(part(ctl, 'live'))).toBe('2 routes reset to default');
    expect(part(ctl, 'reset-confirm')).toBeNull();
  });

  it('Reset while "Show N overridden" is on shows every route again, not an empty list', () => {
    const r = rig({ state: { 'GET /api/orders': 'error' } });
    const ctl = mountPanel(r.hooks);
    ctl.open();
    part(ctl, 'filter')!.click();
    expect(ctl.shadowRoot.querySelectorAll('[data-part="row"]').length).toBe(1);
    part(ctl, 'reset')!.click();
    part(ctl, 'reset-yes')!.click();
    expect(ctl.shadowRoot.querySelectorAll('[data-part="row"]').length).toBe(3);
  });

  it('picking default on the last overridden row while filtered shows every route again', () => {
    const r = rig({ state: { 'GET /api/orders': 'error' } });
    const ctl = mountPanel(r.hooks);
    ctl.open();
    part(ctl, 'filter')!.click();
    const sel = ctl.shadowRoot.querySelector<HTMLSelectElement>('[data-part="row"] select')!;
    sel.value = 'default';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    expect(ctl.shadowRoot.querySelectorAll('[data-part="row"]').length).toBe(3);
  });

  it('Cancel keeps state and focuses Reset scenarios', () => {
    const r = rig({ state: { 'GET /api/orders': 'error' } });
    const ctl = mountPanel(r.hooks);
    ctl.open();
    part(ctl, 'reset')!.click();
    part(ctl, 'reset-cancel')!.click();
    expect(r.state).toEqual({ 'GET /api/orders': 'error' });
    expect(ctl.shadowRoot.activeElement).toBe(part(ctl, 'reset'));
  });

  it('Escape in the reset confirm cancels it without closing the panel', () => {
    const ctl = mountPanel(rig({ state: { 'GET /api/orders': 'error' } }).hooks);
    ctl.open();
    part(ctl, 'reset')!.click();
    key(part(ctl, 'reset-cancel')!, { key: 'Escape', code: 'Escape' });
    expect(part(ctl, 'reset-confirm')).toBeNull();
    expect(part(ctl, 'panel')!.hidden).toBe(false);
  });
});

describe('discovery states', () => {
  it('the header button says what it does: "Rescan mocks"', () => {
    const ctl = mountPanel(rig().hooks);
    expect(text(part(ctl, 'refresh'))).toBe('Rescan mocks');
  });

  it('loading shows a skeleton and disables Rescan mocks', () => {
    const ctl = mountPanel(rig({ status: 'loading' }).hooks);
    const state = part(ctl, 'state')!;
    expect(state.dataset['state']).toBe('loading');
    expect(state.querySelectorAll('.skel').length).toBe(3);
    expect((part(ctl, 'refresh') as HTMLButtonElement).disabled).toBe(true);
  });

  it('error shows role=alert with the request line and Retry calls refresh', () => {
    const r = rig({ status: 'error', error: 'HTTP 500' });
    const ctl = mountPanel(r.hooks);
    const state = part(ctl, 'state')!;
    expect(state.getAttribute('role')).toBe('alert');
    expect(text(state)).toContain("Couldn't load routes");
    expect(text(state)).toContain('GET /_apitemkin/scenarios · HTTP 500');
    part(ctl, 'retry')!.click();
    expect(r.refresh).toHaveBeenCalled();
  });

  it('empty shows the no-mocks copy', () => {
    const ctl = mountPanel(rig({ status: 'empty', routes: [] }).hooks);
    const state = part(ctl, 'state')!;
    expect(text(state.querySelector('h3'))).toBe('No mocks yet. The village is empty.');
    expect(text(state.querySelector('p'))).toBe('Add mocks/hello.json → GET /api/hello.');
  });

  it('Rescan mocks disables itself with aria-busy while pending, then restores', async () => {
    const r = rig();
    let resolve!: () => void;
    r.refresh.mockImplementation(() => new Promise<void>((res) => (resolve = res)));
    const ctl = mountPanel(r.hooks);
    const btn = part(ctl, 'refresh') as HTMLButtonElement;
    btn.click();
    expect(btn.disabled).toBe(true);
    expect(btn.getAttribute('aria-busy')).toBe('true');
    resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(btn.disabled).toBe(false);
  });
});

describe('prefs', () => {
  it('panel width and corner come from prefs', () => {
    const store = new Map([['apitemkin:ui', JSON.stringify({ corner: 'tl', width: 512 })]]);
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: () => {} } as unknown as Storage;
    const ctl = mountPanel(rig({ storage }).hooks);
    expect(part(ctl, 'panel')!.style.width).toBe('512px');
    expect(part(ctl, 'panel')!.dataset['corner']).toBe('tl');
    expect(part(ctl, 'launcher')!.dataset['corner']).toBe('tl');
  });

  it('storage that throws still mounts with 440 / br', () => {
    const storage = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } } as unknown as Storage;
    const ctl = mountPanel(rig({ storage }).hooks);
    expect(part(ctl, 'panel')!.style.width).toBe('440px');
    expect(part(ctl, 'panel')!.dataset['corner']).toBe('br');
  });
});
