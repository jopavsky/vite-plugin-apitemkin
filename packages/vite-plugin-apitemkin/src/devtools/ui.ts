// Shell of the apitemkin dev-tools overlay: launcher, panel frame, header,
// footer, discovery states, live region and the global shortcut. Renders
// into a closed shadow root so host CSS can't reach in (or out).
//
// State is owned by the bootstrap (client.ts); this module reads it through
// PanelHooks, mutates selections in place and calls onChange to persist.

import css from './styles.css?inline';
import type { RouteEntry } from './match.js';
import type { SelectionMap } from './state.js';
import type { Activity } from './activity.js';
import { launcherContent, overriddenKeys, type CollectionInfo } from './model.js';
import { clampWidth, loadPrefs, savePrefs, THEMES, type Corner, type UiPrefs } from './prefs.js';
import { mountGrip, syncGrip } from './grip.js';
import { h, icon, ICON, isMac, isTextField } from './dom.js';
import { createList } from './list.js';

export type DiscoveryStatus = 'loading' | 'ok' | 'empty' | 'error';

export interface PanelHooks {
  /** Live selection map. Mutated in place. */
  state: SelectionMap;
  getRoutes: () => readonly RouteEntry[];
  getStatus: () => DiscoveryStatus;
  getError: () => string | null;
  /** Re-run discovery; resolves when the panel can re-render. */
  refresh: () => Promise<void>;
  /** Persist `state` after the panel mutates it. */
  onChange: () => void;
  activity: Activity;
  origin: string;
  storage: Storage | null;
  // ---- collections (1.5); optional so a panel without them behaves as in 1.4 ----
  getCollections?: () => readonly CollectionInfo[];
  /** The server's urlPrefix; undefined means unknown, so the list infers it. */
  getUrlPrefix?: () => string | undefined;
  /** Reset one collection to its seed; resolves once the count is updated. */
  resetCollection?: (file: string, name: string) => Promise<void>;
  /** Reload the counts. Called when the panel opens. */
  refreshCollections?: () => Promise<void>;
}

export interface PanelController {
  rerender: () => void;
  /** The closed shadow root (tests can't pierce it otherwise). */
  shadowRoot: ShadowRoot;
  open: () => void;
  close: () => void;
  announce: (text: string) => void;
}

const HOST_ID = 'apitemkin-devtools-host';

const reducedMotion = (): boolean =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export function mountPanel(hooks: PanelHooks): PanelController {
  const host = h('div', { id: HOST_ID });
  document.body.appendChild(host);
  const shadow = host.attachShadow({ mode: 'closed' });
  shadow.append(h('style', {}, css));

  const prefs: UiPrefs = loadPrefs(hooks.storage);
  let confirming = false;
  let onlyOverridden = false;
  let refreshing = false;

  // ---------- launcher ----------
  const chip = h('span', { class: 'chip', 'data-part': 'launcher-chip', hidden: true });
  const launcher = h(
    'button',
    {
      type: 'button',
      class: 'launch',
      'data-part': 'launcher',
      'data-corner': prefs.corner,
      'aria-description': 'Alt+Shift+arrow keys move it to another corner',
    },
    h('span', { class: 'brand' }, 'apitemkin'),
    chip,
  );

  // ---------- panel ----------
  const refreshBtn = h('button', { type: 'button', class: 'hb', 'data-part': 'refresh' }, 'Rescan mocks');
  const themeBtn = h('button', { type: 'button', class: 'hb x', 'data-part': 'theme' });
  const closeBtn = h(
    'button',
    { type: 'button', class: 'hb x', 'data-part': 'close', 'aria-label': 'Close panel' },
    icon(ICON.close),
  );
  const body = h('div', { class: 'body', 'data-part': 'body', tabindex: '-1' });
  const footer = h('div', { class: 'foot', 'data-part': 'footer' });
  const live = h('div', { class: 'sr', 'data-part': 'live', 'aria-live': 'polite' });
  const panel = h(
    'aside',
    {
      class: 'panel',
      id: 'apitemkin-panel',
      'data-part': 'panel',
      'data-corner': prefs.corner,
      role: 'dialog',
      'aria-label': 'apitemkin',
      // Focusable so a click on its chrome keeps focus (and Esc) inside.
      tabindex: '-1',
      hidden: true,
    },
    h('header', { class: 'head', 'data-part': 'header' }, h('h2', {}, 'apitemkin'), refreshBtn, themeBtn, closeBtn),
    body,
    footer,
    live,
  );
  const grip = mountGrip(panel, () => prefs, setWidth);
  panel.append(grip);
  applyWidth();
  shadow.append(launcher, panel);

  function applyWidth(): void {
    panel.style.width = `${prefs.width}px`;
    syncRenderedWidth();
  }

  // A small viewport squeezes the panel below its saved width (max-width);
  // the narrow layout and the grip's spoken value follow what is rendered.
  // The panel hugs its content and is docked to a corner, so filtering would
  // make it jump (a bottom-docked header drops ~220px on "no results"). While
  // a search or the overridden filter is active, keep the height it had.
  function holdHeight(active: boolean): void {
    if (!active) {
      panel.style.removeProperty('--hold');
    } else if (!panel.style.getPropertyValue('--hold')) {
      // CSS caps the hold at the viewport (min() with the max-height), so a
      // shrinking window never pushes the header off-screen.
      const px = Math.round(panel.getBoundingClientRect().height);
      if (px > 0) panel.style.setProperty('--hold', `${px}px`);
    }
  }

  function syncRenderedWidth(): void {
    const w = Math.round(panel.getBoundingClientRect().width) || prefs.width;
    panel.classList.toggle('narrow', w < 440);
    syncGrip(grip, w);
  }
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(syncRenderedWidth).observe(panel);

  function setWidth(px: number): void {
    prefs.width = clampWidth(px);
    applyWidth();
    savePrefs(hooks.storage, prefs);
  }

  // Theme: 'auto' follows the OS; a manual choice sets data-theme on the host.
  function applyTheme(): void {
    if (prefs.theme === 'auto') host.removeAttribute('data-theme');
    else host.setAttribute('data-theme', prefs.theme);
    const label = `Theme: ${prefs.theme}${prefs.theme === 'auto' ? ' (follows system)' : ''}. Change theme`;
    themeBtn.setAttribute('aria-label', label);
    themeBtn.title = label;
    themeBtn.replaceChildren(icon(ICON[prefs.theme]));
  }
  applyTheme();
  themeBtn.addEventListener('click', () => {
    prefs.theme = THEMES[(THEMES.indexOf(prefs.theme) + 1) % THEMES.length]!;
    applyTheme();
    savePrefs(hooks.storage, prefs);
  });

  function setCorner(corner: Corner): void {
    prefs.corner = corner;
    launcher.dataset['corner'] = corner;
    panel.dataset['corner'] = corner;
    savePrefs(hooks.storage, prefs);
  }

  const list = createList(hooks, {
    shadowRoot: shadow,
    announce,
    rerender: () => rerender(),
    holdHeight: (searching) => holdHeight(searching || onlyOverridden),
  });
  const focusInside = (): void => {
    if (hooks.getStatus() === 'ok' && (list.focusSearch() || (list.focusFirst(), true))) return;
    body.focus();
  };

  // ---------- open / close ----------
  function open(): void {
    if (!panel.hidden) return;
    launcher.hidden = true;
    panel.hidden = false;
    if (!reducedMotion()) {
      panel.dataset['anim'] = 'grow';
      setTimeout(() => delete panel.dataset['anim'], 200);
    }
    rerender();
    focusInside();
    // Counts may have moved while the panel was closed (requests from outside the page, file saves).
    void hooks.refreshCollections?.().then(() => {
      if (!panel.hidden) rerender();
    });
  }

  function close(): void {
    if (panel.hidden) return;
    confirming = false;
    panel.hidden = true;
    launcher.hidden = false;
    rerender();
    launcher.focus();
  }

  const toggle = (): void => (panel.hidden ? open() : close());

  // Move the launcher: Alt+Shift+arrows, or drag (more than 8px) and it
  // snaps to the nearest corner. A plain click still opens the panel.
  launcher.addEventListener('keydown', (e) => {
    if (!e.altKey || !e.shiftKey) return;
    const [v, hz] = prefs.corner.split('') as ['b' | 't', 'r' | 'l'];
    const next =
      e.key === 'ArrowUp' ? `t${hz}` : e.key === 'ArrowDown' ? `b${hz}` :
      e.key === 'ArrowLeft' ? `${v}l` : e.key === 'ArrowRight' ? `${v}r` : null;
    if (!next) return;
    e.preventDefault();
    setCorner(next as Corner);
  });
  let downAt: { x: number; y: number } | null = null;
  let dragged = false;
  launcher.addEventListener('pointerdown', (e) => {
    downAt = { x: e.clientX, y: e.clientY };
    dragged = false;
    // Keep move/up events once the pointer leaves the 40px pill.
    launcher.setPointerCapture?.(e.pointerId);
  });
  launcher.addEventListener('pointermove', (e) => {
    if (downAt && Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 8) dragged = true;
  });
  launcher.addEventListener('pointerup', (e) => {
    if (dragged) {
      const v = e.clientY < innerHeight / 2 ? 't' : 'b';
      const hz = e.clientX < innerWidth / 2 ? 'l' : 'r';
      setCorner(`${v}${hz}` as Corner);
    }
    downAt = null;
    launcher.releasePointerCapture?.(e.pointerId);
  });
  launcher.addEventListener('pointercancel', () => {
    downAt = null;
    dragged = false;
  });
  launcher.addEventListener('click', (e) => {
    if (dragged) {
      dragged = false;
      e.preventDefault();
      return;
    }
    open();
  });
  closeBtn.addEventListener('click', close);

  // The only listener on the host page: Alt+Shift+M. Match the physical
  // key, because Option+Shift+M on macOS produces event.key "Â".
  window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyM' && e.altKey && e.shiftKey && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      toggle();
    }
  });

  // Escape closes the innermost thing first.
  panel.addEventListener('keydown', (e) => {
    if (e.key === '/' && !isTextField(e.target) && list.focusSearch()) {
      e.preventDefault();
      return;
    }
    if (e.key !== 'Escape' || e.defaultPrevented) return;
    e.preventDefault();
    if (confirming) {
      confirming = false;
      renderFooter();
      footer.querySelector<HTMLElement>('[data-part="reset"]')?.focus();
      return;
    }
    close();
  });

  refreshBtn.addEventListener('click', () => {
    refreshing = true;
    renderHeader();
    void hooks.refresh().finally(() => {
      refreshing = false;
      rerender();
    });
  });

  // ---------- rendering ----------
  function announce(text: string): void {
    live.textContent = text;
  }

  function renderLauncher(): void {
    const { chip: label, accessibleName } = launcherContent(hooks.state, hooks.getRoutes());
    launcher.setAttribute('aria-label', accessibleName);
    launcher.classList.toggle('n', label !== null);
    chip.hidden = label === null;
    chip.textContent = label ?? '';
  }

  function renderHeader(): void {
    const busy = refreshing || hooks.getStatus() === 'loading';
    refreshBtn.disabled = busy;
    if (refreshing) refreshBtn.setAttribute('aria-busy', 'true');
    else refreshBtn.removeAttribute('aria-busy');
  }

  function renderBody(): void {
    const status = hooks.getStatus();
    if (status === 'ok') {
      if (list.el.parentNode !== body) body.replaceChildren(list.el);
      list.update({ onlyOverridden });
      return;
    }
    body.textContent = '';
    if (status === 'loading') {
      body.append(
        h(
          'div',
          { class: 'state', 'data-part': 'state', 'data-state': 'loading' },
          h('span', { class: 'sr' }, 'Loading routes…'),
          h('div', { class: 'skel' }),
          h('div', { class: 'skel' }),
          h('div', { class: 'skel' }),
        ),
      );
    } else if (status === 'error') {
      const retry = h('button', { type: 'button', class: 'fb', 'data-part': 'retry' }, 'Retry');
      retry.addEventListener('click', () => refreshBtn.click());
      body.append(
        h(
          'div',
          { class: 'state empty', 'data-part': 'state', 'data-state': 'error', role: 'alert' },
          h('h3', { class: 'bad' }, icon(ICON.alert), "Couldn't load routes"),
          h('p', { class: 'detail' }, `GET /_apitemkin/scenarios · ${hooks.getError() ?? 'unknown error'}`),
          h('p', {}, "The dev server isn't answering. Check that vite is still running, then retry."),
          retry,
        ),
      );
    } else if (status === 'empty') {
      body.append(
        h(
          'div',
          { class: 'state empty', 'data-part': 'state', 'data-state': 'empty' },
          h('h3', {}, 'No mocks yet. The village is empty.'),
          h('p', {}, 'Add ', h('code', {}, 'mocks/hello.json'), ' → ', h('code', {}, 'GET /api/hello'), '.'),
        ),
      );
    }
  }

  function renderFooter(): void {
    footer.textContent = '';
    const routes = hooks.getRoutes();
    const count = overriddenKeys(hooks.state, routes).length;
    if (count === 0) onlyOverridden = false;

    if (confirming && count > 0) {
      const yes = h('button', { type: 'button', class: 'fb', 'data-part': 'reset-yes' }, 'Reset');
      const cancel = h('button', { type: 'button', class: 'fb', 'data-part': 'reset-cancel' }, 'Cancel');
      yes.addEventListener('click', () => {
        const cleared = Object.keys(hooks.state);
        for (const k of cleared) delete hooks.state[k];
        hooks.onChange();
        confirming = false;
        rerender();
        announce(`${count} ${count === 1 ? 'route' : 'routes'} reset to default`);
        if (!list.focusSearch()) body.focus();
      });
      cancel.addEventListener('click', () => {
        confirming = false;
        renderFooter();
        footer.querySelector<HTMLElement>('[data-part="reset"]')?.focus();
      });
      footer.append(
        h(
          'div',
          { class: 'confirm', 'data-part': 'reset-confirm' },
          h('span', {}, `Reset ${count} ${count === 1 ? 'route' : 'routes'} to default?`),
          cancel,
          yes,
        ),
      );
      cancel.focus();
      return;
    }
    confirming = false;

    if (count > 0) {
      const filter = h(
        'button',
        { type: 'button', class: 'fb', 'data-part': 'filter' },
        onlyOverridden ? `Show all ${routes.length} routes` : `Show ${count} overridden`,
      );
      filter.classList.toggle('on', onlyOverridden);
      filter.addEventListener('click', () => {
        onlyOverridden = !onlyOverridden;
        holdHeight(onlyOverridden || list.hasQuery());
        rerender();
        footer.querySelector<HTMLElement>('[data-part="filter"]')?.focus();
      });
      footer.append(filter);
    } else {
      footer.append(h('span', { class: 'none' }, 'No overrides'));
    }

    const reset = h(
      'button',
      { type: 'button', class: 'fb', 'data-part': 'reset', disabled: count === 0 },
      'Reset scenarios',
    );
    reset.addEventListener('click', () => {
      confirming = true;
      renderFooter();
    });
    footer.append(reset, h('kbd', { 'data-part': 'kbd' }, isMac() ? '⌥⇧M' : 'Alt+Shift+M'));
  }

  function rerender(): void {
    // The filter has nothing to show once no route is overridden; clear it
    // before the body renders, or the list draws filtered to zero rows.
    if (overriddenKeys(hooks.state, hooks.getRoutes()).length === 0 && onlyOverridden) {
      onlyOverridden = false;
      holdHeight(list.hasQuery());
    }
    renderLauncher();
    renderHeader();
    renderBody();
    renderFooter();
  }

  rerender();
  return { rerender, shadowRoot: shadow, open, close, announce };
}
