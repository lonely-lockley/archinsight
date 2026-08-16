import test from 'node:test';
import assert from 'node:assert/strict';
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
    dot: 'digraph app { a -> b }'
  };
}
