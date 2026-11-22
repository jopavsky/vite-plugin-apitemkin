// Pure view model for the dev-tools overlay: grouping, override counts,
// launcher text, filtering, copy URLs. No DOM access.

import type { RouteEntry } from './match.js';
import { selectionKey, type SelectionMap } from './state.js';

export interface RouteGroup {
  label: string;
  routes: RouteEntry[];
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

export function groupRoutes(routes: readonly RouteEntry[], prefix: string): RouteGroup[] {
  const rootLabel = prefix || '/';
  const folders = new Map<string, RouteEntry[]>();
  const root: RouteEntry[] = [];

  for (const r of routes) {
    const rest = prefix && r.url.startsWith(prefix + '/') ? r.url.slice(prefix.length) : r.url;
    const folder = segments(rest)[0];
    if (folder === undefined) root.push(r);
    else folders.set(folder, [...(folders.get(folder) ?? []), r]);
  }

  const groups: RouteGroup[] = [];
  for (const [folder, list] of folders) {
    if (list.length === 1) root.push(list[0]!);
    else groups.push({ label: `${prefix}/${folder}`, routes: list.sort(byUrlThenMethod) });
  }
  groups.sort((a, b) => a.label.localeCompare(b.label));
  if (root.length > 0) groups.unshift({ label: rootLabel, routes: root.sort(byUrlThenMethod) });
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
