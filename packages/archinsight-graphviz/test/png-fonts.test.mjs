import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { pngFonts } from '@archinsight/graphviz/png-fonts';

test('PNG font assets include the text faces and emoji fallback', () => {
  const fontFiles = pngFonts();
  assert.equal(new Set(fontFiles).size, 5);
  for (const path of fontFiles) assert.equal(readFileSync(path).readUInt32BE(), 0x00010000);
});

import { stylePngText, embedPngFonts } from '@archinsight/graphviz/png-text';

test('PNG styling preserves the text color, weight, escaped labels and joined emoji', async () => {
  const svg = '<svg><text fill="red" font-weight="bold" font-family="Times,serif">👩‍💻 Заказы &amp; HTTPS</text></svg>';
  const styled = stylePngText(svg);
  assert.match(styled, /<text fill="red" font-weight="bold" font-family="Carlito">/);
  assert.match(styled, /<tspan [^>]+>👩‍💻<\/tspan> Заказы &amp; HTTPS/);
  const loaded = [];
  const load = async face => { loaded.push(face); return 'data:font/woff2;base64,AA=='; };
  assert.equal(await embedPngFonts('<svg/>', load), '<svg/>');
  const withFonts = await embedPngFonts(svg, load);
  assert.match(withFonts, /<defs><style>@font-face/);
  assert(loaded.includes('NotoColorEmoji'));
  loaded.length = 0;
  await embedPngFonts('<svg><text>API</text></svg>', load);
  assert(!loaded.includes('NotoColorEmoji'));
});
