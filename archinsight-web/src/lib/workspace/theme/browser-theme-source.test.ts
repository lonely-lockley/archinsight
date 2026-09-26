// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { createBrowserThemeSource } from './browser-theme-source';

describe('browser theme source', () => {
  it('reads the initial preference, publishes changes, and unsubscribes', () => {
    let listener: (() => void) | undefined;
    const preference = {
      matches: true,
      addEventListener: vi.fn((_type: string, next: () => void) => { listener = next; }),
      removeEventListener: vi.fn()
    };
    const matchMedia = vi.fn(() => preference);
    const source = createBrowserThemeSource(matchMedia as unknown as typeof window.matchMedia);
    const changed = vi.fn();

    expect(matchMedia).toHaveBeenCalledWith('(prefers-color-scheme: dark)');
    expect(source.current()).toBe('dark');
    const unsubscribe = source.subscribe(changed);
    preference.matches = false;
    listener?.();
    expect(changed).toHaveBeenCalledWith('light');

    unsubscribe();
    expect(preference.removeEventListener).toHaveBeenCalledWith('change', listener);
  });
});
