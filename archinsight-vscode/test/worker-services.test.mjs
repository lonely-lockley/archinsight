import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { Worker } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';

const extensionRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('project analysis worker owns full and incremental session state', async () => {
  const worker = new Worker(path.join(extensionRoot, 'dist', 'project-analysis-worker.cjs'));
  try {
    const full = await request(worker, { id: 1, root: 'worker-smoke', sources: [] });
    assert.equal(full.error, undefined);
    assert.equal(full.mode, 'full');
    assert(full.analysis.graph.nodes.length > 0);
    const unchanged = await request(worker, { id: 2, root: 'worker-smoke', sources: [] });
    assert.equal(unchanged.mode, 'unchanged');
  } finally {
    await worker.terminate();
  }
});

test('project analysis worker links immutable revisions without mutating the live session', async () => {
  const worker = new Worker(path.join(extensionRoot, 'dist', 'project-analysis-worker.cjs'));
  try {
    const full = await request(worker, { id: 1, kind: 'project', root: 'worker-smoke', sources: [] });
    assert.equal(full.mode, 'full');
    const revision = await request(worker, { id: 2, kind: 'revision', sources: [] });
    assert.equal(revision.mode, 'full');
    const unchanged = await request(worker, { id: 3, kind: 'project', root: 'worker-smoke', sources: [] });
    assert.equal(unchanged.mode, 'unchanged');
  } finally {
    await worker.terminate();
  }
});

test('diagram worker renders Graphviz outside the extension host', async () => {
  const worker = new Worker(path.join(extensionRoot, 'dist', 'diagram-viz-worker.cjs'));
  try {
    const response = await request(worker, { id: 1, kind: 'dot', dot: 'digraph { a -> b }' });
    assert.equal(response.error, undefined);
    assert.match(response.value.svg, /<svg\b/);
  } finally {
    await worker.terminate();
  }
});

function request(worker, message) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('worker response timed out')), 10_000);
    const onMessage = (response) => {
      if (response.id !== message.id) return;
      clearTimeout(timeout);
      worker.off('message', onMessage);
      resolve(response);
    };
    worker.on('message', onMessage);
    worker.postMessage(message);
  });
}
