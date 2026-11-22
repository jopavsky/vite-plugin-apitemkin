import { describe, it, expect } from 'vitest';
import { clampWidth, loadPrefs, savePrefs, PREFS_KEY } from '../src/devtools/prefs.js';

function memoryStorage(seed: Record<string, string> = {}): Storage {
  const m = new Map(Object.entries(seed));
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
    key: (i: number) => [...m.keys()][i] ?? null,
    get length() {
      return m.size;
    },
  } as Storage;
}

describe('prefs', () => {
  it('returns defaults when storage throws (privacy mode)', () => {
    const s = {
      getItem() {
        throw new Error('denied');
      },
      setItem() {
        throw new Error('denied');
      },
    } as unknown as Storage;
    expect(loadPrefs(s)).toEqual({ corner: 'br', width: 440, theme: 'auto' });
    expect(() => savePrefs(s, { corner: 'tl', width: 500, theme: 'auto' })).not.toThrow();
  });

  it('returns defaults when storage is null', () => {
    expect(loadPrefs(null)).toEqual({ corner: 'br', width: 440, theme: 'auto' });
  });

  it('clamps width to 400–720 and rejects bad corners', () => {
    const s = memoryStorage({ [PREFS_KEY]: JSON.stringify({ corner: 'xx', width: 9999 }) });
    expect(loadPrefs(s)).toEqual({ corner: 'br', width: 720, theme: 'auto' });
    expect(clampWidth(10)).toBe(400);
  });

  it('theme defaults to auto and rejects unknown values', () => {
    expect(loadPrefs(null).theme).toBe('auto');
    const s = memoryStorage({ [PREFS_KEY]: JSON.stringify({ corner: 'br', width: 440, theme: 'neon' }) });
    expect(loadPrefs(s).theme).toBe('auto');
    const t = memoryStorage({ [PREFS_KEY]: JSON.stringify({ corner: 'br', width: 440, theme: 'dark' }) });
    expect(loadPrefs(t).theme).toBe('dark');
  });

  it('round-trips through storage', () => {
    const s = memoryStorage();
    savePrefs(s, { corner: 'tl', width: 512, theme: 'light' });
    expect(loadPrefs(s)).toEqual({ corner: 'tl', width: 512, theme: 'light' });
  });
});
