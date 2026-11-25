// @vitest-environment happy-dom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { mountPanel, type PanelHooks } from '../src/devtools/ui.js';
import type { RouteEntry } from '../src/devtools/match.js';
import type { CollectionInfo } from '../src/devtools/model.js';
import { createActivity } from '../src/devtools/activity.js';

const R = (method: string, url: string, scenarios: string[] = []): RouteEntry => ({ method, url, scenarios });
const USERS: CollectionInfo = { name: 'users', file: 'users/_data.ts', url: '/api/users', count: 52 };
const ADMIN: CollectionInfo = { name: 'users', file: 'admin/users/_data.ts', url: '/api/admin/users', count: 1 };
const ROUTES = [
  R('GET', '/api/users'),
  R('POST', '/api/users', ['default', 'error']),
  R('GET', '/api/users/:id'),
  R('GET', '/api/orders', ['default', 'empty']),
  R('GET', '/api/admin/users'),
  R('POST', '/api/admin/users'),
  R('GET', '/api/health'),
  R('GET', '/api/whoami'),
];

function mount(opts: { collections?: CollectionInfo[]; reset?: PanelHooks['resetCollection']; routes?: RouteEntry[] } = {}) {
  let collections = opts.collections ?? [USERS];
  const resetCollection = vi.fn(
    opts.reset ??
      (async (file: string, name: string) => {
        collections = collections.map((c) => (c.file === file && c.name === name ? { ...c, count: 3 } : c));
      }),
  );
  const refreshCollections = vi.fn(() => Promise.resolve());
  const hooks: PanelHooks = {
    state: {},
    getRoutes: () => opts.routes ?? ROUTES,
    getStatus: () => 'ok',
    getError: () => null,
    refresh: () => Promise.resolve(),
    onChange: () => {},
    activity: createActivity(() => 0),
    origin: 'http://localhost:5173',
    storage: null,
    getCollections: () => collections,
    getUrlPrefix: () => '/api',
    resetCollection,
    refreshCollections,
  };
  const ctl = mountPanel(hooks);
  ctl.open();
  const root = ctl.shadowRoot;
  const lines = () => [...root.querySelectorAll<HTMLElement>('[data-part="collection"]')];
  const live = () => root.querySelector('[data-part="live"]')!.textContent;
  const search = (q: string) => {
    const input = root.querySelector<HTMLInputElement>('input')!;
    input.value = q;
    input.dispatchEvent(new Event('input'));
  };
  return { ctl, root, lines, live, search, resetCollection, refreshCollections };
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('overlay collection line', () => {
  it('renders a collection line first in its group', () => {
    const { lines } = mount();
    const [line] = lines();
    const group = line!.closest('details')!;
    expect(group.children[1]).toBe(line); // right after <summary>
    expect(line!.querySelector('[data-part="collection-name"]')!.textContent).toBe('users');
    expect(line!.querySelector('[data-part="collection-count"]')!.textContent).toBe('52 records');
    expect(line!.title).toBe('users/_data.ts');
  });

  it('singular and zero counts', () => {
    const one = mount({ collections: [{ ...USERS, count: 1 }] });
    expect(one.lines()[0]!.querySelector('[data-part="collection-count"]')!.textContent).toBe('1 record');
    document.body.innerHTML = '';
    const zero = mount({ collections: [{ ...USERS, count: 0 }] });
    expect(zero.lines()[0]!.querySelector('[data-part="collection-count"]')!.textContent).toBe('0 records');
  });

  it('Reset calls resetCollection with file and name, then announces', async () => {
    const { lines, live, resetCollection } = mount();
    lines()[0]!.querySelector<HTMLButtonElement>('[data-part="collection-reset"]')!.click();
    expect(resetCollection).toHaveBeenCalledWith('users/_data.ts', 'users');
    await vi.waitFor(() => expect(live()).toContain('users reset to its seed data'));
    expect(lines()[0]!.querySelector('[data-part="collection-count"]')!.textContent).toBe('3 records');
  });

  it('Reset is marked busy while the reset is in flight, and a second click is ignored', async () => {
    let finish!: () => void;
    const { lines, ctl, resetCollection } = mount({ reset: () => new Promise<void>((r) => (finish = r)) });
    const btn = () => lines()[0]!.querySelector<HTMLButtonElement>('[data-part="collection-reset"]')!;
    btn().click();
    expect(btn().getAttribute('aria-disabled')).toBe('true');
    ctl.rerender(); // a rebuild mid-flight keeps it busy
    expect(btn().getAttribute('aria-disabled')).toBe('true');
    btn().click();
    expect(resetCollection).toHaveBeenCalledTimes(1);
    finish();
    await vi.waitFor(() => expect(btn().hasAttribute('aria-disabled')).toBe(false));
  });

  it('Reset keeps keyboard focus (never natively disabled, so browsers do not drop focus to <body>)', async () => {
    let finish!: () => void;
    const { root, lines } = mount({ reset: () => new Promise<void>((r) => (finish = r)) });
    const btn = () => lines()[0]!.querySelector<HTMLButtonElement>('[data-part="collection-reset"]')!;
    btn().focus();
    btn().click();
    // A natively disabled focused button loses focus in real browsers (focus fixup).
    expect(btn().disabled).toBe(false);
    expect(root.activeElement).toBe(btn());
    finish();
    await vi.waitFor(() => expect(btn().hasAttribute('aria-disabled')).toBe(false));
    expect(root.activeElement).toBe(btn());
  });

  it('a failed reset says so', async () => {
    const { lines, live } = mount({ reset: () => Promise.reject(new Error('HTTP 500')) });
    lines()[0]!.querySelector<HTMLButtonElement>('[data-part="collection-reset"]')!.click();
    await vi.waitFor(() => expect(live()).toContain("Couldn't reset users"));
  });

  it('two collections named users in different folders render separately', () => {
    const { lines, resetCollection } = mount({ collections: [USERS, ADMIN] });
    expect(lines().map((l) => l.title).sort()).toEqual(['admin/users/_data.ts', 'users/_data.ts']);
    const admin = lines().find((l) => l.title === 'admin/users/_data.ts')!;
    admin.querySelector<HTMLButtonElement>('[data-part="collection-reset"]')!.click();
    expect(resetCollection).toHaveBeenCalledWith('admin/users/_data.ts', 'users');
    expect(resetCollection).toHaveBeenCalledTimes(1);
  });

  it('same-named collections in one group show their folder; a unique name does not', () => {
    const ADMIN_ROOT: CollectionInfo = { name: 'users', file: 'admin/_data.ts', url: '/api/admin', count: 4 };
    const { lines } = mount({ collections: [USERS, ADMIN, ADMIN_ROOT] });
    const folderOf = (file: string) =>
      lines().find((l) => l.title === file)!.querySelector('[data-part="collection-folder"]')?.textContent ?? null;
    expect(folderOf('admin/_data.ts')).toBe('admin');
    expect(folderOf('admin/users/_data.ts')).toBe('admin/users');
    expect(folderOf('users/_data.ts')).toBeNull();
  });

  it('hidden while searching unless the group has a shown route', () => {
    const { lines, search } = mount();
    search('orders');
    expect(lines()).toHaveLength(0);
    search('users');
    expect(lines()).toHaveLength(1);
    search('');
    expect(lines()).toHaveLength(1);
  });

  it('a collection with no routes still shows its group', () => {
    const { lines } = mount({ routes: [R('GET', '/api/orders')], collections: [{ ...USERS, url: '/api/todos', name: 'todos' }] });
    expect(lines()).toHaveLength(1);
    expect(lines()[0]!.closest('details')!.querySelector('summary')!.textContent).toContain('todos');
  });

  it('Reset is reachable by arrow keys', () => {
    const { root, lines } = mount();
    const group = lines()[0]!.closest('details')!;
    const summary = group.querySelector('summary')!;
    summary.focus();
    summary.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(root.activeElement).toBe(lines()[0]!.querySelector('[data-part="collection-reset"]'));
  });

  it('never mustard', () => {
    const { lines } = mount();
    expect(lines()[0]!.classList.contains('on')).toBe(false);
    expect(lines()[0]!.querySelector('.on, .gchip')).toBeNull();
  });

  it('opening the panel refreshes collections', () => {
    const { refreshCollections } = mount();
    expect(refreshCollections).toHaveBeenCalledTimes(1);
  });
});
