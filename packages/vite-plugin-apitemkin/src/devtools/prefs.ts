// Persisted overlay UI preferences (launcher corner, panel width).
// Separate key from the scenario selections. Never throws: storage can be
// disabled (privacy mode) or full.

export type Corner = 'br' | 'bl' | 'tr' | 'tl';
export type Theme = 'auto' | 'light' | 'dark';

export interface UiPrefs {
  corner: Corner;
  width: number;
  /** 'auto' follows the OS setting; light/dark are the user's manual choice. */
  theme: Theme;
}

export const PREFS_KEY = 'apitemkin:ui';
export const MIN_WIDTH = 400;
export const MAX_WIDTH = 720;
export const DEFAULT_PREFS: UiPrefs = { corner: 'br', width: 440, theme: 'auto' };

const CORNERS: readonly Corner[] = ['br', 'bl', 'tr', 'tl'];
export const THEMES: readonly Theme[] = ['auto', 'light', 'dark'];

export function clampWidth(px: number): number {
  if (!Number.isFinite(px)) return DEFAULT_PREFS.width;
  return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Math.round(px)));
}

export function loadPrefs(storage: Storage | null): UiPrefs {
  try {
    const raw = storage?.getItem(PREFS_KEY);
    if (!raw) return { ...DEFAULT_PREFS };
    const parsed = JSON.parse(raw) as Partial<UiPrefs> | null;
    const corner = CORNERS.includes(parsed?.corner as Corner)
      ? (parsed!.corner as Corner)
      : DEFAULT_PREFS.corner;
    const width =
      typeof parsed?.width === 'number' ? clampWidth(parsed.width) : DEFAULT_PREFS.width;
    const theme = THEMES.includes(parsed?.theme as Theme) ? (parsed!.theme as Theme) : DEFAULT_PREFS.theme;
    return { corner, width, theme };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function savePrefs(storage: Storage | null, prefs: UiPrefs): void {
  try {
    storage?.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // disabled / quota — keep the in-memory value only
  }
}
