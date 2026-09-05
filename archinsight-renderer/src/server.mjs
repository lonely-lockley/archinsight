import http from 'node:http';
import { createHash, timingSafeEqual } from 'node:crypto';
import { Worker } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { RenderQueue, RenderQueueFullError } from './render-queue.mjs';
import { requestLimitsFromEnv, validatePngRenderPayload, validateSvgRenderPayload } from './validation.mjs';

const port = integerSetting('PORT', 3000, 1);
const host = process.env.HOST ?? '127.0.0.1';
const apiToken = requiredSecret('RENDERER_API_TOKEN', 16);
const maxBodyBytes = integerSetting('MAX_BODY_BYTES', 1024 * 1024, 1);
const bodyTimeoutMs = integerSetting('BODY_TIMEOUT_MS', 5000, 1);
const renderTimeoutMs = integerSetting('RENDER_TIMEOUT_MS', 5000, 1);
const maxConcurrentRenders = integerSetting('MAX_CONCURRENT_RENDERS', 2, 1);
const maxQueuedRenders = integerSetting('MAX_QUEUED_RENDERS', 16, 0);
const workerMaxOldGenerationMb = integerSetting('WORKER_MAX_OLD_GENERATION_MB', 64, 16);
const workerMaxYoungGenerationMb = integerSetting('WORKER_MAX_YOUNG_GENERATION_MB', 16, 4);
const workerStackMb = integerSetting('WORKER_STACK_MB', 4, 1);
const workerPath = join(dirname(fileURLToPath(import.meta.url)), 'render-worker.mjs');
const limits = requestLimitsFromEnv();
const renderQueue = new RenderQueue(maxConcurrentRenders, maxQueuedRenders);

const server = http.createServer((request, response) => {
  if (request.method === 'GET' && request.url === '/health') {
    sendJson(response, 200, { ok: true });
    return;
  }
  const mode = renderMode(request.method, request.url);
  if (!mode) {
    request.resume();
    sendJson(response, 404, { error: 'not found' });
    return;
  }
  if (!authorized(request.headers.authorization)) {
    request.resume();
    sendJson(response, 401, { error: 'unauthorized' }, { 'www-authenticate': 'Bearer' });
    return;
  }
  if (!(request.headers['content-type'] ?? '').toLowerCase().startsWith('application/json')) {
    request.resume();
    sendJson(response, 415, { error: 'content-type must be application/json' });
    return;
  }
  void handleRender(mode, request, response);
});

server.requestTimeout = bodyTimeoutMs + renderTimeoutMs + 1000;
server.headersTimeout = Math.min(server.requestTimeout, 10_000);

server.listen(port, host, () => {
  console.log(`archinsight renderer listening on ${host}:${port}`);
});

process.once('SIGTERM', shutdown);
process.once('SIGINT', shutdown);

function shutdown() {
  server.close((error) => {
    if (error) {
      console.error(error);
      process.exitCode = 1;
    }
  });
}

async function handleRender(mode, request, response) {
  try {
    // Body parsing and payload validation happen before a scarce render slot is acquired.
    const body = await readBody(request);
    const parsed = JSON.parse(body);
    const payload = mode === 'png'
      ? validatePngRenderPayload(parsed, limits)
      : validateSvgRenderPayload(parsed, limits);
    const rendered = await renderQueue.run(() => renderInWorker({
      mode,
      renders: payload.renders,
      dpi: payload.dpi,
      limits
    }));
    sendRenderJson(response, 200, mode === 'png'
      ? { diagnostics: [], pngs: rendered.pngs, warnings: rendered.warnings }
      : { diagnostics: [], svgs: rendered.svgs, warnings: rendered.warnings });
  } catch (error) {
    sendRenderError(request, response, error);
  }
}

function renderMode(method, url) {
  if (method !== 'POST') {
    return null;
  }
  if (url === '/render/svg' || url === '/render') {
    return 'svg';
  }
  return url === '/render/png' ? 'png' : null;
}

function sendRenderError(request, response, error) {
  if (error instanceof RenderQueueFullError) {
    sendJson(response, 503, { error: error.message }, { 'retry-after': '1' });
    return;
  }
  if (error instanceof RequestBodyTooLargeError) {
    sendJson(response, 413, { error: error.message });
    return;
  }
  if (error instanceof RequestBodyTimeoutError) {
    response.shouldKeepAlive = false;
    sendJson(response, 408, { error: error.message }, { connection: 'close' });
    return;
  }
  if (error instanceof RenderTimeoutError) {
    sendJson(response, 504, { error: error.message });
    return;
  }
  request.resume();
  sendJson(response, 400, {
    error: error instanceof Error ? error.message : String(error)
  });
}

function renderInWorker(workerPayload) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(workerPath, {
      workerData: workerPayload,
      resourceLimits: {
        maxOldGenerationSizeMb: workerMaxOldGenerationMb,
        maxYoungGenerationSizeMb: workerMaxYoungGenerationMb,
        stackSizeMb: workerStackMb
      }
    });
    let message;
    let workerError;
    let timedOut = false;
    let settled = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      // The queue slot remains occupied until terminate() has completed and exit fires.
      void worker.terminate().catch((error) => finish(error));
    }, renderTimeoutMs);

    worker.once('message', (value) => {
      message = value;
    });
    worker.once('error', (error) => {
      workerError = error;
    });
    worker.once('exit', (code) => {
      if (timedOut) {
        finish(new RenderTimeoutError(`render timed out after ${renderTimeoutMs} ms`));
        return;
      }
      if (workerError) {
        finish(workerError);
        return;
      }
      if (code !== 0) {
        finish(new Error(`renderer worker exited with code ${code}`));
        return;
      }
      if (!message) {
        finish(new Error('renderer worker exited without a response'));
        return;
      }
      if (message.error !== undefined) {
        finish(new Error(message.error));
        return;
      }
      finish(undefined, {
        svgs: message.svgs ?? [],
        pngs: message.pngs ?? [],
        warnings: message.warnings ?? []
      });
    });

    function finish(error, value) {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      if (error) {
        reject(error);
      } else {
        resolve(value);
      }
    }
  });
}

function readBody(request) {
  const contentLength = Number(request.headers['content-length']);
  if (Number.isFinite(contentLength) && contentLength > maxBodyBytes) {
    request.resume();
    return Promise.reject(new RequestBodyTooLargeError(`request body exceeds ${maxBodyBytes} bytes`));
  }
  return new Promise((resolve, reject) => {
    let size = 0;
    let settled = false;
    const chunks = [];
    const timeout = setTimeout(() => fail(new RequestBodyTimeoutError(`request body timed out after ${bodyTimeoutMs} ms`)), bodyTimeoutMs);

    request.on('data', onData);
    request.once('end', onEnd);
    request.once('aborted', onAborted);
    request.once('error', onError);

    function onData(chunk) {
      size += chunk.length;
      if (size > maxBodyBytes) {
        fail(new RequestBodyTooLargeError(`request body exceeds ${maxBodyBytes} bytes`));
        return;
      }
      chunks.push(chunk);
    }

    function onEnd() {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      resolve(Buffer.concat(chunks).toString('utf8'));
    }

    function onAborted() {
      fail(new Error('request body was aborted'));
    }

    function onError(error) {
      fail(error);
    }

    function fail(error) {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      request.resume();
      reject(error);
    }

    function cleanup() {
      clearTimeout(timeout);
      request.off('data', onData);
      request.off('end', onEnd);
      request.off('aborted', onAborted);
      request.off('error', onError);
    }
  });
}

function sendRenderJson(response, status, payload) {
  const body = JSON.stringify(payload);
  const bytes = Buffer.byteLength(body, 'utf8');
  if (bytes > limits.maxResponseBytes) {
    sendJson(response, 500, { error: `renderer response exceeds ${limits.maxResponseBytes} bytes` });
    return;
  }
  sendBody(response, status, body);
}

function sendJson(response, status, payload, headers = {}) {
  sendBody(response, status, JSON.stringify(payload), headers);
}

function sendBody(response, status, body, headers = {}) {
  response.writeHead(status, {
    'content-type': 'application/json',
    'content-length': Buffer.byteLength(body, 'utf8'),
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'content-security-policy': "default-src 'none'",
    ...headers
  });
  response.end(body);
}

function authorized(value) {
  const actual = Array.isArray(value) ? value[0] ?? '' : value ?? '';
  const expectedHash = createHash('sha256').update(`Bearer ${apiToken}`).digest();
  const actualHash = createHash('sha256').update(actual.trim()).digest();
  return timingSafeEqual(expectedHash, actualHash);
}

function requiredSecret(name, minimumLength) {
  const value = process.env[name]?.trim();
  if (!value || value.length < minimumLength) {
    throw new Error(`${name} must contain at least ${minimumLength} characters`);
  }
  return value;
}

function integerSetting(name, fallback, minimum) {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isSafeInteger(value) || value < minimum) {
    throw new Error(`${name} must be an integer greater than or equal to ${minimum}`);
  }
  return value;
}

class RequestBodyTooLargeError extends Error {}
class RequestBodyTimeoutError extends Error {}
class RenderTimeoutError extends Error {}
