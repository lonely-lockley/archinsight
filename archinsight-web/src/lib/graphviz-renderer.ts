import GraphvizWorker from '$lib/graphviz.worker?worker';
import type { DotRender, SvgRenderResponse } from './api';

type RenderResponse = {
  requestId: number;
  svgs?: SvgRenderResponse['svgs'];
  warnings?: string[];
  error?: string;
};

const renderTimeoutMs = 5000;

let worker: Worker | undefined;
let requestSequence = 0;
let pending = new Map<
  number,
  {
    resolve: (response: SvgRenderResponse) => void;
    reject: (error: Error) => void;
    timeout: number;
  }
>();

export async function renderDotInBrowser(renders: DotRender[]): Promise<SvgRenderResponse> {
  if (renders.length === 0) {
    return { diagnostics: [], svgs: [] };
  }
  const requestId = ++requestSequence;
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      resetWorker(new Error('Browser Graphviz render timed out'));
    }, renderTimeoutMs);
    pending.set(requestId, { resolve, reject, timeout });
    ensureWorker().postMessage({ requestId, renders });
  });
}

export function terminateBrowserGraphvizWorker(): void {
  resetWorker(new Error('Browser Graphviz worker terminated'));
}

function ensureWorker(): Worker {
  if (worker !== undefined) {
    return worker;
  }
  worker = new GraphvizWorker();
  worker.onmessage = (event: MessageEvent<RenderResponse>) => {
    const request = pending.get(event.data.requestId);
    if (request === undefined) {
      return;
    }
    pending.delete(event.data.requestId);
    window.clearTimeout(request.timeout);
    if (event.data.error !== undefined) {
      request.reject(new Error(event.data.error));
      return;
    }
    request.resolve({
      diagnostics: [],
      svgs: event.data.svgs ?? []
    });
  };
  worker.onerror = (event) => {
    resetWorker(new Error(event.message || 'Browser Graphviz worker failed'));
  };
  return worker;
}

function rejectAll(error: Error): void {
  for (const [requestId, request] of pending) {
    window.clearTimeout(request.timeout);
    request.reject(error);
    pending.delete(requestId);
  }
}

function resetWorker(error: Error): void {
  const activeWorker = worker;
  worker = undefined;
  activeWorker?.terminate();
  rejectAll(error);
}
