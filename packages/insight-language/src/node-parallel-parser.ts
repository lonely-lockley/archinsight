import { availableParallelism } from "node:os";
import { Worker } from "node:worker_threads";
import type { ProjectSource } from "./contracts.js";
import { hydrateParsedSource, type PortableParsedSource } from "./parser-facade.js";
import type { ProjectSourceBatchParser } from "./project-analysis-session.js";

export interface NodeParallelSourceParserOptions {
  readonly workerUrl: URL | string;
  readonly maximumWorkers?: number;
  readonly sourcesPerWorker?: number;
}

interface IndexedSource {
  readonly index: number;
  readonly sourceName: string;
  readonly source: string;
}

interface IndexedParsedSource {
  readonly index: number;
  readonly parsed: PortableParsedSource;
}

interface WorkerResponse {
  readonly parsed?: readonly IndexedParsedSource[];
  readonly error?: string;
}

export function createNodeParallelSourceParser(
  options: NodeParallelSourceParserOptions,
): ProjectSourceBatchParser {
  const maximumWorkers = positiveInteger(options.maximumWorkers, 4);
  const sourcesPerWorker = positiveInteger(options.sourcesPerWorker, 64);
  let pending: Promise<void> = Promise.resolve();
  return (sources) => {
    const task = pending.catch(() => undefined).then(() => parseBatch(
      sources,
      options.workerUrl,
      maximumWorkers,
      sourcesPerWorker,
    ));
    pending = task.then(() => undefined, () => undefined);
    return task;
  };
}

async function parseBatch(
  sources: readonly ProjectSource[],
  workerUrl: URL | string,
  maximumWorkers: number,
  sourcesPerWorker: number,
) {
  if (sources.length === 0) return [];
  const workerCount = Math.min(
    maximumWorkers,
    availableParallelism(),
    Math.max(1, Math.ceil(sources.length / sourcesPerWorker)),
  );
  const batches: IndexedSource[][] = Array.from({ length: workerCount }, () => []);
  sources.forEach((source, index) => {
    batches[index % workerCount]!.push({ index, sourceName: source.sourceName, source: source.source });
  });
  const results = await Promise.all(batches.map((batch) => runWorker(workerUrl, batch)));
  return results
    .flat()
    .sort((left, right) => left.index - right.index)
    .map(({ parsed }) => hydrateParsedSource(parsed));
}

function runWorker(workerUrl: URL | string, sources: readonly IndexedSource[]): Promise<readonly IndexedParsedSource[]> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(workerUrl);
    let settled = false;
    const finish = (action: () => void): void => {
      if (settled) return;
      settled = true;
      void worker.terminate();
      action();
    };
    worker.once("message", (message: WorkerResponse) => {
      const parsed = message.parsed;
      if (message.error === undefined && parsed !== undefined) {
        finish(() => resolve(parsed));
      } else {
        finish(() => reject(new Error(message.error ?? "Parallel parser worker returned an invalid response")));
      }
    });
    worker.once("error", (error) => finish(() => reject(error)));
    worker.once("exit", (code) => {
      if (!settled && code !== 0) {
        finish(() => reject(new Error(`Parallel parser worker exited with code ${code}`)));
      }
    });
    worker.postMessage({ sources });
  });
}

function positiveInteger(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isInteger(value) && value > 0 ? value : fallback;
}
