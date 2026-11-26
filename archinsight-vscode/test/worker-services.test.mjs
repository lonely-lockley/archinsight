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

test('project analysis worker keeps projections after infrastructure and logical edits and undo', async () => {
  const worker = new Worker(path.join(extensionRoot, 'dist', 'project-analysis-worker.cjs'));
  try {
    const initial = deploymentProjectionSources();
    const full = await request(worker, { id: 1, kind: 'project', root: 'projection-cache', sources: initial });
    assert.equal(full.mode, 'full');
    assertMonitoringProjection(full);

    const infrastructureEdit = replaceSource(initial, 'infra/r1.ai', (source) =>
      source.replace('name = Prometheus', 'name = Prometheus X'));
    const afterInfrastructureEdit = await request(worker, {
      id: 2,
      kind: 'project',
      root: 'projection-cache',
      sources: infrastructureEdit,
    });
    assert.equal(afterInfrastructureEdit.mode, 'incremental');
    assertMonitoringProjection(afterInfrastructureEdit);

    const afterInfrastructureUndo = await request(worker, {
      id: 3,
      kind: 'project',
      root: 'projection-cache',
      sources: initial,
    });
    assert.equal(afterInfrastructureUndo.mode, 'incremental');
    assertMonitoringProjection(afterInfrastructureUndo);

    const logicalEdit = replaceSource(initial, 'shop.ai', (source) =>
      source.replace('name = API', 'name = API X'));
    const afterLogicalEdit = await request(worker, {
      id: 4,
      kind: 'project',
      root: 'projection-cache',
      sources: logicalEdit,
    });
    assert.equal(afterLogicalEdit.mode, 'incremental');
    assertMonitoringProjection(afterLogicalEdit);

    const afterLogicalUndo = await request(worker, {
      id: 5,
      kind: 'project',
      root: 'projection-cache',
      sources: initial,
    });
    assert.equal(afterLogicalUndo.mode, 'incremental');
    assertMonitoringProjection(afterLogicalUndo);
  } finally {
    await worker.terminate();
  }
});

test('diagram worker renders Graphviz outside the extension host', async () => {
  const worker = new Worker(path.join(extensionRoot, 'dist', 'diagram-viz-worker.mjs'));
  try {
    const response = await request(worker, {
      id: 1,
      kind: 'dot',
      dot: 'digraph { a [shape=plain,label=<<table border="0"><tr><td href="#slot-one" tooltip=" " bgcolor="transparent" width="40" height="40" fixedsize="true"> </td><td>App</td></tr></table>>] }',
      icons: [{ slotId: 'slot-one', iconId: 'postgresql', color: '#f4f4f4' }],
    });
    assert.equal(response.error, undefined);
    assert.match(response.value.svg, /<svg\b/);
    assert.match(response.value.svg, /class="technology-icon"/);
    assert.doesNotMatch(response.value.svg, /href="#slot-one"/);
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

function assertMonitoringProjection(response) {
  assert(response.analysis.graph.relations.some((relation) =>
    relation.kind === 'REFERENCES'
    && relation.source === 'r1/prom_r1'
    && relation.target === 'shop/api'
    && relation.projected === true
  ));
}

function replaceSource(sources, sourceName, transform) {
  return sources.map((item) => item.sourceName === sourceName
    ? { ...item, source: transform(item.source) }
    : item);
}

function deploymentProjectionSources() {
  return [
    {
      sourceName: 'framework.ai',
      source: `extend type Environment
    Compute compute
    Monitoring observability

define type Monitoring of InfrastructureComponent
    constructor monitoring
`,
    },
    {
      sourceName: 'infra/r1.ai',
      source: `environment r1
    name = Region 1

deployment production
    compute:
        compute k8s_r1
            name = K8s r1
    observability:
        monitoring prom_r1
            name = Prometheus
            runsOn:
                k8s_r1
            route:
                $this connectTo $from
`,
    },
    {
      sourceName: 'shop.ai',
      source: `context shop

deploymentProfile everywhere
    appliesTo:
        production from r1
    runsOn compute
    uses observability

system shop_sys
    name = Shop
    service api
        name = API
        deployment:
            uses everywhere
`,
    },
  ];
}
