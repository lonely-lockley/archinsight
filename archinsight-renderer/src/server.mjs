import http from 'node:http';
import { Worker } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { RenderQueue, RenderQueueFullError } from './render-queue.mjs';
import { requestLimitsFromEnv, validatePngRenderPayload, validateSvgRenderPayload } from './validation.mjs';

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? '127.0.0.1';
const maxBodyBytes = Number(process.env.MAX_BODY_BYTES ?? 1024 * 1024);
const renderTimeoutMs = Number(process.env.RENDER_TIMEOUT_MS ?? 5000);
const maxConcurrentRenders = integerSetting('MAX_CONCURRENT_RENDERS', 2, 1);
const maxQueuedRenders = integerSetting('MAX_QUEUED_RENDERS', 16, 0);
const workerPath = join(dirname(fileURLToPath(import.meta.url)), 'render-worker.mjs');
const limits = requestLimitsFromEnv();
const renderQueue = new RenderQueue(maxConcurrentRenders, maxQueuedRenders);

const server = http.createServer((request, response) => {
  if (request.method === 'GET' && request.url === '/health') {
    sendJson(response, 200, { ok: true });
    return;
  }
  if (request.method === 'POST' && (request.url === '/render/svg' || request.url === '/render')) {
    void handleSvgRender(request, response);
    return;
  }
  if (request.method === 'POST' && request.url === '/render/png') {
    void handlePngRender(request, response);
    return;
  }
  if (request.method !== 'POST') {
    sendJson(response, 404, { error: 'not found' });
    return;
  }
  sendJson(response, 404, { error: 'not found' });
});

server.listen(port, host, () => {
  console.log(`archinsight renderer listening on ${host}:${port}`);
});

async function handleSvgRender(request, response) {
  try {
    const rendered = await renderQueue.run(async () => {
      const body = await readBody(request);
      const payload = validateSvgRenderPayload(JSON.parse(body), limits);
      return renderInWorker({ mode: 'svg', renders: payload.renders });
    });
    sendJson(response, 200, {
      diagnostics: [],
      svgs: rendered.svgs,
      warnings: rendered.warnings
    });
  } catch (error) {
    sendRenderError(request, response, error);
  }
}

async function handlePngRender(request, response) {
  try {
    const rendered = await renderQueue.run(async () => {
      const body = await readBody(request);
      const payload = validatePngRenderPayload(JSON.parse(body), limits);
      return renderInWorker({
        mode: 'png',
        renders: payload.renders,
        dpi: payload.dpi,
        maxPngBytes: limits.maxPngBytes
      });
    });
    sendJson(response, 200, {
      diagnostics: [],
      pngs: rendered.pngs,
      warnings: rendered.warnings
    });
  } catch (error) {
    sendRenderError(request, response, error);
  }
}

function sendRenderError(request, response, error) {
  if (error instanceof RenderQueueFullError) {
    request.resume();
    sendJson(response, 503, { error: error.message }, { 'retry-after': '1' });
    return;
  }
  sendJson(response, 400, {
    error: error instanceof Error ? error.message : String(error)
  });
}

function renderInWorker(workerPayload) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(workerPath, { workerData: workerPayload });
    const timeout = setTimeout(() => {
      void worker.terminate();
      reject(new Error('render timed out'));
    }, renderTimeoutMs);
    worker.once('message', (message) => {
      clearTimeout(timeout);
      if (message.error !== undefined) {
        reject(new Error(message.error));
        return;
      }
      resolve({
        svgs: message.svgs ?? [],
        pngs: message.pngs ?? [],
        warnings: message.warnings ?? []
      });
    });
    worker.once('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    worker.once('exit', (code) => {
      clearTimeout(timeout);
      if (code !== 0) {
        reject(new Error(`renderer worker exited with code ${code}`));
      }
    });
  });
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    request.on('data', (chunk) => {
      size += chunk.length;
      if (size > maxBodyBytes) {
        request.destroy();
        reject(new Error('request body is too large'));
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    request.on('error', reject);
  });
}

function sendJson(response, status, payload, headers = {}) {
  const body = JSON.stringify(payload);
  response.writeHead(status, {
    'content-type': 'application/json',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    ...headers
  });
  response.end(body);
}

function integerSetting(name, fallback, minimum) {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(value) || value < minimum) {
    throw new Error(`${name} must be an integer greater than or equal to ${minimum}`);
  }
  return value;
}
