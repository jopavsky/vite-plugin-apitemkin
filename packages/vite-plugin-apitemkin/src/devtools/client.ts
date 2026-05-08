// Browser-side entry for the apitemkin dev-tools overlay.
// Built as an IIFE bundle to dist/devtools.client.js and served by the
// plugin at GET /_apitemkin/devtools.js. Loaded via a <script type="module">
// tag the plugin injects into the host app's HTML during dev only.
//
// v1.2 chunk 3: discovery + state + fetch/XHR interception. UI lands in
// chunk 4 — for now, drive selections from the devtools console via
// `window.__apitemkin_set('GET /api/orders', 'error')`.

import { findRoute, type RouteEntry } from './match.js';

const STORAGE_KEY = 'apitemkin:selections';
const DISCOVERY_URL = '/_apitemkin/scenarios';
const SCENARIO_PARAM = 'apitemkin_scenario';

export interface SelectionMap {
  [key: string]: string;
}

export function selectionKey(method: string, urlPattern: string): string {
  return `${method.toUpperCase()} ${urlPattern}`;
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  bootstrap();
}

function bootstrap(): void {
  // Capture the unpatched fetch BEFORE installing the patch — discovery
  // must not route through itself or it deadlocks on `discoveryReady`.
  const originalFetch = window.fetch.bind(window);

  let routes: RouteEntry[] = [];
  const state: SelectionMap = loadState();

  const discoveryReady = startDiscovery(originalFetch)
    .then((discovered) => {
      routes = discovered;
      pruneState(state, routes);
      saveState(state);
    })
    .catch((err) => {
      console.warn('[apitemkin] discovery failed:', err);
    });

  installFetchPatch(originalFetch, () => discoveryReady, () => routes, state);
  installXHRPatch(() => routes, state);
  exposeConsoleHook(state);
}

// ---------- discovery ----------

async function startDiscovery(
  originalFetch: typeof fetch,
): Promise<RouteEntry[]> {
  const res = await originalFetch(DISCOVERY_URL);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body: unknown = await res.json();
  if (!Array.isArray(body)) throw new Error('payload is not an array');
  const out: RouteEntry[] = [];
  for (const entry of body) {
    if (
      entry &&
      typeof entry === 'object' &&
      typeof (entry as { method: unknown }).method === 'string' &&
      typeof (entry as { url: unknown }).url === 'string'
    ) {
      const e = entry as {
        method: string;
        url: string;
        kind?: unknown;
        scenarios?: unknown;
      };
      out.push({
        method: e.method,
        url: e.url,
        kind: e.kind === 'json' || e.kind === 'code' ? e.kind : undefined,
        scenarios: Array.isArray(e.scenarios)
          ? e.scenarios.filter((s): s is string => typeof s === 'string')
          : [],
      });
    }
  }
  return out;
}

// ---------- state ----------

function loadState(): SelectionMap {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: SelectionMap = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === 'string' && v.length > 0) out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

function saveState(state: SelectionMap): void {
  try {
    if (Object.keys(state).length === 0) {
      window.localStorage.removeItem(STORAGE_KEY);
    } else {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }
  } catch {
    // localStorage disabled / quota — degrade silently.
  }
}

export function pruneState(state: SelectionMap, routes: RouteEntry[]): void {
  const known = new Map<string, Set<string>>();
  for (const r of routes) {
    known.set(selectionKey(r.method, r.url), new Set(r.scenarios ?? []));
  }
  for (const key of Object.keys(state)) {
    const valid = known.get(key);
    if (!valid || !valid.has(state[key]!)) {
      delete state[key];
    }
  }
}

// ---------- interception ----------

export function maybeRewrite(
  url: URL,
  method: string,
  currentOrigin: string,
  routes: readonly RouteEntry[],
  state: SelectionMap,
): URL | null {
  if (url.origin !== currentOrigin) return null;
  const route = findRoute(routes, method, url.pathname);
  if (!route) return null;
  const scenario = state[selectionKey(method, route.url)];
  if (!scenario) return null;
  const next = new URL(url);
  next.searchParams.set(SCENARIO_PARAM, scenario);
  return next;
}

function installFetchPatch(
  originalFetch: typeof fetch,
  ready: () => Promise<unknown>,
  getRoutes: () => RouteEntry[],
  state: SelectionMap,
): void {
  window.fetch = async function apitemkinFetch(input, init) {
    await ready();
    let url: URL;
    let method: string;
    try {
      if (typeof input === 'string') {
        url = new URL(input, window.location.href);
        method = init?.method ?? 'GET';
      } else if (input instanceof URL) {
        url = new URL(input.href);
        method = init?.method ?? 'GET';
      } else {
        url = new URL(input.url);
        method = init?.method ?? input.method;
      }
    } catch {
      return originalFetch(input, init);
    }

    const rewritten = maybeRewrite(url, method, window.location.origin, getRoutes(), state);
    if (!rewritten) return originalFetch(input, init);

    if (typeof input === 'string') {
      return originalFetch(rewritten.href, init);
    }
    if (input instanceof URL) {
      return originalFetch(rewritten, init);
    }
    return originalFetch(new Request(rewritten.href, input), init);
  };
}

function installXHRPatch(
  getRoutes: () => RouteEntry[],
  state: SelectionMap,
): void {
  const originalOpen = XMLHttpRequest.prototype.open;
  // XHR.open is synchronous, so we can't await discovery here. Requests made
  // before discovery resolves pass through unchanged — acceptable for the
  // overlay's intended use, which is per-route selection persisted across
  // reloads. After discovery resolves (~ms), every subsequent open() sees
  // the populated routes and gets the correct rewrite.
  XMLHttpRequest.prototype.open = function apitemkinXhrOpen(
    this: XMLHttpRequest,
    method: string,
    url: string | URL,
    ...rest: unknown[]
  ): void {
    let target: string | URL = url;
    try {
      const parsed = new URL(url.toString(), window.location.href);
      const rewritten = maybeRewrite(
        parsed,
        method,
        window.location.origin,
        getRoutes(),
        state,
      );
      if (rewritten) target = rewritten.href;
    } catch {
      // bad URL — pass through unchanged
    }
    // Preserve original arity so callers passing user/password still work.
    return (originalOpen as (...a: unknown[]) => void).apply(this, [
      method,
      target,
      ...rest,
    ]);
  } as typeof XMLHttpRequest.prototype.open;
}

// ---------- chunk-3 console hook (removed in chunk 4) ----------

function exposeConsoleHook(state: SelectionMap): void {
  const w = window as unknown as Record<string, unknown>;
  w['__apitemkin_set'] = (key: string, scenario: string): void => {
    if (typeof key !== 'string' || key.length === 0) {
      console.warn(
        '[apitemkin] __apitemkin_set: first arg must be "METHOD /path"',
      );
      return;
    }
    if (!scenario || scenario === 'default') {
      delete state[key];
    } else {
      state[key] = scenario;
    }
    saveState(state);
    console.debug('[apitemkin] selections =', { ...state });
  };
  w['__apitemkin_get'] = (): SelectionMap => ({ ...state });
}
