// Per-tab selection state for the dev-tools overlay. Persists to
// localStorage under "apitemkin:selections". Pure helpers; no DOM
// access beyond `window.localStorage`, which is checked at the call
// site so node-env tests can import the module safely.

import type { RouteEntry } from './match.js';

export const STORAGE_KEY = 'apitemkin:selections';

export interface SelectionMap {
  [key: string]: string;
}

export function selectionKey(method: string, urlPattern: string): string {
  return `${method.toUpperCase()} ${urlPattern}`;
}

export function loadState(storage: Storage): SelectionMap {
  try {
    const raw = storage.getItem(STORAGE_KEY);
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

export function saveState(storage: Storage, state: SelectionMap): void {
  try {
    if (Object.keys(state).length === 0) {
      storage.removeItem(STORAGE_KEY);
    } else {
      storage.setItem(STORAGE_KEY, JSON.stringify(state));
    }
  } catch {
    // localStorage disabled / quota — degrade silently.
  }
}

export function pruneState(state: SelectionMap, routes: readonly RouteEntry[]): void {
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
