import type { RenderTheme } from '@insight/language';

export type ThemeSource = {
  current(): RenderTheme;
  subscribe(listener: (theme: RenderTheme) => void): () => void;
};

type MediaQueryListPort = Pick<MediaQueryList, 'matches' | 'addEventListener' | 'removeEventListener'>;

export function createBrowserThemeSource(
  matchMedia: (query: string) => MediaQueryListPort = defaultMatchMedia
): ThemeSource {
  const preference = matchMedia('(prefers-color-scheme: dark)');
  const selected = (): RenderTheme => preference.matches ? 'dark' : 'light';
  return {
    current: selected,
    subscribe(listener) {
      const changed = (): void => listener(selected());
      preference.addEventListener('change', changed);
      return () => preference.removeEventListener('change', changed);
    }
  };
}

function defaultMatchMedia(query: string): MediaQueryListPort {
  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    return window.matchMedia(query);
  }
  return {
    matches: false,
    addEventListener: () => undefined,
    removeEventListener: () => undefined
  };
}
