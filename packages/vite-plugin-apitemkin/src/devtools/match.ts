// Browser-side route matcher for the dev-tools overlay.
//
// Mirrors the specificity rule of the server-side matcher (src/matcher.ts):
// most-literal-segments wins; ties break alphabetically. The server breaks
// ties on `route.filePath`; the discovery payload doesn't expose that, so
// we tiebreak on `route.url` instead. Both produce stable, predictable
// orderings — the tiebreaker only matters when two patterns are equally
// specific, which is rare and indistinguishable in practice.
//
// Input is the discovery payload shape: `{ method, url, kind?, scenarios? }`,
// where `url` is the full URL pattern with prefix already prepended
// (e.g. "/api/users/:id"). The matcher only decides whether a path matches
// — it does not extract params, since the overlay never needs them.

export interface RouteEntry {
  method: string;
  url: string;
  kind?: 'json' | 'code';
  scenarios?: string[];
}

export interface CompiledPattern {
  regex: RegExp;
  literalCount: number;
}

export function compilePattern(pattern: string): CompiledPattern {
  const segments = pattern.split('/').filter((s) => s !== '');
  let literalCount = 0;
  const parts = segments.map((seg) => {
    if (seg.startsWith(':')) return '[^/]+';
    literalCount++;
    return escapeRegex(seg);
  });
  const body = parts.length === 0 ? '/?' : '/' + parts.join('/');
  return {
    regex: new RegExp('^' + body + '/?$'),
    literalCount,
  };
}

export function findRoute(
  routes: readonly RouteEntry[],
  method: string,
  path: string,
): RouteEntry | null {
  const wanted = method.toUpperCase();
  const normalized = stripTrailingSlash(path);

  let best: { route: RouteEntry; literalCount: number } | null = null;

  for (const route of routes) {
    if (route.method.toUpperCase() !== wanted) continue;
    const { regex, literalCount } = compilePattern(route.url);
    if (!regex.test(normalized)) continue;

    if (
      !best ||
      literalCount > best.literalCount ||
      (literalCount === best.literalCount &&
        route.url.localeCompare(best.route.url) < 0)
    ) {
      best = { route, literalCount };
    }
  }

  return best?.route ?? null;
}

function stripTrailingSlash(path: string): string {
  return path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
