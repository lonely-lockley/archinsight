import GraphvizWorker from '$lib/graphviz.worker?worker';
import type { DotRender, SvgRenderResponse } from './api';

type RenderResponse = {
  requestId: number;
  svgs?: SvgRenderResponse['svgs'];
  warnings?: string[];
  error?: string;
};

type RenderRequest = {
  readonly requestId: number;
  readonly renders: DotRender[];
  readonly signal?: AbortSignal;
  readonly resolve: (response: SvgRenderResponse) => void;
  readonly reject: (error: Error) => void;
  timeout?: number;
  abort?: () => void;
  cancelled?: boolean;
};

const renderTimeoutMs = 5000;

let worker: Worker | undefined;
let requestSequence = 0;
let active: RenderRequest | undefined;
const queued: RenderRequest[] = [];

export async function renderDotInBrowser(
  renders: DotRender[],
  signal?: AbortSignal,
): Promise<SvgRenderResponse> {
  if (renders.length === 0) return { diagnostics: [], svgs: [] };
  if (signal?.aborted === true) throw abortError();
  const requestId = ++requestSequence;
  return new Promise((resolve, reject) => {
    const request: RenderRequest = { requestId, renders, signal, resolve, reject };
    request.abort = () => cancelRequest(request);
    signal?.addEventListener('abort', request.abort, { once: true });
    queued.push(request);
    pump();
  });
}

export function terminateBrowserGraphvizWorker(): void {
  const error = new Error('Browser Graphviz worker terminated');
  terminateWorker();
  if (active !== undefined) {
    const request = active;
    active = undefined;
    finish(request, () => request.reject(error));
  }
  while (queued.length > 0) {
    const request = queued.shift()!;
    finish(request, () => request.reject(error));
  }
}

function pump(): void {
  if (active !== undefined) return;
  const request = queued.shift();
  if (request === undefined) return;
  if (request.signal?.aborted === true) {
    finish(request, () => request.reject(abortError()));
    pump();
    return;
  }
  active = request;
  request.timeout = window.setTimeout(() => {
    failActive(new Error('Browser Graphviz render timed out'));
  }, renderTimeoutMs);
  ensureWorker().postMessage({ requestId: request.requestId, renders: request.renders });
}

function ensureWorker(): Worker {
  if (worker !== undefined) {
    return worker;
  }
  worker = new GraphvizWorker();
  worker.onmessage = (event: MessageEvent<RenderResponse>) => {
    const request = active;
    if (request === undefined || request.requestId !== event.data.requestId) return;
    if (event.data.error !== undefined) {
      finishActive(() => request.reject(new Error(event.data.error)));
      return;
    }
    finishActive(() => request.resolve({ diagnostics: [], svgs: event.data.svgs ?? [] }));
  };
  worker.onerror = (event) => failActive(new Error(event.message || 'Browser Graphviz worker failed'));
  return worker;
}

function cancelRequest(request: RenderRequest): void {
  if (active === request) {
    request.cancelled = true;
    if (request.abort !== undefined) request.signal?.removeEventListener('abort', request.abort);
    request.reject(abortError());
    return;
  }
  const index = queued.indexOf(request);
  if (index < 0) return;
  queued.splice(index, 1);
  finish(request, () => request.reject(abortError()));
}

function failActive(error: Error): void {
  const request = active;
  if (request === undefined) return;
  terminateWorker();
  finishActive(() => request.reject(error));
}

function finishActive(complete: () => void): void {
  const request = active;
  if (request === undefined) return;
  active = undefined;
  finish(request, request.cancelled === true ? () => {} : complete);
  pump();
}

function finish(request: RenderRequest, complete: () => void): void {
  if (request.timeout !== undefined) window.clearTimeout(request.timeout);
  if (request.abort !== undefined) request.signal?.removeEventListener('abort', request.abort);
  complete();
}

function terminateWorker(): void {
  const previous = worker;
  worker = undefined;
  previous?.terminate();
}

function abortError(): Error {
  const error = new Error('Browser Graphviz render aborted');
  error.name = 'AbortError';
  return error;
}
