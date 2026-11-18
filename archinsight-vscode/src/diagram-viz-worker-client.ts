import path from 'node:path';
import { Worker } from 'node:worker_threads';
import type {
  DiagramDiff,
  LinkProjectResult,
  QueryParameterValue,
  QueryResult,
  QueryScope,
  RenderGraph,
  RenderTheme,
  GraphvizIconPlacement,
} from '@insight/language';

type RenderRequest = {
  readonly id: number;
  readonly message: unknown;
  readonly resolve: (value: any) => void;
  readonly reject: (cause: Error) => void;
  readonly signal?: AbortSignal;
  readonly abort: () => void;
  cancelled?: boolean;
};

let worker: Worker | undefined;
let active: RenderRequest | undefined;
let nextRequestId = 0;
const queue: RenderRequest[] = [];

export function renderSvgInWorker(dot: string, icons: readonly GraphvizIconPlacement[] = [], signal?: AbortSignal): Promise<string> {
  return submit({ kind: 'dot', dot, icons }, signal).then((result) => result.svg);
}

export function executeDiagramQueryInWorker(
  result: LinkProjectResult,
  scope: QueryScope,
  query: string,
  parameters: Readonly<Record<string, QueryParameterValue>>,
  theme: RenderTheme,
  signal?: AbortSignal,
): Promise<{ readonly result: QueryResult; readonly dot?: string; readonly svg?: string }> {
  return submit({ kind: 'query', result: transferableResult(result), scope, query, parameters, theme }, signal);
}

export function selectDiagramQueryInWorker(
  result: LinkProjectResult,
  scope: QueryScope,
  query: string,
  parameters: Readonly<Record<string, QueryParameterValue>>,
  signal?: AbortSignal,
): Promise<QueryResult> {
  return submit({
    kind: 'select-query',
    result: transferableResult(result),
    scope,
    query,
    parameters,
  }, signal).then((response) => response.result);
}

export function renderDiagramGraphInWorker(
  result: LinkProjectResult,
  graph: RenderGraph,
  theme: RenderTheme,
  signal?: AbortSignal,
): Promise<{ readonly dot: string; readonly svg: string }> {
  return submit({ kind: 'graph', result: transferableResult(result), graph, theme }, signal);
}

export function renderDiagramDiffInWorker(
  before: LinkProjectResult,
  after: LinkProjectResult,
  diff: DiagramDiff,
  theme: RenderTheme,
  signal?: AbortSignal,
): Promise<{ readonly dot: string; readonly svg: string }> {
  return submit({
    kind: 'diff',
    before: transferableResult(before),
    after: transferableResult(after),
    diff,
    theme,
  }, signal);
}

function submit(message: unknown, signal?: AbortSignal): Promise<any> {
  if (signal?.aborted === true) return Promise.reject(abortError());
  return new Promise((resolve, reject) => {
    const id = ++nextRequestId;
    const request: RenderRequest = { id, message, resolve, reject, signal, abort: () => abortRequest(id) };
    signal?.addEventListener('abort', request.abort, { once: true });
    queue.push(request);
    pump();
  });
}

export function disposeDiagramVizWorker(): void {
  const current = worker;
  worker = undefined;
  if (current !== undefined) void current.terminate();
  if (active !== undefined) settle(active, undefined, new Error('Diagram rendering worker was disposed'));
  for (const request of queue.splice(0)) settle(request, undefined, new Error('Diagram rendering worker was disposed'));
}

function pump(): void {
  if (active !== undefined) return;
  const request = queue.shift();
  if (request === undefined) return;
  if (request.signal?.aborted === true) {
    settle(request, undefined, abortError());
    pump();
    return;
  }
  active = request;
  (worker ?? createWorker()).postMessage({ id: request.id, ...(request.message as object) });
}

function createWorker(): Worker {
  const created = new Worker(path.join(__dirname, 'diagram-viz-worker.mjs'));
  created.on('message', (message: { readonly id: number; readonly value?: any; readonly error?: string }) => {
    const request = active;
    if (request === undefined || request.id !== message.id) return;
    settle(request, message.value, message.error === undefined ? undefined : new Error(message.error));
    pump();
  });
  created.on('error', (cause) => failWorker(created, cause));
  created.on('exit', (code) => {
    if (worker !== created) return;
    worker = undefined;
    if (code !== 0) failActive(new Error(`Diagram rendering worker exited with code ${code}`));
    pump();
  });
  worker = created;
  return created;
}

function abortRequest(id: number): void {
  const current = active;
  if (current?.id === id) {
    current.cancelled = true;
    current.signal?.removeEventListener('abort', current.abort);
    current.reject(abortError());
    return;
  }
  const index = queue.findIndex((request) => request.id === id);
  if (index < 0) return;
  const [request] = queue.splice(index, 1);
  if (request !== undefined) settle(request, undefined, abortError());
}

function failWorker(failed: Worker, cause: Error): void {
  if (worker !== failed) return;
  worker = undefined;
  failActive(cause);
  pump();
}

function failActive(cause: Error): void {
  const request = active;
  if (request !== undefined) settle(request, undefined, cause);
}

function settle(request: RenderRequest, value?: any, cause?: Error): void {
  request.signal?.removeEventListener('abort', request.abort);
  if (active === request) active = undefined;
  if (request.cancelled === true) return;
  if (cause !== undefined) request.reject(cause);
  else if (value !== undefined) request.resolve(value);
  else request.reject(new Error('Diagram rendering worker returned an invalid response'));
}

function transferableResult(result: LinkProjectResult): Omit<LinkProjectResult, 'graph'> & {
  readonly graphSnapshot: ReturnType<LinkProjectResult['graph']['snapshot']>;
} {
  const { graph, ...plain } = result;
  return { ...plain, graphSnapshot: graph.snapshot() };
}

function abortError(): Error {
  const error = new Error('Diagram rendering was cancelled');
  error.name = 'AbortError';
  return error;
}
