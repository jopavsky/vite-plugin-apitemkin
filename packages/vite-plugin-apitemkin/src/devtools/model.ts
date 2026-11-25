// Pure view model for the dev-tools overlay: grouping, override counts,
// launcher text, filtering, copy URLs. No DOM access.

import type { RouteEntry } from './match.js';
import { selectionKey, type SelectionMap } from './state.js';

/** One collection from GET /_apitemkin/collections. */
export interface CollectionInfo {
  name: string;
  file: string;
  /** Folder URL, e.g. `/api/users`. */
  url: string;
  count: number;
}

export interface RouteGroup {
  label: string;
  routes: RouteEntry[];
  /** Collections whose data file lives in this group's folder; drawn above the routes. */
  collections: CollectionInfo[];
}

const segments = (url: string): string[] => url.split('/').filter((s) => s !== '');

const byUrlThenMethod = (a: RouteEntry, b: RouteEntry): number =>
  a.url.localeCompare(b.url) || a.method.localeCompare(b.method);

/**
 * The discovery payload carries full URLs but not the plugin's urlPrefix.
 * Infer it as the shared first segment, but only when every route has at
 * least one more segment after it (otherwise `/users` + `/users/:id`
 * would wrongly read as prefix `/users`).
 */
export function inferPrefix(routes: readonly RouteEntry[]): string {
  if (routes.length === 0) return '';
  let first: string | null = null;
  for (const r of routes) {
    const segs = segments(r.url);
    if (segs.length < 2) return '';
    if (first === null) first = segs[0]!;
    else if (segs[0] !== first) return '';
  }
  return `/${first}`;
}

export function groupRoutes(
  routes: readonly RouteEntry[],
  prefix: string,
  collections: readonly CollectionInfo[] = [],
): RouteGroup[] {
  const rootLabel = prefix || '/';
  const folders = new Map<string, { routes: RouteEntry[]; collections: CollectionInfo[] }>();
  const root: RouteEntry[] = [];
  const rootCollections: CollectionInfo[] = [];

  const folderOf = (url: string): string | undefined => {
    const rest = prefix && url.startsWith(prefix + '/') ? url.slice(prefix.length) : url === prefix ? '' : url;
    return segments(rest)[0];
  };
  const slot = (folder: string) => {
    let s = folders.get(folder);
    if (!s) folders.set(folder, (s = { routes: [], collections: [] }));
    return s;
  };

  for (const r of routes) {
    const folder = folderOf(r.url);
    if (folder === undefined) root.push(r);
    else slot(folder).routes.push(r);
  }
  for (const c of collections) {
    const folder = folderOf(c.url);
    if (folder === undefined) rootCollections.push(c);
    else slot(folder).collections.push(c);
  }

  const groups: RouteGroup[] = [];
  for (const [folder, s] of folders) {
    // A lone route folds into the root group, unless a collection lives in its folder.
    if (s.routes.length === 1 && s.collections.length === 0) root.push(s.routes[0]!);
    else groups.push({ label: `${prefix}/${folder}`, routes: s.routes.sort(byUrlThenMethod), collections: s.collections });
  }
  groups.sort((a, b) => a.label.localeCompare(b.label));
  if (root.length > 0 || rootCollections.length > 0) {
    groups.unshift({ label: rootLabel, routes: root.sort(byUrlThenMethod), collections: rootCollections });
  }
  return groups;
}

export function overriddenKeys(state: SelectionMap, routes: readonly RouteEntry[]): string[] {
  const out: string[] = [];
  for (const r of [...routes].sort(byUrlThenMethod)) {
    const key = selectionKey(r.method, r.url);
    const value = state[key];
    if (value && value !== 'default' && (r.scenarios ?? []).includes(value)) out.push(key);
  }
  return out;
}

export function lastLiteralSegment(url: string): string {
  const literal = segments(url).filter((s) => !s.startsWith(':'));
  return literal[literal.length - 1] ?? url;
}

export function launcherContent(
  state: SelectionMap,
  routes: readonly RouteEntry[],
): { chip: string | null; accessibleName: string } {
  const keys = overriddenKeys(state, routes);
  if (keys.length === 0) return { chip: null, accessibleName: 'apitemkin. Open panel' };
  if (keys.length === 1) {
    const key = keys[0]!;
    const route = routes.find((r) => selectionKey(r.method, r.url) === key)!;
    const chip = `${lastLiteralSegment(route.url)}: ${state[key]}`;
    return {
      chip,
      accessibleName: `apitemkin ${chip}. ${route.method.toUpperCase()} ${route.url} is overridden. Open panel`,
    };
  }
  const chip = `${keys.length} overridden`;
  return { chip, accessibleName: `apitemkin ${chip}. Open panel` };
}

export function filterRoutes(
  routes: readonly RouteEntry[],
  query: string,
  onlyKeys: Set<string> | null,
): RouteEntry[] {
  const q = query.trim().toLowerCase();
  return routes.filter((r) => {
    if (onlyKeys && !onlyKeys.has(selectionKey(r.method, r.url))) return false;
    return !q || `${r.method} ${r.url}`.toLowerCase().includes(q);
  });
}

export function splitPrefix(url: string, prefix: string): { prefix: string; rest: string } {
  return prefix && url.startsWith(prefix + '/')
    ? { prefix: prefix + '/', rest: url.slice(prefix.length + 1) }
    : { prefix: '', rest: url };
}
