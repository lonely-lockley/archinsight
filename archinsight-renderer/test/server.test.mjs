import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

const port = 33080;
const baseUrl = `http://127.0.0.1:${port}`;

test('serves health, svg render, and png render endpoints', async (t) => {
  let stderr = '';
  const server = spawn(process.execPath, ['src/server.mjs'], {
    cwd: new URL('..', import.meta.url),
    env: {
      ...process.env,
      HOST: '127.0.0.1',
      PORT: String(port),
      DEFAULT_PNG_DPI: '200',
      MAX_PNG_DPI: '600',
      MAX_PNG_BYTES: String(1024 * 1024)
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  server.stderr.on('data', (chunk) => {
    stderr += chunk.toString('utf8');
  });
  try {
    await waitForHealth(server, () => stderr);

    const health = await fetch(`${baseUrl}/health`);
    assert.equal(health.status, 200);
    assert.equal(health.headers.get('cache-control'), 'no-store');
    assert.equal(health.headers.get('x-content-type-options'), 'nosniff');
    assert.deepEqual(await health.json(), { ok: true });

    const svg = await post('/render/svg', renderPayload());
    assert.equal(svg.diagnostics.length, 0);
    assert.match(svg.svgs[0].svg, /<svg/);
    assert.equal(svg.svgs[0].sourceIdentity, 'app.ai');

    const legacy = await post('/render', renderPayload());
    assert.match(legacy.svgs[0].svg, /<svg/);

    const png = await post('/render/png', { ...renderPayload(), dpi: 240 });
    assert.equal(png.diagnostics.length, 0);
    assert.equal(png.pngs[0].contentType, 'image/png');
    assert.equal(png.pngs[0].dpi, 240);
    assert.ok(png.pngs[0].width > 0);
    assert.ok(png.pngs[0].height > 0);
    assert.ok(Buffer.from(png.pngs[0].png, 'base64').subarray(0, 8).equals(Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a
    ])));

    const defaultDpiPng = await post('/render/png', renderPayload());
    assert.equal(defaultDpiPng.pngs[0].dpi, 200);

    const invalidDpi = await post('/render/png', { ...renderPayload(), dpi: 601 }, 400);
    assert.match(invalidDpi.error, /dpi is too high/);

    const malformedSvg = await post('/render/svg', {}, 400);
    assert.match(malformedSvg.error, /renders must be an array/);

    const missing = await fetch(`${baseUrl}/render/svg`);
    assert.equal(missing.status, 404);
    assert.deepEqual(await missing.json(), { error: 'not found' });
  } finally {
    if (server.exitCode !== null && /listen EPERM/.test(stderr)) {
      t.skip('sandbox does not allow listening sockets');
      return;
    }
    if (server.exitCode === null) {
      server.kill('SIGTERM');
      await new Promise((resolve) => server.once('exit', resolve));
    }
  }
});

function renderPayload() {
  return {
    renders: [{
      sourceIdentity: 'app.ai',
      diagram: 'query',
      dot: 'digraph app { a -> b }'
    }]
  };
}

async function waitForHealth(server, stderr) {
  const started = Date.now();
  let lastError;
  while (Date.now() - started < 5000) {
    if (server.exitCode !== null) {
      throw new Error(stderr() || `renderer exited with code ${server.exitCode}`);
    }
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) {
        return;
      }
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw lastError ?? new Error('renderer did not start');
}

async function post(path, body, expectedStatus = 200) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (response.status !== expectedStatus) {
    assert.equal(response.status, expectedStatus, await response.text());
  }
  return response.json();
}
