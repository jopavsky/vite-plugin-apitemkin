import type { HttpMethod, MockRoute } from './scanner.js';

export interface MatchResult {
  route: MockRoute;
  params: Record<string, string>;
}

export function matchRoute(
  routes: MockRoute[],
  method: string,
  url: string,
  urlPrefix = '/api',
): MatchResult | null {
  const normalizedMethod = method.toUpperCase() as HttpMethod;
  const prefix = normalizePrefix(urlPrefix);
  const path = stripToPath(url);

  if (prefix && !startsWithPrefix(path, prefix)) return null;

  const afterPrefix = prefix ? path.slice(prefix.length) : path;
  const urlSegments = splitPath(afterPrefix);

  type Candidate = {
    route: MockRoute;
    params: Record<string, string>;
    literalCount: number;
  };
  const matches: Candidate[] = [];

  for (const route of routes) {
    if (route.method !== normalizedMethod) continue;
    if (route.segments.length !== urlSegments.length) continue;

    const params: Record<string, string> = {};
    let literalCount = 0;
    let ok = true;

    for (let i = 0; i < route.segments.length; i++) {
      const seg = route.segments[i]!;
      const part = urlSegments[i]!;
      if (seg.kind === 'literal') {
        if (seg.value !== part) {
          ok = false;
          break;
        }
        literalCount++;
      } else {
        params[seg.name] = decodeURIComponent(part);
      }
    }

    if (ok) matches.push({ route, params, literalCount });
  }

  if (matches.length === 0) return null;

  matches.sort((a, b) => {
    if (b.literalCount !== a.literalCount) return b.literalCount - a.literalCount;
    return a.route.filePath.localeCompare(b.route.filePath);
  });

  const winner = matches[0]!;
  return { route: winner.route, params: winner.params };
}

function stripToPath(url: string): string {
  let path = url.split('?')[0]!;
  path = path.split('#')[0]!;
  if (path.length > 1 && path.endsWith('/')) {
    path = path.slice(0, -1);
  }
  return path;
}

function startsWithPrefix(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(prefix + '/');
}

function splitPath(path: string): string[] {
  if (!path || path === '/') return [];
  return path.split('/').filter((s) => s !== '');
}

function normalizePrefix(prefix: string): string {
  if (!prefix) return '';
  let p = prefix;
  if (!p.startsWith('/')) p = '/' + p;
  if (p.endsWith('/')) p = p.slice(0, -1);
  return p;
}
