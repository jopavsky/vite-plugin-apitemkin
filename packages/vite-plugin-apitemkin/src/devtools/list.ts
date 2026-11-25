// Route list of the overlay: search, folder groups, one-line rows (method,
// path, scenario picker, request-log button) and roving keyboard focus.
//
// The list is a persistent component: update() rebuilds the rows but keeps
// the search field and restores focus; request activity only patches the log
// buttons and open logs in place, so an open picker or log never closes under
// the user.

import type { PanelHooks } from './ui.js';
import type { RouteEntry } from './match.js';
import type { LogEntry } from './activity.js';
import { selectionKey } from './state.js';
import { isUnexpectedEntry, isUnexpectedError } from './activity.js';
import {
  filterRoutes,
  groupRoutes,
  inferPrefix,
  overriddenKeys,
  splitPrefix,
  type CollectionInfo,
} from './model.js';
import { activeIn, h, icon, ICON } from './dom.js';

export interface ListView {
  onlyOverridden: boolean;
}

export interface ListContext {
  shadowRoot: ShadowRoot;
  announce: (text: string) => void;
  rerender: () => void;
  /** Called before the list re-filters; `searching` is true while a query is active. */
  holdHeight?: (searching: boolean) => void;
}

export interface ListController {
  el: HTMLElement;
  update: (view: ListView) => void;
  /** Focus the search field; false when it isn't shown. */
  focusSearch: () => boolean;
  focusFirst: () => void;
  hasQuery: () => boolean;
}

const SEARCH_MIN_ROUTES = 8;

const formatResult = (status: number, ms: number): string =>
  status === 0 ? `no response · ${ms} ms` : `${status} · ${ms} ms`;

const methodLabel = (m: string): string => (m.toUpperCase() === 'OPTIONS' ? 'OPT' : m.toUpperCase());

export function createList(hooks: PanelHooks, ctx: ListContext): ListController {
  let query = '';
  let view: ListView = { onlyOverridden: false };
  let announceTimer: ReturnType<typeof setTimeout> | undefined;
  let ticker: ReturnType<typeof setInterval> | undefined;
  let lastFid: string | null = null;
  /** Rows whose request log is open; survives rebuilds. */
  const openLogs = new Set<string>();
  /** What each log last rendered, so unchanged ticks leave its nodes alone. */
  const logSig = new WeakMap<HTMLElement, string>();
  /** Collections whose reset is in flight (`file#name`); survives rebuilds. */
  const resetting = new Set<string>();
  /** Stable, collision-free ids for each route's log (keys can differ only in punctuation). */
  const logIds = new Map<string, string>();
  const logId = (key: string): string => {
    let id = logIds.get(key);
    if (!id) logIds.set(key, (id = `log-${logIds.size + 1}`));
    return id;
  };
  const closed = new Set<string>();

  // ---------- search (persistent; attached only at 8+ routes) ----------
  const input = h('input', {
    type: 'search',
    class: 'q',
    'data-part': 'search',
    'aria-label': 'Filter routes',
    'aria-keyshortcuts': '/',
    'aria-controls': 'apitemkin-rows',
    autocomplete: 'off',
    spellcheck: 'false',
  });
  const clearBtn = h(
    'button',
    { type: 'button', class: 'qx', 'data-part': 'search-clear', 'aria-label': 'Clear search', hidden: true },
    icon(ICON.close),
  );
  const searchWrap = h(
    'div',
    { class: 'search' },
    icon(ICON.search),
    input,
    h('kbd', { class: 'qk', 'aria-hidden': 'true' }, '/'),
    clearBtn,
  );
  const rows = h('div', { class: 'rows', id: 'apitemkin-rows' });
  const el = h('div', { class: 'list' }, rows);

  function setQuery(value: string): void {
    ctx.holdHeight?.(value !== '');
    query = value;
    input.value = value;
    clearBtn.hidden = value === '';
    build();
    clearTimeout(announceTimer);
    if (value) {
      announceTimer = setTimeout(() => {
        const total = hooks.getRoutes().length;
        const shown = filterRoutes(hooks.getRoutes(), query, null).length;
        ctx.announce(`Showing ${shown} of ${total} routes`);
      }, 500);
    }
  }

  input.addEventListener('input', () => setQuery(input.value));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && input.value) {
      e.preventDefault();
      setQuery('');
    }
  });
  clearBtn.addEventListener('click', () => {
    setQuery('');
    input.focus();
  });

  // ---------- rows ----------
  const fidOf = (node: Element | null): string | null =>
    node instanceof HTMLElement ? (node.dataset['fid'] ?? null) : null;

  function findFid(fid: string): HTMLElement | null {
    for (const node of rows.querySelectorAll<HTMLElement>('[data-fid]')) {
      if (node.dataset['fid'] === fid) return node;
    }
    return null;
  }

  function pathNode(url: string, prefix: string): HTMLElement {
    const { prefix: pre, rest } = splitPrefix(url, prefix);
    const p = h('span', { class: 'p', 'data-part': 'path' });
    if (pre) p.append(h('span', { class: 'pre' }, pre), h('wbr'));
    rest.split('/').forEach((seg, i, all) => {
      p.append(seg);
      if (i < all.length - 1) p.append('/', h('wbr'));
    });
    return p;
  }

  // ---------- collection line: name, record count, Reset (1.5) ----------
  /** `showFolder`: another collection in the same group has this name, so say which folder. */
  function collectionNode(c: CollectionInfo, showFolder: boolean): HTMLElement {
    const id = `${c.file}#${c.name}`;
    const records = `${c.count} ${c.count === 1 ? 'record' : 'records'}`;
    const folder = c.file.includes('/') ? c.file.slice(0, c.file.lastIndexOf('/')) : '/';
    const label = showFolder ? `${c.name} in ${folder}` : c.name;
    const btn = h(
      'button',
      {
        type: 'button',
        class: 'cr',
        'data-part': 'collection-reset',
        'data-fid': `c:${id}`,
        'aria-label': `Reset ${label} to its seed data, ${records} now`,
        // aria-disabled, not disabled: a natively disabled focused button drops
        // focus to <body> in browsers, which would throw keyboard users out of the panel.
        'aria-disabled': resetting.has(id) ? 'true' : undefined,
      },
      'Reset',
    );
    btn.addEventListener('click', () => {
      if (resetting.has(id) || !hooks.resetCollection) return;
      resetting.add(id);
      btn.setAttribute('aria-disabled', 'true');
      void hooks
        .resetCollection(c.file, c.name)
        .then(
          () => ctx.announce(`${label} reset to its seed data`),
          () => ctx.announce(`Couldn't reset ${label}`),
        )
        .finally(() => {
          resetting.delete(id);
          ctx.rerender();
        });
    });
    return h(
      'div',
      { class: 'coll', 'data-part': 'collection', title: c.file },
      icon(ICON.data),
      h('span', { class: 'cn', 'data-part': 'collection-name' }, c.name),
      showFolder ? h('span', { class: 'cf', 'data-part': 'collection-folder' }, folder) : null,
      h('span', { class: 'cc', 'data-part': 'collection-count' }, records),
      btn,
    );
  }

  function rowNode(route: RouteEntry, prefix: string, overridden: Set<string>): HTMLElement {
    const key = selectionKey(route.method, route.url);
    const scenarios = route.scenarios ?? [];
    const isOn = overridden.has(key);
    const label = `${route.method.toUpperCase()} ${route.url}`;

    const rowEl = h('div', {
      class: scenarios.length === 0 ? 'row ns' : 'row',
      'data-part': 'row',
      'data-key': key,
    });
    rowEl.append(
      h('span', { class: 'm', 'data-part': 'method' }, methodLabel(route.method)),
      pathNode(route.url, prefix),
    );

    if (scenarios.length > 0) {
      const sel = h('select', {
        class: isOn ? 'sel on' : 'sel',
        'data-part': 'scenario',
        'data-fid': `${key}|s`,
        'aria-label': `Scenario for ${label}${isOn ? ', overridden' : ''}`,
        // Arrow keys move through the list, so say how to open the picker.
        'aria-description': 'Space or Alt+Down opens the scenarios',
      });
      const names = ['default', ...scenarios.filter((s) => s !== 'default')];
      for (const name of names) sel.append(h('option', { value: name }, name));
      sel.value = hooks.state[key] ?? 'default';
      sel.addEventListener('change', () => {
        ctx.announce(`${label}: ${sel.value}, applies to the next request`);
        if (sel.value === 'default') delete hooks.state[key];
        else hooks.state[key] = sel.value;
        hooks.onChange();
        ctx.rerender();
      });
      // Chevron as an svg icon (not a background image) so it survives forced colours.
      rowEl.append(h('span', { class: 'sw' }, sel, icon(ICON.chevron)));
    }

    syncLog(rowEl, key, label);
    return rowEl;
  }

  // ---------- request log: every recent request to the route ----------
  function logLine(e: LogEntry): HTMLElement {
    let result: HTMLElement;
    if (!e.known) {
      result = h('span', { class: 's warn' }, icon(ICON.alert), 'not in mocks → default');
    } else if (e.status === undefined) {
      result = h('span', { class: 's' }, `… ${((hooks.activity.now() - e.started) / 1000).toFixed(1)} s`);
    } else if (isUnexpectedEntry(e)) {
      result = h('span', { class: 's bad' }, icon(ICON.alert), `unexpected ${formatResult(e.status, e.ms ?? 0)}`);
    } else {
      result = h('span', { class: 's' }, formatResult(e.status, e.ms ?? 0));
    }
    // Where the scenario came from: the request's own ?_scenario= param, or this panel's picker.
    const source = e.page
      ? h('span', { class: 't', title: 'This request set its own scenario with ?_scenario=, which wins over the picker' }, 'via _scenario param')
      : e.carried
        ? h('span', { class: 't', title: "Scenario chosen in this panel's picker" }, 'via picker')
        : null;
    return h('li', {}, h('span', { class: 'n' }, e.name), result, source);
  }

  /** Create or update a row's log button and its log in place. */
  function syncLog(rowEl: HTMLElement, key: string, label: string): void {
    const a = hooks.activity.get(key);
    const log = a?.log ?? [];
    const id = logId(key);
    let btn = rowEl.querySelector<HTMLButtonElement>('[data-part="log"]');
    let box = rowEl.querySelector<HTMLElement>('[data-part="log-list"]');
    if (!btn) {
      btn = h('button', {
        type: 'button',
        class: 'lg',
        'data-part': 'log',
        'data-fid': `${key}|l`,
        'aria-controls': id,
        tabindex: '-1',
      });
      // Built once, so a click that lands mid-update still hits the same node.
      btn.append(icon(ICON.log));
      btn.addEventListener('click', () => {
        if (openLogs.has(key)) openLogs.delete(key);
        else openLogs.add(key);
        syncLog(rowEl, key, label);
      });
      rowEl.append(btn);
    }
    if (!box) {
      // Built once too, so the 4px slide animates and an open log keeps its nodes.
      box = h('div', { class: 'log', 'data-part': 'log-list', id }, h('div', {}, h('div', { class: 'in' }, h('ul'))));
      rowEl.append(box);
    }
    const n = log.length;
    if (n === 0) openLogs.delete(key);
    const open = openLogs.has(key);
    const bad = isUnexpectedError(a);
    btn.disabled = n === 0;
    if (btn.classList.contains('bad') !== bad) {
      // Brick never stands alone: the glyph itself becomes the warning mark.
      btn.classList.toggle('bad', bad);
      btn.replaceChildren(icon(bad ? ICON.alert : ICON.log));
    }
    btn.setAttribute(
      'aria-label',
      `Request log for ${label}, ${n === 0 ? 'no requests yet' : `${n} request${n === 1 ? '' : 's'}`}${bad ? ', last request failed unexpectedly' : ''}`,
    );
    btn.setAttribute('aria-expanded', String(open));
    // Rebuild the lines only when what they show changed: ticks fire for every request on the page.
    const inFlight = log.some((e) => e.status === undefined);
    const sig = JSON.stringify([log, inFlight ? hooks.activity.now() : 0]);
    if (logSig.get(box) !== sig) {
      logSig.set(box, sig);
      box.querySelector('ul')!.replaceChildren(...log.map(logLine));
    }
    box.classList.toggle('open', open);
    if (open) box.removeAttribute('inert');
    else box.setAttribute('inert', '');
  }

  function build(): void {
    const active = activeIn(ctx.shadowRoot);
    const fid = rows.contains(active) ? fidOf(active) : null;
    if (fid) lastFid = fid;

    const all = hooks.getRoutes();
    if (all.length >= SEARCH_MIN_ROUTES) {
      if (!searchWrap.isConnected) el.prepend(searchWrap);
      input.placeholder = `Filter ${all.length} routes`;
    } else if (searchWrap.isConnected) {
      searchWrap.remove();
      query = '';
      input.value = '';
      ctx.holdHeight?.(false);
    }

    const prefix = hooks.getUrlPrefix?.() ?? inferPrefix(all);
    const overridden = new Set(overriddenKeys(hooks.state, all));
    const shown = filterRoutes(all, query, view.onlyOverridden ? overridden : null);
    const filtering = query.trim() !== '' || view.onlyOverridden;
    // While filtering, a collection line shows only beside a route that's still shown.
    const groups = groupRoutes(shown, prefix, hooks.getCollections?.() ?? []).filter(
      (g) => !filtering || g.routes.length > 0,
    );
    rows.textContent = '';

    if (shown.length === 0 && query) {
      const clear = h('button', { type: 'button', class: 'fb' }, 'Clear search');
      clear.addEventListener('click', () => {
        setQuery('');
        input.focus();
      });
      rows.append(
        h(
          'div',
          { class: 'state empty', 'data-part': 'no-results' },
          h('h3', {}, `No routes match “${query}”.`),
          h('p', {}, 'The filter matches method and path.'),
          clear,
        ),
      );
    }

    for (const group of groups) {
      const inGroup = group.routes.filter((r) => overridden.has(selectionKey(r.method, r.url))).length;
      const details = h('details', { class: 'grp', 'data-part': 'group' });
      details.open = !closed.has(group.label);
      details.addEventListener('toggle', () => {
        if (details.open) closed.delete(group.label);
        else closed.add(group.label);
      });
      const { prefix: pre, rest } = splitPrefix(group.label, prefix);
      details.append(
        h(
          'summary',
          { 'data-fid': `g:${group.label}` },
          icon(ICON.chevron),
          h('span', { class: 'gp' }, pre ? h('span', { class: 'pre' }, pre.replace(/\/$/, '')) : null, pre ? `/${rest}` : group.label),
          h('span', { class: 'gc' }, `${group.routes.length} ${group.routes.length === 1 ? 'route' : 'routes'}`),
          inGroup > 0 ? h('span', { class: 'gchip', 'data-part': 'group-chip' }, `${inGroup} overridden`) : null,
        ),
      );
      for (const c of group.collections) {
        const shared = group.collections.filter((o) => o.name === c.name).length > 1;
        details.append(collectionNode(c, shared));
      }
      for (const route of group.routes) details.append(rowNode(route, prefix, overridden));
      rows.append(details);
    }

    applyRoving(lastFid);
    if (fid) findFid(fid)?.focus();
    syncTicker();
  }

  // ---------- roving focus ----------
  function navRows(): HTMLElement[][] {
    const out: HTMLElement[][] = [];
    for (const details of rows.querySelectorAll<HTMLDetailsElement>('details')) {
      out.push([details.querySelector('summary')!]);
      if (!details.open) continue;
      for (const r of details.querySelectorAll<HTMLElement>('[data-part="row"], [data-part="collection"]')) {
        const cells = [...r.querySelectorAll<HTMLElement>('[data-fid]:not(:disabled)')];
        // A scenario-less route that was never called has nothing to focus: skip it.
        if (cells.length) out.push(cells);
      }
    }
    return out;
  }

  function applyRoving(fid: string | null): void {
    const items = rows.querySelectorAll<HTMLElement>('[data-fid]:not(:disabled)');
    let current: HTMLElement | null = fid ? findFid(fid) : null;
    for (const item of items) item.tabIndex = -1;
    current ??= items[0] ?? null;
    if (current) current.tabIndex = 0;
  }

  rows.addEventListener('focusin', (e) => {
    const fid = fidOf(e.target as Element);
    if (fid) {
      lastFid = fid;
      applyRoving(fid);
    }
  });

  // Esc on an open log button collapses the log before the panel closes.
  rows.addEventListener('keydown', (e) => {
    const t = e.target as HTMLElement;
    if (e.key !== 'Escape' || t.dataset['part'] !== 'log' || t.getAttribute('aria-expanded') !== 'true') return;
    e.preventDefault();
    t.click();
  });

  rows.addEventListener('keydown', (e) => {
    const target = e.target as HTMLElement;
    if (!['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
    if (target.tagName === 'INPUT') return;
    const grid = navRows();
    const r = grid.findIndex((cells) => cells.includes(target));
    if (r === -1) return;
    const c = grid[r]!.indexOf(target);
    let nr = r;
    let nc = c;
    if (e.key === 'ArrowDown') nr = Math.min(grid.length - 1, r + 1);
    else if (e.key === 'ArrowUp') nr = Math.max(0, r - 1);
    else if (e.key === 'Home') nr = 0;
    else if (e.key === 'End') nr = grid.length - 1;
    else if (e.key === 'ArrowLeft') nc = Math.max(0, c - 1);
    else nc = Math.min(grid[r]!.length - 1, c + 1);
    // The picker gives up arrows to the list: Chrome on Windows would
    // otherwise change a closed select's value.
    e.preventDefault();
    const next = grid[nr]![Math.min(nc, grid[nr]!.length - 1)];
    next?.focus();
  });

  // ---------- activity: patch last lines; rebuild only when a URL param appears or goes ----------
  function patchRows(): void {
    for (const r of rows.querySelectorAll<HTMLElement>('[data-part="row"]')) {
      const key = r.dataset['key']!;
      const [method, url] = [key.slice(0, key.indexOf(' ')), key.slice(key.indexOf(' ') + 1)];
      syncLog(r, key, `${method.toUpperCase()} ${url}`);
    }
  }

  function anyInFlight(): boolean {
    for (const r of rows.querySelectorAll<HTMLElement>('[data-part="row"]')) {
      if (hooks.activity.get(r.dataset['key']!)?.inFlightSince !== undefined) return true;
    }
    return false;
  }

  function syncTicker(): void {
    if (anyInFlight()) {
      ticker ??= setInterval(() => {
        patchRows();
        syncTicker();
      }, 100);
    } else if (ticker !== undefined) {
      clearInterval(ticker);
      ticker = undefined;
    }
  }

  hooks.activity.subscribe(() => {
    if (!el.isConnected) return;
    patchRows();
    syncTicker();
  });

  return {
    el,
    update(next: ListView) {
      view = next;
      build();
    },
    focusSearch() {
      if (!searchWrap.isConnected) return false;
      input.focus();
      return true;
    },
    hasQuery() {
      return query !== '';
    },
    focusFirst() {
      (rows.querySelector<HTMLElement>('[tabindex="0"]') ?? rows.querySelector<HTMLElement>('[data-fid]'))?.focus();
    },
  };
}

