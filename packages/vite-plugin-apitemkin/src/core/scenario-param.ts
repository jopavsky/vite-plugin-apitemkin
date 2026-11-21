/** Short scenario query param. */
export const SCENARIO_PARAM = '_scenario';

/** Deprecated name, still accepted until 2.0. */
export const LEGACY_SCENARIO_PARAM = 'apitemkin_scenario';

/**
 * Read the requested scenario name. `_scenario` wins whenever it is present
 * (even empty); otherwise fall back to the deprecated `apitemkin_scenario`.
 */
export function readScenarioParam(params: URLSearchParams): string | undefined {
  if (params.has(SCENARIO_PARAM)) return params.get(SCENARIO_PARAM) ?? '';
  return params.get(LEGACY_SCENARIO_PARAM) ?? undefined;
}
