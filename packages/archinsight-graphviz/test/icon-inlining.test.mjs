import assert from 'node:assert/strict';
import test from 'node:test';
import { inlineGraphvizIcons } from '../src/index.js';

const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
<g id="a_node1_0"><a xlink:href="#slot-one" xlink:title=" ">
<polygon fill="none" stroke="none" points="2,-2 2,-42 42,-42 42,-2 2,-2"/>
<text x="20" y="-16"> </text></a></g></svg>`;

test('inlines a lazy icon asset using Graphviz slot geometry and removes navigation', async () => {
  const result = await inlineGraphvizIcons(svg, [{ slotId: 'slot-one', iconId: 'postgresql', color: '#f4f4f4' }]);
  assert.match(result, /<g id="slot-one" class="technology-icon" pointer-events="none">/);
  assert.match(result, /<svg[^>]*x="6" y="-38" width="32" height="32"[^>]*color="#f4f4f4"/);
  assert.doesNotMatch(result, /xlink:href|<text/);
  assert.match(result, /currentColor/);
});

test('keeps diagrams without placements byte-identical', async () => {
  assert.equal(await inlineGraphvizIcons(svg, []), svg);
  assert.equal(await inlineGraphvizIcons(svg), svg);
});

test('replaces multiple slots that share one lazy asset', async () => {
  const repeated = svg.replace('</svg>', `<g><a href="#slot-two"><polygon points="50,-2 50,-42 90,-42 90,-2 50,-2"/></a></g></svg>`);
  const result = await inlineGraphvizIcons(repeated, [
    { slotId: 'slot-one', iconId: 'postgresql', color: '#fff' },
    { slotId: 'slot-two', iconId: 'postgresql', color: '#fff' },
  ]);
  assert.equal(result.match(/class="technology-icon"/g)?.length, 2);
  assert.doesNotMatch(result, /href="#slot-(?:one|two)"/);
});

test('rejects unavailable assets and missing or malformed slots', async () => {
  await assert.rejects(() => inlineGraphvizIcons(svg, [{ slotId: 'slot-one', iconId: 'missing', color: '#fff' }]), /unavailable/);
  await assert.rejects(() => inlineGraphvizIcons(svg, [{ slotId: 'other', iconId: 'postgresql', color: '#fff' }]), /missing/);
  await assert.rejects(() => inlineGraphvizIcons(svg, [
    { slotId: 'slot-one', iconId: 'postgresql', color: '#fff' },
    { slotId: 'slot-one', iconId: 'postgresql', color: '#fff' },
  ]), /duplicated/);
  await assert.rejects(() => inlineGraphvizIcons(svg.replace(/<polygon[^>]+\/>/, ''), [{ slotId: 'slot-one', iconId: 'postgresql', color: '#fff' }]), /no geometry/);
  for (const points of ['0,0 1,1', '0,0 invalid,1 2,2', '0,0 1,invalid 2,2', '1,1 1,2 1,3', '1,1 2,1 3,1']) {
    const malformed = svg.replace('2,-2 2,-42 42,-42 42,-2 2,-2', points);
    await assert.rejects(() => inlineGraphvizIcons(malformed, [{ slotId: 'slot-one', iconId: 'postgresql', color: '#fff' }]), /no geometry/);
  }
});

test('escapes slot ids and presentation colors in generated SVG attributes', async () => {
  const special = svg.replaceAll('slot-one', 'slot.one+one').replace('xlink:href', 'href');
  const result = await inlineGraphvizIcons(special, [{ slotId: 'slot.one+one', iconId: 'postgresql', color: '"<&>' }]);
  assert.match(result, /id="slot.one\+one"/);
  assert.match(result, /color="&quot;&lt;&amp;&gt;"/);
});
