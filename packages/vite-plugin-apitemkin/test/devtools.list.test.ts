// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mountPanel, type PanelHooks, type PanelController } from '../src/devtools/ui.js';
import type { SelectionMap } from '../src/devtools/state.js';
import type { RouteEntry } from '../src/devtools/match.js';
import { createActivity, type Activity } from '../src/devtools/activity.js';

const R = (method: string, url: string, scenarios: string[] = []): RouteEntry => ({ method, url, scenarios });
const ORDERS = R('GET', '/api/orders', ['default', 'empty', 'error']);
const PROFILE = R('GET', '/api/profile', ['default', 'darkMode']);
const SEVEN = [
  ORDERS,
  PROFILE,
  R('GET', '/api/healthcheck'),
  R('GET', '/api/whoami'),
  R('POST', '/api/echo'),
  R('GET', '/api/users'),
  R('POST', '/api/users'),
];
const EIGHT = [...SEVEN, R('GET', '/api/users/:id/settings/notifications')];

let clock = 0;
function mount(opts: { routes?: RouteEntry[]; state?: SelectionMap } = {}) {
  const state = opts.state ?? {};
  const onChange = vi.fn();
  const activity: Activity = createActivity(() => clock);
  const hooks: PanelHooks = {
    state,
    getRoutes: () => opts.routes ?? EIGHT,
    getStatus: () => 'ok',
    getError: () => null,
    refresh: () => Promise.resolve(),
    onChange,
    activity,
    origin: 'http://localhost:5173',
    storage: null,
  };
  const ctl = mountPanel(hooks);
  ctl.open();
  return { ctl, state, onChange, activity };
}

const q = (ctl: PanelController, sel: string) => ctl.shadowRoot.querySelector<HTMLElement>(sel);
const qa = (ctl: PanelController, sel: string) => [...ctl.shadowRoot.querySelectorAll<HTMLElement>(sel)];
const part = (ctl: PanelController, name: string) => q(ctl, `[data-part="${name}"]`);
const row = (ctl: PanelController, key: string) => q(ctl, `[data-part="row"][data-key="${key}"]`)!;
const text = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
const key = (target: EventTarget, k: string, init: KeyboardEventInit = {}) =>
  target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, composed: true, cancelable: true, ...init }));
const type = (input: HTMLInputElement, value: string) => {
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
};

beforeEach(() => {
  document.body.innerHTML = '';
  clock = 0;
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('search', () => {
  it('is hidden at 7 routes and shown at 8', () => {
    expect(part(mount({ routes: SEVEN }).ctl, 'search')).toBeNull();
    document.body.innerHTML = '';
    const input = part(mount({ routes: EIGHT }).ctl, 'search') as HTMLInputElement;
    expect(input.type).toBe('search');
    expect(input.getAttribute('aria-label')).toBe('Filter routes');
    expect(input.getAttribute('aria-keyshortcuts')).toBe('/');
  });

  it('"/" focuses search only from inside the panel', () => {
    const { ctl } = mount();
    part(ctl, 'close')!.focus();
    key(window, '/');
    expect(ctl.shadowRoot.activeElement).toBe(part(ctl, 'close'));
    key(part(ctl, 'panel')!, '/');
    expect(ctl.shadowRoot.activeElement).toBe(part(ctl, 'search'));
  });

  it('typing filters rows and announces "Showing 1 of 8 routes" after 500 ms', () => {
    vi.useFakeTimers();
    const { ctl } = mount();
    type(part(ctl, 'search') as HTMLInputElement, 'echo');
    expect(qa(ctl, '[data-part="row"]').map((r) => r.dataset['key'])).toEqual(['POST /api/echo']);
    expect(text(part(ctl, 'live'))).toBe('');
    vi.advanceTimersByTime(500);
    expect(text(part(ctl, 'live'))).toBe('Showing 1 of 8 routes');
  });

  it('no matches shows the query and Clear search restores all rows', () => {
    const { ctl } = mount();
    type(part(ctl, 'search') as HTMLInputElement, 'invoices');
    expect(text(part(ctl, 'no-results'))).toContain('No routes match “invoices”.');
    (part(ctl, 'no-results')!.querySelector('button') as HTMLButtonElement).click();
    expect(qa(ctl, '[data-part="row"]').length).toBe(8);
    expect((part(ctl, 'search') as HTMLInputElement).value).toBe('');
  });

  it('Escape in a non-empty search clears it without closing the panel', () => {
    const { ctl } = mount();
    const input = part(ctl, 'search') as HTMLInputElement;
    type(input, 'echo');
    key(input, 'Escape');
    expect(input.value).toBe('');
    expect(part(ctl, 'panel')!.hidden).toBe(false);
  });

  it('shows a "/" hint in the empty search field', () => {
    const { ctl } = mount();
    const hint = q(ctl, '.search .qk');
    expect(text(hint)).toBe('/');
    expect(hint?.getAttribute('aria-hidden')).toBe('true');
  });
});

describe('groups', () => {
  it('single-route folders fold into the /api group', () => {
    const { ctl } = mount();
    const labels = qa(ctl, '[data-part="group"] summary .gp').map(text);
    expect(labels).toEqual(['/api', '/api/users']);
  });

  it('a folded group with an override shows "1 overridden"', () => {
    const { ctl } = mount({ state: { 'GET /api/orders': 'error' } });
    const group = qa(ctl, '[data-part="group"]')[0] as HTMLDetailsElement;
    group.open = false;
    expect(text(group.querySelector('[data-part="group-chip"]'))).toBe('1 overridden');
  });
});

describe('rows', () => {
  it('routes without scenarios render no select', () => {
    const { ctl } = mount();
    expect(row(ctl, 'GET /api/healthcheck').querySelector('select')).toBeNull();
    expect(row(ctl, 'GET /api/orders').querySelector('select')).not.toBeNull();
  });

  it('override select has an accessible name ending ", overridden" and the mustard class', () => {
    const { ctl } = mount({ state: { 'GET /api/orders': 'error' } });
    const sel = row(ctl, 'GET /api/orders').querySelector('select')!;
    expect(sel.value).toBe('error');
    expect(sel.getAttribute('aria-label')).toBe('Scenario for GET /api/orders, overridden');
    expect(sel.classList.contains('on')).toBe(true);
    const plain = row(ctl, 'GET /api/profile').querySelector('select')!;
    expect(plain.getAttribute('aria-label')).toBe('Scenario for GET /api/profile');
  });

  it('the picker chevron is an svg icon beside the select, not a background image', () => {
    const { ctl } = mount();
    const wrap = row(ctl, 'GET /api/orders').querySelector('.sw')!;
    expect(wrap.querySelector('select')).not.toBeNull();
    expect(wrap.querySelector('svg.ic')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('choosing default deletes the key and fires onChange', () => {
    const { ctl, state, onChange } = mount({ state: { 'GET /api/orders': 'error' } });
    const sel = row(ctl, 'GET /api/orders').querySelector('select')!;
    sel.value = 'default';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    expect(state).toEqual({});
    expect(onChange).toHaveBeenCalled();
    expect(row(ctl, 'GET /api/orders').querySelector('select')!.classList.contains('on')).toBe(false);
  });

  it('the picker stays usable when the page asks for a scenario; it is not counted', () => {
    const { ctl, activity } = mount();
    activity.finish(activity.start('GET /api/orders', 'empty'), 200);
    const r = row(ctl, 'GET /api/orders');
    expect(r.querySelector('[data-part="url-chip"]')).toBeNull();
    expect(r.querySelector<HTMLSelectElement>('select')?.value).toBe('default');
    expect(part(ctl, 'filter')).toBeNull();
  });

  it('long path contains <wbr> after each "/" and the /api/ prefix is dimmed', () => {
    const { ctl } = mount();
    const p = row(ctl, 'GET /api/users/:id/settings/notifications').querySelector('[data-part="path"]')!;
    expect(text(p.querySelector('.pre'))).toBe('/api/');
    expect(p.querySelectorAll('wbr').length).toBe(4);
  });
});

describe('no copy button', () => {
  it('rows carry no copy button; the picker takes that space', () => {
    const { ctl } = mount({ state: { 'GET /api/orders': 'error' } });
    expect(qa(ctl, '[data-part="copy"]')).toEqual([]);
  });
});

describe('filter and keyboard', () => {
  it('Show 2 overridden filters to overridden rows', () => {
    const { ctl } = mount({ state: { 'GET /api/orders': 'error', 'GET /api/profile': 'darkMode' } });
    part(ctl, 'filter')!.click();
    expect(qa(ctl, '[data-part="row"]').map((r) => r.dataset['key'])).toEqual([
      'GET /api/orders',
      'GET /api/profile',
    ]);
  });

  it('ArrowDown/ArrowUp move between rows; the select does not change value on ArrowDown', () => {
    const { ctl } = mount({ routes: SEVEN });
    const ordersSel = row(ctl, 'GET /api/orders').querySelector('select')!;
    ordersSel.focus();
    key(ordersSel, 'ArrowDown');
    expect(ordersSel.value).toBe('default');
    const active = ctl.shadowRoot.activeElement as HTMLElement;
    expect(active.closest('[data-part="row"]')?.getAttribute('data-key')).toBe('GET /api/profile');
    key(active, 'ArrowUp');
    expect(ctl.shadowRoot.activeElement).toBe(ordersSel);
  });

  it('keeps focus on the select after changing its value', () => {
    const { ctl } = mount();
    const sel = row(ctl, 'GET /api/orders').querySelector('select')!;
    sel.focus();
    sel.value = 'error';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    const active = ctl.shadowRoot.activeElement as HTMLElement;
    expect(active.tagName).toBe('SELECT');
    expect(active.closest('[data-part="row"]')?.getAttribute('data-key')).toBe('GET /api/orders');
  });
});

describe('steady height while filtering', () => {
  it('searching keeps the panel at its height; clearing the search lets it fit again', () => {
    const { ctl } = mount();
    const panel = part(ctl, 'panel')!;
    panel.getBoundingClientRect = () => ({ width: 440, height: 512 }) as DOMRect;
    const input = q(ctl, 'input[type="search"]') as HTMLInputElement;
    type(input, 'zzz');
    expect(panel.style.getPropertyValue('--hold')).toBe('512px');
    panel.getBoundingClientRect = () => ({ width: 440, height: 180 }) as DOMRect;
    type(input, 'zzzz');
    expect(panel.style.getPropertyValue('--hold')).toBe('512px');
    type(input, '');
    expect(panel.style.getPropertyValue('--hold')).toBe('');
  });

  it('the overridden filter holds the height too', () => {
    const { ctl } = mount({ state: { 'GET /api/orders': 'error' } });
    const panel = part(ctl, 'panel')!;
    panel.getBoundingClientRect = () => ({ width: 440, height: 512 }) as DOMRect;
    part(ctl, 'filter')!.click();
    expect(panel.style.getPropertyValue('--hold')).toBe('512px');
    part(ctl, 'filter')!.click();
    expect(panel.style.getPropertyValue('--hold')).toBe('');
  });
});

describe('reset and keyboard feedback', () => {
  it('the picker says how to open it from the keyboard', () => {
    const { ctl } = mount();
    const sel = row(ctl, 'GET /api/orders').querySelector('select')!;
    expect(sel.getAttribute('aria-description')).toBe('Space or Alt+Down opens the scenarios');
  });

  it('changing a scenario announces it and when it applies', () => {
    const { ctl } = mount();
    const sel = row(ctl, 'GET /api/orders').querySelector<HTMLSelectElement>('select')!;
    sel.value = 'error';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    expect(text(part(ctl, 'live'))).toBe('GET /api/orders: error, applies to the next request');
  });
});

describe('request log', () => {
  const btn = (ctl: PanelController, k: string) => row(ctl, k).querySelector<HTMLButtonElement>('[data-part="log"]')!;
  const box = (ctl: PanelController, k: string) => row(ctl, k).querySelector<HTMLElement>('[data-part="log-list"]')!;
  const cells = (el: HTMLElement) => [...el.querySelectorAll('li')].map((li) => [...li.children].map((c) => text(c)));

  it('rows have no second line', () => {
    const { ctl, activity } = mount();
    activity.finish(activity.start('GET /api/orders', null), 200);
    expect(row(ctl, 'GET /api/orders').querySelector('[data-part="last"]')).toBeNull();
    expect(row(ctl, 'GET /api/orders').querySelector('[data-part="po"]')).toBeNull();
  });

  it('every row has a log button, disabled with "no requests yet" until the route is called', () => {
    const { ctl } = mount();
    const b = btn(ctl, 'GET /api/healthcheck');
    expect(b.disabled).toBe(true);
    expect(b.getAttribute('aria-label')).toBe('Request log for GET /api/healthcheck, no requests yet');
  });

  it('once called it is enabled and says how many requests it holds', () => {
    const { ctl, activity } = mount();
    activity.finish(activity.start('GET /api/orders', null), 200);
    activity.finish(activity.start('GET /api/orders', null), 200);
    const b = btn(ctl, 'GET /api/orders');
    expect(b.disabled).toBe(false);
    expect(b.getAttribute('aria-label')).toBe('Request log for GET /api/orders, 2 requests');
    expect(b.getAttribute('aria-expanded')).toBe('false');
    expect(box(ctl, 'GET /api/orders').hasAttribute('inert')).toBe(true);
  });

  it('opening lists every request newest first: scenario, result, and where the scenario came from', () => {
    const { ctl, activity } = mount({ state: { 'GET /api/orders': 'error' } });
    activity.finish(activity.start('GET /api/orders', null, true, true, 'error'), 500);
    const t = activity.start('GET /api/orders', 'empty', false, true, 'empty');
    clock += 140;
    activity.finish(t, 200);
    btn(ctl, 'GET /api/orders').click();
    expect(btn(ctl, 'GET /api/orders').getAttribute('aria-expanded')).toBe('true');
    expect(box(ctl, 'GET /api/orders').classList.contains('open')).toBe(true);
    expect(cells(box(ctl, 'GET /api/orders'))).toEqual([
      ['empty', '200 · 140 ms', 'via _scenario param'],
      ['error', '500 · 0 ms', 'via picker'],
    ]);
    expect(box(ctl, 'GET /api/orders').querySelector('.bad')).toBeNull();
  });

  it('unknown page names read "not in mocks → default"; unexpected failures are brick with icon and word', () => {
    const { ctl, activity } = mount();
    activity.finish(activity.start('GET /api/orders', 'eu-vatt', false, false, 'default'), 200);
    activity.finish(activity.start('GET /api/orders', null), 500);
    btn(ctl, 'GET /api/orders').click();
    expect(cells(box(ctl, 'GET /api/orders'))).toEqual([
      ['default', 'unexpected 500 · 0 ms'],
      ['eu-vatt', 'not in mocks → default', 'via _scenario param'],
    ]);
    const bad = box(ctl, 'GET /api/orders').querySelector('li .s.bad')!;
    expect(bad.querySelector('svg')).not.toBeNull();
  });

  it('a request still in flight shows its waiting time at the top', () => {
    const { ctl, activity } = mount();
    activity.start('GET /api/orders', null);
    btn(ctl, 'GET /api/orders').click();
    clock = 1234;
    activity.finish(activity.start('GET /api/profile', null), 200); // any tick re-renders
    expect(cells(box(ctl, 'GET /api/orders'))[0]).toEqual(['default', '… 1.2 s']);
  });

  it('the icon turns brick when the last request failed unexpectedly, and says so', () => {
    const { ctl, activity } = mount();
    activity.finish(activity.start('GET /api/orders', null), 500);
    const b = btn(ctl, 'GET /api/orders');
    expect(b.classList.contains('bad')).toBe(true);
    expect(b.getAttribute('aria-label')).toBe('Request log for GET /api/orders, 1 request, last request failed unexpectedly');
    activity.finish(activity.start('GET /api/orders', null, true, true, 'error'), 500);
    expect(btn(ctl, 'GET /api/orders').classList.contains('bad')).toBe(false);
  });

  it('renders a hostile scenario name as text', () => {
    const { ctl, activity } = mount();
    activity.finish(activity.start('GET /api/orders', '<img src=x onerror=alert(1)>', false, false), 200);
    btn(ctl, 'GET /api/orders').click();
    expect(box(ctl, 'GET /api/orders').querySelector('img')).toBeNull();
    expect(text(box(ctl, 'GET /api/orders').querySelector('.n'))).toBe('<img src=x onerror=alert(1)>');
  });

  it('an open log survives new requests and keeps its nodes; Esc collapses it before the panel closes', () => {
    const { ctl, activity } = mount();
    activity.finish(activity.start('GET /api/orders', null), 200);
    const b = btn(ctl, 'GET /api/orders');
    b.click();
    const list = box(ctl, 'GET /api/orders');
    const inner = list.querySelector('.in');
    activity.finish(activity.start('GET /api/orders', null), 200);
    expect(box(ctl, 'GET /api/orders')).toBe(list);
    expect(list.querySelector('.in')).toBe(inner);
    expect(list.classList.contains('open')).toBe(true);
    expect(list.querySelectorAll('li').length).toBe(2);
    b.focus();
    key(b, 'Escape');
    expect(b.getAttribute('aria-expanded')).toBe('false');
    expect(part(ctl, 'panel')!.hidden).toBe(false);
    key(b, 'Escape');
    expect(part(ctl, 'panel')!.hidden).toBe(true);
  });

  it('the log button follows the picker in arrow-key order; a disabled one is skipped', () => {
    const { ctl, activity } = mount();
    activity.finish(activity.start('GET /api/orders', null), 200);
    const sel = row(ctl, 'GET /api/orders').querySelector<HTMLSelectElement>('select')!;
    sel.focus();
    key(sel, 'ArrowRight');
    expect(ctl.shadowRoot.activeElement).toBe(btn(ctl, 'GET /api/orders'));
    const sel2 = row(ctl, 'GET /api/profile').querySelector<HTMLSelectElement>('select')!;
    sel2.focus();
    key(sel2, 'ArrowRight');
    expect(ctl.shadowRoot.activeElement).toBe(sel2);
  });
});

describe('review fixes', () => {
  it('ArrowDown moves past a scenario-less route that was never called', () => {
    const routes = [R('GET', '/api/a', ['default', 'x']), R('GET', '/api/b'), R('GET', '/api/c', ['default', 'y'])];
    const { ctl } = mount({ routes });
    const a = row(ctl, 'GET /api/a').querySelector<HTMLSelectElement>('select')!;
    a.focus();
    key(a, 'ArrowDown');
    expect(ctl.shadowRoot.activeElement).toBe(row(ctl, 'GET /api/c').querySelector('select'));
  });

  it('a failed-unexpectedly log button swaps its glyph for the warning mark, not colour alone', () => {
    const { ctl, activity } = mount();
    activity.finish(activity.start('GET /api/orders', null), 200);
    const b = row(ctl, 'GET /api/orders').querySelector<HTMLButtonElement>('[data-part="log"]')!;
    const glyph = b.querySelector('path')!.getAttribute('d');
    activity.finish(activity.start('GET /api/orders', null), 500);
    expect(b.classList.contains('bad')).toBe(true);
    expect(b.querySelector('path')!.getAttribute('d')).not.toBe(glyph);
    expect(b.querySelector('path')!.getAttribute('d')).toBe('M8 2.5l6 11H2zM8 7v3M8 12h.01');
  });

  it('the height hold is released when a rescan drops the search field', () => {
    const routes = [...EIGHT];
    const { ctl } = mount({ routes });
    const panel = part(ctl, 'panel')!;
    panel.getBoundingClientRect = () => ({ width: 440, height: 512 }) as DOMRect;
    type(q(ctl, 'input[type="search"]') as HTMLInputElement, 'zzz');
    expect(panel.style.getPropertyValue('--hold')).toBe('512px');
    routes.pop();
    ctl.rerender();
    expect(q(ctl, 'input[type="search"]')).toBeNull();
    expect(panel.style.getPropertyValue('--hold')).toBe('');
  });

  it('two routes whose keys differ only in punctuation get different log ids', () => {
    const routes = [R('GET', '/api/a-b'), R('GET', '/api/a/b')];
    const { ctl, activity } = mount({ routes });
    activity.finish(activity.start('GET /api/a-b', null), 200);
    activity.finish(activity.start('GET /api/a/b', null), 200);
    const ids = qa(ctl, '[data-part="log"]').map((b) => b.getAttribute('aria-controls'));
    expect(new Set(ids).size).toBe(2);
    for (const id of ids) expect(ctl.shadowRoot.getElementById(id!)).not.toBeNull();
  });
});
