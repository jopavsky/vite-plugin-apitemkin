// Collections for the overlay: load GET /_apitemkin/collections, reset one,
// and refresh the counts shortly after the app writes something.

import type { CollectionInfo } from './model.js';

export const COLLECTIONS_URL = '/_apitemkin/collections';
export const RESET_URL = '/_apitemkin/collections/reset';
const REFRESH_DELAY_MS = 150;

export interface CollectionsPayload {
  urlPrefix: string;
  collections: CollectionInfo[];
}

/** Validate the endpoint's body; drop malformed entries. Null when the shape is wrong. */
export function parseCollections(body: unknown): CollectionsPayload | null {
  if (typeof body !== 'object' || body === null) return null;
  const { urlPrefix, collections } = body as { urlPrefix?: unknown; collections?: unknown };
  if (typeof urlPrefix !== 'string' || !Array.isArray(collections)) return null;
  const out: CollectionInfo[] = [];
  for (const c of collections) {
    if (!c || typeof c !== 'object') continue;
    const e = c as Record<string, unknown>;
    if (
      typeof e['name'] === 'string' &&
      typeof e['file'] === 'string' &&
      typeof e['url'] === 'string' &&
      typeof e['count'] === 'number'
    ) {
      out.push({ name: e['name'], file: e['file'], url: e['url'], count: e['count'] });
    }
  }
  return { urlPrefix, collections: out };
}

/** A finished request that may have changed a collection: same origin, not GET/HEAD, under the prefix. */
export function isWriteUnderPrefix(
  method: string,
  url: URL,
  origin: string,
  prefix: string | undefined,
): boolean {
  if (url.origin !== origin) return false;
  const m = method.toUpperCase();
  if (m === 'GET' || m === 'HEAD' || m === 'OPTIONS') return false;
  if (url.pathname.startsWith('/_apitemkin/')) return false;
  if (!prefix) return true;
  return url.pathname === prefix || url.pathname.startsWith(prefix + '/');
}

export interface CollectionsSync {
  /** Fetch the list; throws on failure (the caller decides what to log). */
  load(): Promise<void>;
  reset(file: string, name: string): Promise<void>;
  /** Debounced load after a write; calls onUpdate when done. */
  scheduleRefresh(): void;
  get(): readonly CollectionInfo[];
  /** The server's urlPrefix, once known. */
  prefix(): string | undefined;
}

export function createCollectionsSync(
  fetchFn: typeof fetch,
  onUpdate: () => void,
  delayMs = REFRESH_DELAY_MS,
): CollectionsSync {
  let list: CollectionInfo[] = [];
  let prefix: string | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;

  async function load(): Promise<void> {
    const res = await fetchFn(COLLECTIONS_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const parsed = parseCollections(await res.json());
    if (!parsed) throw new Error('collections payload has the wrong shape');
    list = parsed.collections;
    prefix = parsed.urlPrefix;
  }

  return {
    load,

    async reset(file, name) {
      const res = await fetchFn(RESET_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file, name }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const entry = (await res.json()) as Partial<CollectionInfo>;
      if (typeof entry.count === 'number') {
        list = list.map((c) => (c.file === file && c.name === name ? { ...c, count: entry.count! } : c));
      }
    },

    scheduleRefresh() {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const before = JSON.stringify(list);
        // Only re-render when a count (or the list) actually moved: a rebuild
        // would close a scenario picker the user has open.
        load().then(() => {
          if (JSON.stringify(list) !== before) onUpdate();
        }, (err: unknown) => {
          console.warn('[apitemkin] collections refresh failed:', err instanceof Error ? err.message : String(err));
        });
      }, delayMs);
    },

    get: () => list,
    prefix: () => prefix,
  };
}
