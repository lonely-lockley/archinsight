import path from 'node:path';
import { Worker } from 'node:worker_threads';
import {
  IndexedGraph,
  type IndexedGraphSnapshot,
  type LanguageBuildResult,
  type LanguageDiagnostic,
  type LinkProjectResult,
  type ProjectSource,
} from '@insight/language';

export interface WorkerProjectAnalysis {
  readonly snapshotBuild: LanguageBuildResult;
  readonly diagnostics: readonly LanguageDiagnostic[];
  readonly result: LinkProjectResult;
  readonly mode: 'full' | 'incremental' | 'unchanged';
}

let worker: Worker | undefined;
let nextId = 0;
const pending = new Map<number, {
  readonly resolve: (analysis: WorkerProjectAnalysis) => void;
  readonly reject: (cause: Error) => void;
  readonly signal: AbortSignal;
  readonly abort: () => void;
}>();

export function analyzeProjectInWorker(
  root: string,
  sources: readonly ProjectSource[],
  signal: AbortSignal,
): Promise<WorkerProjectAnalysis> {
  if (signal.aborted) return Promise.reject(abortError());
  const active = worker ?? createWorker();
  const id = ++nextId;
  return new Promise((resolve, reject) => {
    const abort = () => cancelRequest(id);
    pending.set(id, { resolve, reject, signal, abort });
    signal.addEventListener('abort', abort, { once: true });
    active.postMessage({ id, kind: 'project', root, sources });
  });
}

/**
 * Links an immutable historical revision in its own worker. Revision work must
 * neither mutate the live project session nor make cancellation of a diff
 * terminate an unrelated workspace refresh.
 */
export function analyzeProjectRevisionInWorker(
  sources: readonly ProjectSource[],
  signal: AbortSignal,
): Promise<WorkerProjectAnalysis> {
  if (signal.aborted) return Promise.reject(abortError());
  const revisionWorker = new Worker(path.join(__dirname, 'project-analysis-worker.cjs'));
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (cause?: Error, analysis?: WorkerProjectAnalysis) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener('abort', cancel);
      void revisionWorker.terminate();
      if (cause !== undefined) reject(cause);
      else if (analysis !== undefined) resolve(analysis);
      else reject(new Error('Revision analysis worker returned an invalid response'));
    };
    const cancel = () => finish(abortError());
    signal.addEventListener('abort', cancel, { once: true });
    revisionWorker.on('message', (message: {
      readonly error?: string;
      readonly mode?: WorkerProjectAnalysis['mode'];
      readonly analysis?: {
        readonly snapshotBuild: LanguageBuildResult;
        readonly diagnostics: readonly LanguageDiagnostic[];
        readonly result: Omit<LinkProjectResult, 'graph'>;
        readonly graph: IndexedGraphSnapshot;
      };
    }) => {
      if (message.error !== undefined) {
        finish(new Error(message.error));
        return;
      }
      if (message.analysis === undefined || message.mode === undefined) {
        finish(new Error('Revision analysis worker returned an invalid response'));
        return;
      }
      finish(undefined, {
        snapshotBuild: message.analysis.snapshotBuild,
        diagnostics: message.analysis.diagnostics,
        result: {
          ...message.analysis.result,
          graph: IndexedGraph.fromSnapshot(message.analysis.graph),
        },
        mode: message.mode,
      });
    });
    revisionWorker.on('error', (cause) => finish(cause));
    revisionWorker.on('exit', (code) => {
      if (!settled && code !== 0) finish(new Error(`Revision analysis worker exited with code ${code}`));
    });
    revisionWorker.postMessage({ id: 1, kind: 'revision', sources });
  });
}

export function disposeProjectAnalysisWorker(): void {
  resetWorker(new Error('Project analysis worker was disposed'));
}

function createWorker(): Worker {
  const created = new Worker(path.join(__dirname, 'project-analysis-worker.cjs'));
  created.on('message', (message: {
    readonly id: number;
    readonly error?: string;
    readonly mode?: WorkerProjectAnalysis['mode'];
    readonly analysis?: {
      readonly snapshotBuild: LanguageBuildResult;
      readonly diagnostics: readonly LanguageDiagnostic[];
      readonly result: Omit<LinkProjectResult, 'graph'>;
      readonly graph: IndexedGraphSnapshot;
    };
  }) => {
    const request = pending.get(message.id);
    if (request === undefined) return;
    pending.delete(message.id);
    request.signal.removeEventListener('abort', request.abort);
    if (message.error !== undefined) request.reject(new Error(message.error));
    else if (message.analysis !== undefined && message.mode !== undefined) request.resolve({
      snapshotBuild: message.analysis.snapshotBuild,
      diagnostics: message.analysis.diagnostics,
      result: { ...message.analysis.result, graph: IndexedGraph.fromSnapshot(message.analysis.graph) },
      mode: message.mode,
    });
    else request.reject(new Error('Project analysis worker returned an invalid response'));
  });
  created.on('error', (cause) => {
    if (worker === created) resetWorker(cause);
  });
  created.on('exit', (code) => {
    if (worker === created && code !== 0) resetWorker(new Error(`Project analysis worker exited with code ${code}`));
  });
  worker = created;
  return created;
}

function cancelRequest(id: number): void {
  const request = pending.get(id);
  if (request === undefined) return;
  pending.delete(id);
  request.signal.removeEventListener('abort', request.abort);
  request.reject(abortError());
  // Linking is synchronous once started. Termination is the cancellation boundary.
  resetWorker(abortError());
}

function resetWorker(cause: Error): void {
  const current = worker;
  worker = undefined;
  if (current !== undefined) void current.terminate();
  for (const request of pending.values()) {
    request.signal.removeEventListener('abort', request.abort);
    request.reject(cause);
  }
  pending.clear();
}

function abortError(): Error {
  const error = new Error('Project analysis was cancelled');
  error.name = 'AbortError';
  return error;
}
