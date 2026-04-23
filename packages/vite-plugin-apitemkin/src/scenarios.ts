import type {
  ApitemkinHandler,
  ApitemkinRequest,
  RichResponse,
} from './runtime.js';

export type ScenarioValue<TBody = unknown> =
  | TBody
  | RichResponse<TBody>
  | ApitemkinHandler<TBody>;

export interface ScenariosMap<TBody = unknown> {
  default: ScenarioValue<TBody>;
  [name: string]: ScenarioValue<TBody>;
}

export interface ScenariosHandler<TBody = unknown>
  extends ApitemkinHandler<TBody> {
  /** Internal — list of scenario names attached for the discovery endpoint. */
  __apitemkin_scenarios: string[];
}

/**
 * Define a code mock with multiple named response variants. The active
 * variant is picked per request via `?apitemkin_scenario=<name>`. Unknown
 * scenarios silently fall back to `default` with a console warning.
 *
 * Each value can be:
 *   - a plain response body (sent as JSON, status 200)
 *   - a {@link RichResponse} `{ status?, headers?, body, delay? }`
 *   - an {@link ApitemkinHandler} function for dynamic per-scenario logic
 *
 * @example
 * export default defineScenarios<User[]>({
 *   default: [{ id: 1, name: 'Ada' }],
 *   empty:   [],
 *   error:   { status: 500, body: { error: 'oops' } },
 *   slow:    { delay: 2000, body: [{ id: 1, name: 'Ada' }] },
 *   computed: ({ params }) => ({ id: Number(params.id), name: 'Ada' }),
 * });
 */
export function defineScenarios<TBody = unknown>(
  scenarios: ScenariosMap<TBody>,
): ScenariosHandler<TBody> {
  const handler = (async (req: ApitemkinRequest) => {
    const requested = req.scenario;
    let chosen: ScenarioValue<TBody>;

    if (requested && Object.prototype.hasOwnProperty.call(scenarios, requested)) {
      chosen = scenarios[requested]!;
    } else {
      if (requested) {
        console.warn(
          `apitemkin: scenario '${requested}' not defined for ${req.method} ${req.url}, falling back to default`,
        );
      }
      chosen = scenarios.default;
    }

    if (typeof chosen === 'function') {
      return (chosen as ApitemkinHandler<TBody>)(req);
    }
    return chosen;
  }) as ScenariosHandler<TBody>;

  handler.__apitemkin_scenarios = Object.keys(scenarios);
  return handler;
}
