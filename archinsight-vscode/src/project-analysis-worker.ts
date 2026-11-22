import { parentPort } from 'node:worker_threads';
import path from 'node:path';
import {
  ProjectAnalysisSession,
  type IndexedGraphSnapshot,
  type LinkProjectResult,
  type ProjectSource,
} from '@insight/language';
import { createNodeParallelSourceParser } from '@insight/language/node-parallel-parser';

if (parentPort === null) throw new Error('Project analysis worker requires a parent port');

let root: string | undefined;
let session: ProjectAnalysisSession | undefined;
let requests = Promise.resolve();
const parallelSourceParser = createNodeParallelSourceParser({
  workerUrl: path.join(__dirname, 'project-source-parser-worker.cjs'),
});

interface AnalysisRequest {
  readonly id: number;
  readonly kind?: 'project' | 'revision';
  readonly root?: string;
  readonly sources: readonly ProjectSource[];
}

parentPort.on('message', (message: AnalysisRequest) => {
  requests = requests.then(() => handleRequest(message));
});

async function handleRequest(message: AnalysisRequest): Promise<void> {
  try {
    let analysis;
    let mode: 'full' | 'incremental' | 'unchanged';
    if (message.kind === 'revision') {
      analysis = (await ProjectAnalysisSession.createAsync(message.sources, parallelSourceParser)).analysis();
      mode = 'full';
    } else if (session === undefined || root !== message.root) {
      session = await ProjectAnalysisSession.createAsync(message.sources, parallelSourceParser);
      root = message.root;
      analysis = session.analysis();
      mode = 'full';
    } else {
      const update = session.update(message.sources);
      analysis = update;
      mode = update.mode;
    }
    const result: Omit<LinkProjectResult, 'graph'> = withoutGraph(analysis.result);
    parentPort!.postMessage({
      id: message.id,
      analysis: {
        snapshotBuild: analysis.snapshotBuild,
        diagnostics: analysis.diagnostics,
        result,
        graph: analysis.result.graph.snapshot() satisfies IndexedGraphSnapshot,
      },
      mode,
    });
  } catch (cause) {
    parentPort!.postMessage({ id: message.id, error: cause instanceof Error ? cause.message : String(cause) });
  }
}

function withoutGraph(result: LinkProjectResult): Omit<LinkProjectResult, 'graph'> {
  const { graph: _graph, ...plain } = result;
  return plain;
}
