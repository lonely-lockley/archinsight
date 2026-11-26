import test from 'node:test';
import assert from 'node:assert/strict';
import { tiny_skia } from 'resvg-napi';
import { Worker } from 'node:worker_threads';
import { requestLimitsFromEnv } from '../src/validation.mjs';

const workerPath = new URL('../src/render-worker.mjs', import.meta.url);
const limits = requestLimitsFromEnv({
  MAX_PNG_BYTES: String(1024 * 1024),
  MAX_TOTAL_OUTPUT_BYTES: String(2 * 1024 * 1024)
});

test('worker renders svg and png payloads', async () => {
  const svg = await render({
    mode: 'svg',
    renders: [renderItem()],
    limits
  });

  assert.match(svg.svgs[0].svg, /<svg/);
  assert.match(svg.svgs[0].svg, /class="technology-icon"/);
  assert.doesNotMatch(svg.svgs[0].svg, /xlink:href="#slot-one"/);
  assert.equal(svg.svgs[0].sourceIdentity, 'app.ai');

  const png = await render({
    mode: 'png',
    renders: [renderItem()],
    dpi: 200,
    limits
  });

  const bytes = Buffer.from(png.pngs[0].png, 'base64');
  assert.equal(png.pngs[0].contentType, 'image/png');
  assert.equal(png.pngs[0].dpi, 200);
  assert.ok(png.pngs[0].width > 0);
  assert.ok(png.pngs[0].height > 0);
  assert.ok(bytes.subarray(0, 8).equals(Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a
  ])));
});

test('PNG paints Latin and Cyrillic node and edge labels', async () => {
  const result = await render({
    mode: 'png', dpi: 96, limits,
    renders: [{
      sourceIdentity: 'labels.ai', diagram: 'query',
      dot: 'digraph { a [label="Заказы", fontcolor=red]; b [label="Orders", fontcolor=blue]; a -> b [label="HTTPS", fontcolor=green] }'
    }]
  });
  const pixels = tiny_skia.Pixmap.decodePng(Buffer.from(result.pngs[0].png, 'base64')).take();
  const ink = new Set();
  for (let i = 0; i < pixels.length; i += 4) {
    const [r, g, b] = pixels.subarray(i, i + 3);
    if (r > g + 40 && r > b + 40) ink.add('Cyrillic node');
    if (b > r + 40 && b > g + 40) ink.add('Latin node');
    if (g > r + 40 && g > b + 40) ink.add('edge');
  }
  assert.deepEqual(ink, new Set(['Cyrillic node', 'Latin node', 'edge']));
});

test('PNG resolves distinct emoji glyphs and shapes a joined emoji as one symbol', async () => {
  const labels = ['🚀', '🔒', '👩‍💻', '👩💻'];
  const result = await render({
    mode: 'png', dpi: 96, limits,
    renders: labels.map(label => ({
      sourceIdentity: 'emoji.ai', diagram: 'query',
      dot: `digraph { a [shape=box, fixedsize=true, width=2, height=1, fontsize=24, label=<<b>${label} Клиент</b>>] }`
    }))
  });
  const glyphs = result.pngs.map(item => {
    const pixels = tiny_skia.Pixmap.decodePng(Buffer.from(item.png, 'base64')).take();
    const ink = [];
    for (let i = 0; i < pixels.length; i += 4) {
      if (Math.max(...pixels.subarray(i, i + 3)) - Math.min(...pixels.subarray(i, i + 3)) > 55) ink.push(i / 4);
    }
    assert(ink.length > 20);
    const xs = ink.map(offset => offset % item.width);
    const left = Math.min(...xs);
    const top = Math.floor(ink[0] / item.width);
    return {
      shape: ink.map(offset => offset - top * item.width - left).join(','),
      width: Math.max(...xs) - left + 1
    };
  });
  assert.equal(new Set(glyphs.map(glyph => glyph.shape)).size, labels.length);
  assert(glyphs[2].width < glyphs[3].width * 0.8, 'ZWJ sequence must shape as a single glyph');
});

test('worker rejects a huge fixed-size canvas before Resvg rasterization', async () => {
  await assert.rejects(render({
    mode: 'png',
    renders: [{
      sourceIdentity: 'bomb.ai',
      diagram: 'query',
      dot: 'digraph bomb { graph [dpi=600]; node [shape=box, width=100000, height=100000, fixedsize=true]; a }'
    }],
    dpi: 600,
    limits
  }), /PNG (dimensions|pixel count) are too large/);
});

test('worker reports Graphviz failures without crashing the worker process', async () => {
  await assert.rejects(render({
    mode: 'svg',
    renders: [{
      sourceIdentity: 'invalid.ai',
      diagram: 'query',
      dot: 'digraph {'
    }],
    limits
  }), /syntax error|Graphviz render failed/i);
});

test('worker enforces warning and PNG byte budgets after icon-aware rendering', async () => {
  await assert.rejects(render({
    mode: 'svg',
    renders: [{
      sourceIdentity: 'warning.ai', diagram: 'query',
      dot: 'digraph warning { a [color="definitely-not-a-color"] }'
    }],
    limits: { ...limits, maxWarningBytes: 1 }
  }), /warnings are too large/i);

  await assert.rejects(render({
    mode: 'png',
    renders: [renderItem()],
    dpi: 96,
    limits: { ...limits, maxPngBytes: 1 }
  }), /PNG output is too large/i);
});

function render(workerData) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(workerPath, { workerData });
    worker.once('message', (message) => {
      if (message.error !== undefined) {
        reject(new Error(message.error));
        return;
      }
      resolve(message);
    });
    worker.once('error', reject);
    worker.once('exit', (code) => {
      if (code !== 0) {
        reject(new Error(`worker exited with code ${code}`));
      }
    });
  });
}

function renderItem() {
  return {
    sourceIdentity: 'app.ai',
    diagram: 'query',
    dot: 'digraph app { a [shape=plain,label=<<table border="0"><tr><td href="#slot-one" tooltip=" " bgcolor="transparent" width="40" height="40" fixedsize="true"> </td><td>App</td></tr></table>>] }',
    icons: [{ slotId: 'slot-one', iconId: 'postgresql', color: '#f4f4f4' }]
  };
}
