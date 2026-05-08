// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mountPanel, type PanelHooks } from '../src/devtools/ui.js';
import { selectionKey, type SelectionMap } from '../src/devtools/state.js';
import type { RouteEntry } from '../src/devtools/match.js';

const ORDERS: RouteEntry = {
  method: 'GET',
  url: '/api/orders',
  kind: 'code',
  scenarios: ['default', 'empty', 'error'],
};
const PROFILE: RouteEntry = {
  method: 'GET',
  url: '/api/profile',
  kind: 'code',
  scenarios: ['default', 'darkMode', 'unverified'],
};
const HEALTH: RouteEntry = {
  method: 'GET',
  url: '/api/healthcheck',
  kind: 'json',
  scenarios: [],
};

interface TestRig {
  state: SelectionMap;
  routes: RouteEntry[];
  status: 'loading' | 'ok' | 'empty' | 'error';
  error: string | null;
  refresh: ReturnType<typeof vi.fn>;
  onChange: ReturnType<typeof vi.fn>;
  hooks: PanelHooks;
}

function rig(overrides: Partial<Omit<TestRig, 'hooks' | 'refresh' | 'onChange'>> = {}): TestRig {
  const state: SelectionMap = overrides.state ?? {};
  const routes: RouteEntry[] = overrides.routes ?? [];
  const partial = {
    state,
    routes,
    status: overrides.status ?? ('ok' as const),
    error: overrides.error ?? null,
    refresh: vi.fn(() => Promise.resolve()),
    onChange: vi.fn(),
  };
  const hooks: PanelHooks = {
    state: partial.state,
    getRoutes: () => partial.routes,
    getStatus: () => partial.status,
    getError: () => partial.error,
    refresh: partial.refresh,
    onChange: partial.onChange,
  };
  return { ...partial, hooks };
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('mountPanel — host + launcher', () => {
  it('appends a host <div id="apitemkin-devtools-host"> to <body>', () => {
    const ctl = mountPanel(rig().hooks);
    const host = document.getElementById('apitemkin-devtools-host');
    expect(host).not.toBeNull();
    expect(host?.parentElement).toBe(document.body);
    expect(ctl.shadowRoot).toBeTruthy();
  });

  it('returns a shadow-root reference even though the root is closed', () => {
    const ctl = mountPanel(rig().hooks);
    const host = document.getElementById('apitemkin-devtools-host')!;
    // Closed shadow roots are NOT exposed via the host's `.shadowRoot`
    // property — the only handle is the one we return on the controller.
    expect(host.shadowRoot).toBeNull();
    expect(ctl.shadowRoot.querySelector('.launcher')).not.toBeNull();
  });

  it('renders the launcher with text "apitemkin" when no selections are set', () => {
    const ctl = mountPanel(rig().hooks);
    const launcher = ctl.shadowRoot.querySelector('.launcher')!;
    expect(launcher.textContent).toBe('apitemkin');
    expect(launcher.querySelector('.badge')).toBeNull();
  });

  it('renders an N-badge on the launcher when N selections are set', () => {
    const ctl = mountPanel(
      rig({
        state: {
          [selectionKey('GET', '/api/orders')]: 'error',
          [selectionKey('GET', '/api/profile')]: 'darkMode',
        },
      }).hooks,
    );
    const launcher = ctl.shadowRoot.querySelector('.launcher')!;
    expect(launcher.textContent).toContain('apitemkin');
    const badge = launcher.querySelector('.badge');
    expect(badge?.textContent).toBe('2');
  });
});

describe('mountPanel — open/close', () => {
  it('panel is closed initially', () => {
    const ctl = mountPanel(rig().hooks);
    const panel = ctl.shadowRoot.querySelector<HTMLElement>('.panel')!;
    expect(panel.dataset['open']).toBe('false');
  });

  it('clicking the launcher toggles the panel open and closed', () => {
    const ctl = mountPanel(rig().hooks);
    const launcher = ctl.shadowRoot.querySelector<HTMLButtonElement>('.launcher')!;
    const panel = ctl.shadowRoot.querySelector<HTMLElement>('.panel')!;
    launcher.click();
    expect(panel.dataset['open']).toBe('true');
    launcher.click();
    expect(panel.dataset['open']).toBe('false');
  });

  it('clicking the close button closes the panel', () => {
    const ctl = mountPanel(rig().hooks);
    const launcher = ctl.shadowRoot.querySelector<HTMLButtonElement>('.launcher')!;
    const close = ctl.shadowRoot.querySelector<HTMLButtonElement>(
      '[data-action="close"]',
    )!;
    const panel = ctl.shadowRoot.querySelector<HTMLElement>('.panel')!;
    launcher.click();
    expect(panel.dataset['open']).toBe('true');
    close.click();
    expect(panel.dataset['open']).toBe('false');
  });
});

describe('mountPanel — discovery states', () => {
  it('shows a "Loading routes" empty state when status is loading', () => {
    const ctl = mountPanel(rig({ status: 'loading' }).hooks);
    const empty = ctl.shadowRoot.querySelector('.empty');
    expect(empty?.textContent ?? '').toMatch(/Loading/);
  });

  it('shows the discovery error and a Retry button when status is error', () => {
    const r = rig({ status: 'error', error: 'HTTP 500' });
    const ctl = mountPanel(r.hooks);
    const empty = ctl.shadowRoot.querySelector('.empty');
    expect(empty?.textContent ?? '').toContain('HTTP 500');
    expect(empty?.textContent ?? '').toMatch(/Discovery endpoint unreachable/);
    const retry = empty?.querySelector('button');
    expect(retry).not.toBeNull();
    retry!.click();
    expect(r.refresh).toHaveBeenCalledOnce();
  });

  it('shows "No mocks discovered" when the route list is empty', () => {
    const ctl = mountPanel(rig({ status: 'empty', routes: [] }).hooks);
    const empty = ctl.shadowRoot.querySelector('.empty');
    expect(empty?.textContent ?? '').toMatch(/No mocks discovered/);
  });
});

describe('mountPanel — route table', () => {
  it('renders one row per route, sorted by URL then method', () => {
    const ctl = mountPanel(
      rig({ routes: [PROFILE, HEALTH, ORDERS] }).hooks,
    );
    const rows = ctl.shadowRoot.querySelectorAll('tbody tr');
    expect(rows).toHaveLength(3);
    const urls = [...rows].map((r) => r.querySelector('.url')?.textContent);
    expect(urls).toEqual(['/api/healthcheck', '/api/orders', '/api/profile']);
  });

  it('renders an em-dash and no <select> for routes without scenarios', () => {
    const ctl = mountPanel(rig({ routes: [HEALTH] }).hooks);
    const cell = ctl.shadowRoot.querySelector<HTMLElement>('td.scenario')!;
    expect(cell.classList.contains('na')).toBe(true);
    expect(cell.textContent).toBe('—');
    expect(cell.querySelector('select')).toBeNull();
  });

  it('renders a <select> with default first for scenario routes', () => {
    const ctl = mountPanel(rig({ routes: [ORDERS] }).hooks);
    const select = ctl.shadowRoot.querySelector<HTMLSelectElement>(
      'td.scenario select',
    )!;
    const optionValues = [...select.options].map((o) => o.value);
    expect(optionValues[0]).toBe('default');
    expect(optionValues).toEqual(
      expect.arrayContaining(['default', 'empty', 'error']),
    );
    expect(select.value).toBe('default');
  });

  it('shows the active dot on rows whose key is in state', () => {
    const ctl = mountPanel(
      rig({
        routes: [ORDERS, PROFILE],
        state: { [selectionKey('GET', '/api/orders')]: 'error' },
      }).hooks,
    );
    const rows = ctl.shadowRoot.querySelectorAll('tbody tr');
    const ordersRow = [...rows].find(
      (r) => r.querySelector('.url')?.textContent === '/api/orders',
    )!;
    const profileRow = [...rows].find(
      (r) => r.querySelector('.url')?.textContent === '/api/profile',
    )!;
    expect(ordersRow.querySelector('.dot')).not.toBeNull();
    expect(profileRow.querySelector('.dot')).toBeNull();
  });
});

describe('mountPanel — selection mutations', () => {
  function changeSelect(
    select: HTMLSelectElement,
    value: string,
  ): void {
    select.value = value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
  }

  it('changing the select to a non-default value writes state and fires onChange', () => {
    const r = rig({ routes: [ORDERS] });
    const ctl = mountPanel(r.hooks);
    const select = ctl.shadowRoot.querySelector<HTMLSelectElement>(
      'td.scenario select',
    )!;
    changeSelect(select, 'error');
    expect(r.state).toEqual({ [selectionKey('GET', '/api/orders')]: 'error' });
    expect(r.onChange).toHaveBeenCalledOnce();
    // active dot appears after the rerender
    expect(ctl.shadowRoot.querySelector('.dot')).not.toBeNull();
    // launcher badge updates
    expect(ctl.shadowRoot.querySelector('.launcher .badge')?.textContent).toBe(
      '1',
    );
  });

  it('selecting "default" deletes the key and fires onChange', () => {
    const r = rig({
      routes: [ORDERS],
      state: { [selectionKey('GET', '/api/orders')]: 'error' },
    });
    const ctl = mountPanel(r.hooks);
    const select = ctl.shadowRoot.querySelector<HTMLSelectElement>(
      'td.scenario select',
    )!;
    expect(select.value).toBe('error');
    changeSelect(select, 'default');
    expect(r.state).toEqual({});
    expect(r.onChange).toHaveBeenCalledOnce();
    expect(ctl.shadowRoot.querySelector('.dot')).toBeNull();
    expect(ctl.shadowRoot.querySelector('.launcher .badge')).toBeNull();
  });
});

describe('mountPanel — Reset all flow', () => {
  it('Reset all is a no-op when state is empty', () => {
    const r = rig({ routes: [ORDERS] });
    const ctl = mountPanel(r.hooks);
    const reset = ctl.shadowRoot.querySelector<HTMLButtonElement>(
      '[data-action="reset"]',
    )!;
    reset.click();
    expect(ctl.shadowRoot.querySelector('.confirm')).toBeNull();
    expect(r.onChange).not.toHaveBeenCalled();
  });

  it('Reset all opens an inline confirmation; "Clear" wipes state and fires onChange', () => {
    const r = rig({
      routes: [ORDERS, PROFILE],
      state: {
        [selectionKey('GET', '/api/orders')]: 'error',
        [selectionKey('GET', '/api/profile')]: 'darkMode',
      },
    });
    const ctl = mountPanel(r.hooks);
    const reset = ctl.shadowRoot.querySelector<HTMLButtonElement>(
      '[data-action="reset"]',
    )!;
    reset.click();
    const confirm = ctl.shadowRoot.querySelector('.confirm');
    expect(confirm).not.toBeNull();
    const yes = confirm!.querySelector<HTMLButtonElement>('.yes')!;
    yes.click();
    expect(r.state).toEqual({});
    expect(r.onChange).toHaveBeenCalledOnce();
    expect(ctl.shadowRoot.querySelector('.confirm')).toBeNull();
    expect(ctl.shadowRoot.querySelector('.launcher .badge')).toBeNull();
  });

  it('"Cancel" leaves state untouched', () => {
    const r = rig({
      routes: [ORDERS],
      state: { [selectionKey('GET', '/api/orders')]: 'error' },
    });
    const ctl = mountPanel(r.hooks);
    const reset = ctl.shadowRoot.querySelector<HTMLButtonElement>(
      '[data-action="reset"]',
    )!;
    reset.click();
    const no = ctl.shadowRoot.querySelector<HTMLButtonElement>(
      '.confirm .no',
    )!;
    no.click();
    expect(r.state).toEqual({
      [selectionKey('GET', '/api/orders')]: 'error',
    });
    expect(r.onChange).not.toHaveBeenCalled();
    expect(ctl.shadowRoot.querySelector('.confirm')).toBeNull();
  });
});

describe('mountPanel — Refresh button', () => {
  it('disables itself + shows ellipsis while in flight, then restores', async () => {
    let resolveRefresh!: () => void;
    const refreshPromise = new Promise<void>((resolve) => {
      resolveRefresh = resolve;
    });
    const r = rig({ routes: [ORDERS] });
    r.refresh.mockImplementationOnce(() => refreshPromise);
    const ctl = mountPanel(r.hooks);
    const refresh = ctl.shadowRoot.querySelector<HTMLButtonElement>(
      '[data-action="refresh"]',
    )!;
    refresh.click();
    // flush the click handler's synchronous prelude (disables + retext)
    await Promise.resolve();
    expect(refresh.disabled).toBe(true);
    expect(refresh.textContent).toBe('…');
    resolveRefresh();
    await refreshPromise;
    // flush the finally-block microtask
    await Promise.resolve();
    await Promise.resolve();
    expect(refresh.disabled).toBe(false);
    expect(refresh.textContent).toBe('Refresh');
    expect(r.refresh).toHaveBeenCalledOnce();
  });
});
