// Per-route request activity for the overlay: the last request's result (for
// the log icon's "failed unexpectedly" state), the scenario an explicit URL
// param asked for, and a short log of recent requests. Fed by the fetch/XHR
// patches in client.ts; read by the list.

/** One request to a route, as the log under its row shows it. */
export interface LogEntry {
  /** The name shown: the page's `?_scenario=` value when it chose one, else the scenario served. */
  name: string;
  /** The scenario that answered (an unknown page-asked name falls back to default). */
  served: string;
  /** The page chose the scenario through `?_scenario=`. */
  page: boolean;
  /** The route defines `name`; false means the server fell back to default. */
  known: boolean;
  /** The request carried a scenario (page param or panel pick). */
  carried: boolean;
  started: number;
  status?: number;
  ms?: number;
}

const MAX_LOG = 10;

export interface RouteActivity {
  status?: number;
  ms?: number;
  inFlightSince?: number;
  urlScenario?: string;
  /** The last request carried a scenario (panel override or URL param). */
  scenario?: boolean;
  /** Recent requests, newest first, at most 10. */
  log?: (LogEntry & { id: number })[];
}

export type Activity = ReturnType<typeof createActivity>;

export function createActivity(now: () => number = () => performance.now()) {
  const byKey = new Map<string, RouteActivity>();
  const pending = new Map<number, { key: string; started: number }>();
  const listeners = new Set<() => void>();
  let nextToken = 1;

  const notify = (): void => {
    for (const fn of listeners) fn();
  };

  return {
    now,

    start(key: string, urlScenario: string | null, scenario = false, known = true, served = 'default'): number {
      const token = nextToken++;
      const started = now();
      const prev = byKey.get(key) ?? {};
      const carried = scenario || !!urlScenario;
      const next: RouteActivity = { ...prev, inFlightSince: started, scenario: carried };
      if (urlScenario) next.urlScenario = urlScenario;
      else delete next.urlScenario;
      const entry = {
        id: token,
        name: urlScenario || served,
        served,
        page: !!urlScenario,
        known,
        carried,
        started,
      };
      next.log = [entry, ...(prev.log ?? [])].slice(0, MAX_LOG);
      byKey.set(key, next);
      pending.set(token, { key, started });
      notify();
      return token;
    },

    finish(token: number, status: number): void {
      const p = pending.get(token);
      if (!p) return;
      pending.delete(token);
      const { inFlightSince: _drop, ...rest } = byKey.get(p.key) ?? {};
      const ms = Math.round(now() - p.started);
      const next: RouteActivity = { ...rest, status, ms };
      // Another request to this route may still be waiting: stay in flight from its start.
      let earliest: number | undefined;
      for (const q of pending.values()) {
        if (q.key === p.key && (earliest === undefined || q.started < earliest)) earliest = q.started;
      }
      if (earliest !== undefined) next.inFlightSince = earliest;
      if (rest.log) next.log = rest.log.map((e) => (e.id === token ? { ...e, status, ms } : e));
      byKey.set(p.key, next);
      notify();
    },

    get(key: string): RouteActivity | undefined {
      return byKey.get(key);
    },

    subscribe(fn: () => void): () => void {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}

/** A 5xx the developer didn't ask for: the request carried no scenario. */
export function isUnexpectedError(a: RouteActivity | undefined): boolean {
  return !!a && (a.status ?? 0) >= 500 && !a.scenario && !a.urlScenario;
}

/** The same rule for one logged request. */
export function isUnexpectedEntry(e: Pick<LogEntry, 'carried'> & { status?: number }): boolean {
  return (e.status ?? 0) >= 500 && !e.carried;
}
