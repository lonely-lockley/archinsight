import { parentPort } from 'node:worker_threads';
import { instance } from '@viz-js/viz';
import { normalizeGraphvizSvgResult } from '@archinsight/graphviz';
import { makeGraphvizBackgroundsTransparent } from './diagram-svg.js';
import {
  IndexedGraph,
  executeQuery,
  renderDiagramDiffGraphviz,
  renderGraphviz,
  type LinkProjectResult,
} from '@insight/language';

if (parentPort === null) throw new Error('Diagram Viz worker requires a parent port');

const viz = instance();

parentPort.on('message', async (message: any) => {
  try {
    let value;
    if (message.kind === 'query' || message.kind === 'select-query') {
      const linked = linkedResult(message.result);
      const result = executeQuery(linked, message.scope, message.query, message.parameters);
      if (message.kind === 'select-query' || result.kind === 'table') value = { result };
      else {
        const dot = renderGraphviz(linked, result.graph, message.theme);
        value = { result, dot, svg: await renderSvg(dot) };
      }
    } else if (message.kind === 'graph') {
      const dot = renderGraphviz(linkedResult(message.result), message.graph, message.theme);
      value = { dot, svg: await renderSvg(dot) };
    } else if (message.kind === 'diff') {
      const dot = renderDiagramDiffGraphviz(
        linkedResult(message.before),
        linkedResult(message.after),
        message.diff,
        message.theme,
      );
      value = { dot, svg: await renderSvg(dot) };
    } else {
      value = { svg: await renderSvg(message.dot) };
    }
    parentPort!.postMessage({ id: message.id, value });
  } catch (cause) {
    parentPort!.postMessage({
      id: message.id,
      error: cause instanceof Error ? cause.message : String(cause),
    });
  }
});

async function renderSvg(dot: string): Promise<string> {
  const renderer = await viz;
  const result = normalizeGraphvizSvgResult(renderer.render(dot, { format: 'svg', engine: 'dot' }));
  if (result.status === 'failure') throw new Error(result.error);
  return makeGraphvizBackgroundsTransparent(result.svg);
}

function linkedResult(value: Omit<LinkProjectResult, 'graph'> & { readonly graphSnapshot: any }): LinkProjectResult {
  const { graphSnapshot, ...plain } = value;
  return { ...plain, graph: IndexedGraph.fromSnapshot(graphSnapshot) };
}
