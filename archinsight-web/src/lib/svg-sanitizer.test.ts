import { describe, expect, test } from 'vitest';
import { sanitizeSvg } from './svg-sanitizer';

describe('sanitizeSvg', () => {
  test('removes executable and embedded foreign content', () => {
    const sanitized = sanitizeSvg(`
      <svg xmlns="http://www.w3.org/2000/svg" width="120" height="80" onload="alert(1)">
        <script>alert(1)</script>
        <foreignObject width="120" height="80"><body>html</body></foreignObject>
        <rect width="10" height="10" onclick="alert(2)" fill="red"/>
      </svg>
    `);

    expect(sanitized).not.toContain('<script');
    expect(sanitized).not.toContain('foreignObject');
    expect(sanitized).not.toContain('onload');
    expect(sanitized).not.toContain('onclick');
    expect(sanitized).toContain('<rect');
  });

  test('removes external links and keeps insight goto links', () => {
    const sanitized = sanitizeSvg(`
      <svg xmlns="http://www.w3.org/2000/svg">
        <a href="https://attacker.example/"><text>external</text></a>
        <a href="insight://goto?source=app.ai&amp;line=2&amp;column=1"><text>goto</text></a>
      </svg>
    `);

    expect(sanitized).not.toContain('https://attacker.example/');
    expect(sanitized).toContain('insight://goto?source=app.ai');
  });

  test('keeps local marker references and removes external css urls', () => {
    const sanitized = sanitizeSvg(`
      <svg xmlns="http://www.w3.org/2000/svg">
        <defs>
          <marker id="arrow"><path d="M 0 0 L 10 5 L 0 10 z"/></marker>
        </defs>
        <path d="M 0 0 L 10 10" marker-end="url(#arrow)"/>
        <rect width="10" height="10" fill="url(https://attacker.example/fill.svg#x)"/>
      </svg>
    `);

    expect(sanitized).toContain('marker-end="url(#arrow)"');
    expect(sanitized).not.toContain('https://attacker.example');
    expect(sanitized).not.toContain('fill="url(');
  });

  test('rejects non-svg markup', () => {
    expect(sanitizeSvg('<html><body>not svg</body></html>')).toBe('');
  });
});
