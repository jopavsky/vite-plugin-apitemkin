// Browser-side entry for the apitemkin dev-tools overlay.
// Built as an IIFE bundle to dist/devtools.client.js and served by the
// plugin at GET /_apitemkin/devtools.js. Loaded via a <script type="module">
// tag the plugin injects into the host app's HTML during dev only.

import { findRoute, type RouteEntry } from './match.js';
import {
  loadState,
  pruneState,
  saveState,
  selectionKey,
  type SelectionMap,
} from './state.js';
import { mountPanel, type DiscoveryStatus } from './ui.js';

const DISCOVERY_URL = '/_apitemkin/scenarios';
const SCENARIO_PARAM = 'apitemkin_scenario';

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  bootstrap();
}

function bootstrap(): void {
  // Capture the unpatched fetch BEFORE installing the patch — discovery
  // must not route through itself or it deadlocks on `discoveryReady`.
  const originalFetch = window.fetch.bind(window);

  let routes: RouteEntry[] = [];
  let status: DiscoveryStatus = 'loading';
  let lastError: string | null = null;
  const state: SelectionMap = loadState(window.localStorage);

  let discoveryReady: Promise<void> = runDiscovery();

  installFetchPatch(originalFetch, () => discoveryReady, () => routes, state);
  installXHRPatch(() => routes, state);

  const panel = mountPanel({
    state,
    getRoutes: () => routes,
    getStatus: () => status,
    getError: () => lastError,
    refresh: () => {
      discoveryReady = runDiscovery();
      return discoveryReady;
    },
    onChange: () => {
      saveState(window.localStorage, state);
    },
  });

  // Re-render once discovery resolves so the table swaps from the
  // loading skeleton to the route list.
  discoveryReady.then(() => panel.rerender());

  function runDiscovery(): Promise<void> {
    status = 'loading';
    lastError = null;
    return startDiscovery(originalFetch)
      .then((discovered) => {
        routes = discovered;
        pruneState(state, routes);
        saveState(window.localStorage, state);
        status = routes.length === 0 ? 'empty' : 'ok';
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        console.warn('[apitemkin] discovery failed:', message);
        status = 'error';
        lastError = message;
      });
  }
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

    const rewritten = maybeRewrite(
      url,
      method,
      window.location.origin,
      getRoutes(),
      state,
    );
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
  // XHR.open is synchronous, so we can't await discovery here. Requests
  // made before discovery resolves pass through unchanged — acceptable
  // for the overlay's intended use, which is per-route selection
  // persisted across reloads. After discovery resolves, every subsequent
  // open() sees the populated routes and gets the correct rewrite.
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
    return (originalOpen as (...a: unknown[]) => void).apply(this, [
      method,
      target,
      ...rest,
    ]);
  } as typeof XMLHttpRequest.prototype.open;
}
