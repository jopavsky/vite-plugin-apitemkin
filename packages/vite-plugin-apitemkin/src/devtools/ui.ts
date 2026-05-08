// Launcher + slide-in panel for the apitemkin dev-tools overlay.
// Renders into a closed shadow root attached to a host <div> appended
// to <body>. All styles scoped inside the shadow; the host page's CSS
// can't bleed in and the overlay's CSS can't bleed out.
//
// State is owned by the bootstrap (in client.ts) — this module reads
// it via getters, mutates it through `setSelection`, and tells the
// caller when something changed via `onChange`.

import type { RouteEntry } from './match.js';
import { selectionKey, type SelectionMap } from './state.js';

export type DiscoveryStatus = 'loading' | 'ok' | 'empty' | 'error';

export interface PanelHooks {
  /** Live reference to the selection map. Mutated in place. */
  state: SelectionMap;
  /** Latest discovered routes. Empty array until the first discovery resolves. */
  getRoutes: () => readonly RouteEntry[];
  getStatus: () => DiscoveryStatus;
  getError: () => string | null;
  /** Re-fire discovery + re-prune state. Returns when the panel can re-render. */
  refresh: () => Promise<void>;
  /** Persist `state` after the panel mutates it. */
  onChange: () => void;
}

const HOST_ID = 'apitemkin-devtools-host';

const CSS = `
:host {
  all: initial;
  font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
  color-scheme: light dark;
}
*, *::before, *::after { box-sizing: border-box; }
.launcher {
  position: fixed;
  bottom: 12px;
  right: 12px;
  z-index: 2147483647;
  background: #111827;
  color: #f3f4f6;
  border: 1px solid #374151;
  border-radius: 999px;
  padding: 6px 14px;
  font: 500 12px/1 inherit;
  cursor: pointer;
  box-shadow: 0 4px 14px rgba(0,0,0,0.18);
}
.launcher:hover { background: #1f2937; }
.launcher .badge {
  display: inline-block;
  background: #dc2626;
  color: #fff;
  border-radius: 999px;
  padding: 1px 6px;
  margin-left: 6px;
  font-size: 10px;
}
.panel {
  position: fixed;
  top: 12px;
  right: 12px;
  bottom: 12px;
  width: 440px;
  max-width: calc(100vw - 24px);
  background: #ffffff;
  color: #111827;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  box-shadow: 0 12px 32px rgba(0,0,0,0.18);
  z-index: 2147483646;
  display: none;
  flex-direction: column;
  overflow: hidden;
  font-size: 12px;
}
.panel[data-open="true"] { display: flex; }
.panel header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 12px;
  border-bottom: 1px solid #e5e7eb;
  background: #f9fafb;
}
.panel h2 {
  flex: 1;
  margin: 0;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.02em;
}
.panel header button {
  background: #ffffff;
  color: inherit;
  border: 1px solid #d1d5db;
  border-radius: 4px;
  padding: 3px 8px;
  font: 500 11px/1 inherit;
  cursor: pointer;
}
.panel header button:hover { background: #f3f4f6; }
.panel header [data-action="close"] {
  border: none;
  background: transparent;
  font-size: 18px;
  line-height: 1;
  padding: 0 6px;
}
.confirm {
  padding: 8px 12px;
  background: #fef2f2;
  border-bottom: 1px solid #fecaca;
  color: #7f1d1d;
  display: flex;
  align-items: center;
  gap: 8px;
}
.confirm span { flex: 1; }
.confirm .yes {
  background: #dc2626;
  color: #fff;
  border: none;
  border-radius: 4px;
  padding: 3px 10px;
  cursor: pointer;
}
.confirm .no {
  background: #fff;
  border: 1px solid #d1d5db;
  border-radius: 4px;
  padding: 3px 10px;
  cursor: pointer;
}
.content {
  flex: 1;
  overflow-y: auto;
}
.empty {
  padding: 32px 24px;
  text-align: center;
  color: #6b7280;
  line-height: 1.5;
}
.empty button {
  margin-top: 12px;
  background: #ffffff;
  border: 1px solid #d1d5db;
  border-radius: 4px;
  padding: 4px 10px;
  font: 500 11px/1 inherit;
  cursor: pointer;
}
table {
  width: 100%;
  border-collapse: collapse;
}
th, td {
  text-align: left;
  padding: 6px 12px;
  border-bottom: 1px solid #f3f4f6;
  vertical-align: middle;
}
th {
  position: sticky;
  top: 0;
  background: #f9fafb;
  font: 600 10px/1 inherit;
  color: #4b5563;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
tbody tr:hover td { background: #f9fafb; }
.pill {
  display: inline-block;
  font: 600 10px/1 ui-monospace, "SF Mono", Menlo, monospace;
  padding: 3px 6px;
  border-radius: 3px;
  color: #fff;
  letter-spacing: 0.03em;
}
.pill-GET { background: #2563eb; }
.pill-POST { background: #16a34a; }
.pill-PUT, .pill-PATCH { background: #d97706; }
.pill-DELETE { background: #dc2626; }
.pill-OTHER { background: #6b7280; }
.url {
  font-family: ui-monospace, "SF Mono", Menlo, monospace;
  font-size: 11.5px;
  word-break: break-all;
}
td.scenario select {
  width: 100%;
  font: inherit;
  padding: 2px 4px;
  border: 1px solid #d1d5db;
  border-radius: 4px;
  background: #ffffff;
  color: inherit;
}
td.scenario.na { color: #9ca3af; font-style: italic; }
td.active { width: 24px; text-align: center; }
.dot {
  display: inline-block;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #2563eb;
}
@media (prefers-color-scheme: dark) {
  .panel {
    background: #1f2937;
    color: #f3f4f6;
    border-color: #374151;
  }
  .panel header { background: #111827; border-bottom-color: #374151; }
  .panel header button {
    background: #1f2937;
    border-color: #4b5563;
    color: #f3f4f6;
  }
  .panel header button:hover { background: #374151; }
  th { background: #111827; color: #d1d5db; }
  th, td { border-bottom-color: #374151; }
  tbody tr:hover td { background: #374151; }
  .empty { color: #9ca3af; }
  .empty button {
    background: #1f2937;
    border-color: #4b5563;
    color: #f3f4f6;
  }
  td.scenario select {
    background: #1f2937;
    border-color: #4b5563;
    color: #f3f4f6;
  }
  .confirm {
    background: #7f1d1d;
    border-bottom-color: #991b1b;
    color: #fee2e2;
  }
  .confirm .no { background: #1f2937; border-color: #4b5563; color: #f3f4f6; }
}
`;

export interface PanelController {
  rerender: () => void;
  /**
   * Reference to the closed shadow root the panel was mounted into. Useful
   * for tests, which otherwise can't pierce the shadow boundary. Production
   * callers don't need this — destructure `{ rerender }` and ignore the rest.
   */
  shadowRoot: ShadowRoot;
}

export function mountPanel(hooks: PanelHooks): PanelController {
  const host = document.createElement('div');
  host.id = HOST_ID;
  document.body.appendChild(host);

  const shadow = host.attachShadow({ mode: 'closed' });

  const style = document.createElement('style');
  style.textContent = CSS;
  shadow.appendChild(style);

  const launcher = document.createElement('button');
  launcher.type = 'button';
  launcher.className = 'launcher';
  shadow.appendChild(launcher);

  const panel = document.createElement('aside');
  panel.className = 'panel';
  panel.dataset['open'] = 'false';
  panel.innerHTML = `
    <header>
      <h2>apitemkin · scenarios</h2>
      <button type="button" data-action="refresh">Refresh</button>
      <button type="button" data-action="reset">Reset all</button>
      <button type="button" data-action="close" aria-label="Close">×</button>
    </header>
    <div class="content"></div>
  `;
  shadow.appendChild(panel);

  const content = panel.querySelector('.content') as HTMLDivElement;
  const refreshBtn = panel.querySelector(
    '[data-action="refresh"]',
  ) as HTMLButtonElement;
  const resetBtn = panel.querySelector(
    '[data-action="reset"]',
  ) as HTMLButtonElement;
  const closeBtn = panel.querySelector(
    '[data-action="close"]',
  ) as HTMLButtonElement;

  let confirmingReset = false;

  launcher.addEventListener('click', () => togglePanel());
  closeBtn.addEventListener('click', () => setOpen(false));
  refreshBtn.addEventListener('click', async () => {
    refreshBtn.disabled = true;
    refreshBtn.textContent = '…';
    try {
      await hooks.refresh();
    } finally {
      refreshBtn.disabled = false;
      refreshBtn.textContent = 'Refresh';
      rerender();
    }
  });
  resetBtn.addEventListener('click', () => {
    if (Object.keys(hooks.state).length === 0) return;
    confirmingReset = true;
    rerender();
  });

  function togglePanel(): void {
    setOpen(panel.dataset['open'] !== 'true');
  }
  function setOpen(open: boolean): void {
    panel.dataset['open'] = open ? 'true' : 'false';
    if (!open) confirmingReset = false;
  }

  function rerender(): void {
    updateLauncher();
    renderConfirm();
    renderContent();
  }

  function updateLauncher(): void {
    const count = Object.keys(hooks.state).length;
    launcher.textContent = '';
    launcher.appendChild(document.createTextNode('apitemkin'));
    if (count > 0) {
      const badge = document.createElement('span');
      badge.className = 'badge';
      badge.textContent = String(count);
      launcher.appendChild(badge);
    }
  }

  function renderConfirm(): void {
    const existing = panel.querySelector('.confirm');
    if (existing) existing.remove();
    if (!confirmingReset) return;
    const bar = document.createElement('div');
    bar.className = 'confirm';
    bar.innerHTML = `
      <span>Clear all scenario selections?</span>
      <button type="button" class="yes">Clear</button>
      <button type="button" class="no">Cancel</button>
    `;
    bar.querySelector('.yes')!.addEventListener('click', () => {
      for (const k of Object.keys(hooks.state)) delete hooks.state[k];
      hooks.onChange();
      confirmingReset = false;
      rerender();
    });
    bar.querySelector('.no')!.addEventListener('click', () => {
      confirmingReset = false;
      rerender();
    });
    panel.insertBefore(bar, content);
  }

  function renderContent(): void {
    content.textContent = '';
    const status = hooks.getStatus();

    if (status === 'loading') {
      content.appendChild(emptyState('Loading routes…'));
      return;
    }
    if (status === 'error') {
      const msg = hooks.getError() ?? 'unknown error';
      content.appendChild(
        emptyState(
          `Discovery endpoint unreachable (${msg}). Is vite-plugin-apitemkin enabled?`,
          'Retry',
        ),
      );
      return;
    }
    const routes = [...hooks.getRoutes()].sort((a, b) => {
      const u = a.url.localeCompare(b.url);
      return u !== 0 ? u : a.method.localeCompare(b.method);
    });
    if (routes.length === 0) {
      content.appendChild(
        emptyState('No mocks discovered. Add one in mocks/ and click Refresh.'),
      );
      return;
    }
    content.appendChild(renderTable(routes));
  }

  function emptyState(message: string, retryLabel?: string): HTMLDivElement {
    const div = document.createElement('div');
    div.className = 'empty';
    div.appendChild(document.createTextNode(message));
    if (retryLabel) {
      div.appendChild(document.createElement('br'));
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = retryLabel;
      btn.addEventListener('click', () => refreshBtn.click());
      div.appendChild(btn);
    }
    return div;
  }

  function renderTable(routes: readonly RouteEntry[]): HTMLTableElement {
    const table = document.createElement('table');
    const thead = document.createElement('thead');
    thead.innerHTML = `
      <tr>
        <th>Method</th>
        <th>URL</th>
        <th>Scenario</th>
        <th></th>
      </tr>
    `;
    table.appendChild(thead);
    const tbody = document.createElement('tbody');
    for (const route of routes) tbody.appendChild(renderRow(route));
    table.appendChild(tbody);
    return table;
  }

  function renderRow(route: RouteEntry): HTMLTableRowElement {
    const tr = document.createElement('tr');

    const methodCell = document.createElement('td');
    const pill = document.createElement('span');
    const method = route.method.toUpperCase();
    pill.className = `pill pill-${pillClass(method)}`;
    pill.textContent = method;
    methodCell.appendChild(pill);
    tr.appendChild(methodCell);

    const urlCell = document.createElement('td');
    urlCell.className = 'url';
    urlCell.textContent = route.url;
    tr.appendChild(urlCell);

    const scenarioCell = document.createElement('td');
    scenarioCell.className = 'scenario';
    const scenarios = route.scenarios ?? [];
    if (scenarios.length === 0) {
      scenarioCell.classList.add('na');
      scenarioCell.textContent = '—';
    } else {
      const select = document.createElement('select');
      const key = selectionKey(method, route.url);
      const current = hooks.state[key] ?? 'default';
      const names = scenarios.includes('default')
        ? ['default', ...scenarios.filter((s) => s !== 'default')]
        : ['default', ...scenarios];
      for (const name of names) {
        const opt = document.createElement('option');
        opt.value = name;
        opt.textContent = name;
        select.appendChild(opt);
      }
      // Set the live value AFTER all options are appended — relying on
      // `option.selected = true` is brittle across DOM implementations.
      select.value = current;
      select.addEventListener('change', () => {
        const value = select.value;
        if (value === 'default') {
          delete hooks.state[key];
        } else {
          hooks.state[key] = value;
        }
        hooks.onChange();
        rerender();
      });
      scenarioCell.appendChild(select);
    }
    tr.appendChild(scenarioCell);

    const activeCell = document.createElement('td');
    activeCell.className = 'active';
    const key = selectionKey(method, route.url);
    if (hooks.state[key]) {
      const dot = document.createElement('span');
      dot.className = 'dot';
      activeCell.appendChild(dot);
    }
    tr.appendChild(activeCell);

    return tr;
  }

  rerender();
  return { rerender, shadowRoot: shadow };
}

function pillClass(method: string): string {
  switch (method) {
    case 'GET':
    case 'POST':
    case 'PUT':
    case 'PATCH':
    case 'DELETE':
      return method;
    default:
      return 'OTHER';
  }
}
