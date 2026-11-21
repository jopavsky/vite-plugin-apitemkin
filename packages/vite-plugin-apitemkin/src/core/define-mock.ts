import type {
  ApitemkinHandler,
  ApitemkinRequest,
  ScenariosHandler,
  ScenariosMap,
  ScenarioValue,
} from './runtime.js';
import { readScenarioParam } from './scenario-param.js';

function extractScenario(url: string): string | undefined {
  const q = url.indexOf('?');
  if (q === -1) return undefined;
  const queryStr = url.slice(q + 1).split('#')[0]!;
  const params = new URLSearchParams(queryStr);
  return readScenarioParam(params);
}

/**
 * Define a mock handler. Accepts one of two shapes:
 *
 * 1. **A handler function** — `(req) => body | rich response | Promise<...>`.
 *    Identity at runtime; gives TypeScript full inference on the response.
 *
 *    ```ts
 *    export default defineMock<User>(({ params }) => ({
 *      id: Number(params.id),
 *      name: 'Ada',
 *    }));
 *    ```
 *
 * 2. **A scenarios map** — `{ default, [name]: ... }` for multiple named
 *    response variants. The `default` key is required. Active variant is
 *    picked per request via `?_scenario=<name>` (deprecated
 *    `apitemkin_scenario` still accepted until 2.0). Each value can
 *    be a plain body, a `RichResponse`, or a handler function.
 *
 *    ```ts
 *    export default defineMock<User[]>({
 *      default: [{ id: 1, name: 'Ada' }],
 *      empty:   [],
 *      error:   { status: 500, body: { error: 'oops' } },
 *      slow:    { delay: 2000, body: [{ id: 1, name: 'Ada' }] },
 *      computed: ({ params }) => [{ id: Number(params.id), name: 'Ada' }],
 *    });
 *    ```
 */
export function defineMock<TBody = unknown>(
  handler: ApitemkinHandler<TBody>,
): ApitemkinHandler<TBody>;
export function defineMock<TBody = unknown>(
  scenarios: ScenariosMap<TBody>,
): ScenariosHandler<TBody>;
export function defineMock<TBody = unknown>(
  arg: ApitemkinHandler<TBody> | ScenariosMap<TBody>,
): ApitemkinHandler<TBody> {
  if (typeof arg === 'function') {
    return arg;
  }

  const scenarios = arg;
  const handler = (async (req: ApitemkinRequest) => {
    const requested = extractScenario(req.url);
    let chosen: ScenarioValue<TBody>;

    if (
      requested &&
      Object.prototype.hasOwnProperty.call(scenarios, requested)
    ) {
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
