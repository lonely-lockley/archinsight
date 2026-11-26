import { describe, expect, it } from 'vitest';
import { prepareBrowserPng } from './png-fonts';

describe('standalone fonts for browser PNG export', () => {
  it('embeds Carlito and the color emoji face in a mixed Cyrillic label', async () => {
    const svg = await prepareBrowserPng('<svg><text font-weight="bold">👩‍💻 Клиент</text></svg>');
    expect(svg.match(/data:font\/woff2;base64,d09GMg/g)?.length).toBe(5);
    expect(svg).toContain('<text font-weight="bold" font-family="Carlito">');
    expect(svg).toContain('>👩‍💻</tspan> Клиент</text>');
  });

  it('omits the emoji font from a text-only diagram', async () => {
    const svg = await prepareBrowserPng('<svg><text>API</text></svg>');
    expect(svg.match(/data:font\/woff2;base64,d09GMg/g)?.length).toBe(4);
    expect(svg).not.toContain('Noto Color Emoji');
  });
});
