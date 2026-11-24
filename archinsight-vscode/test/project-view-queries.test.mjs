import assert from 'node:assert/strict';
import test from 'node:test';
import { ProjectViewQueryCatalog } from '../src/project-view-queries.ts';

const graphQuery = (id) => `MATCH (element:Element {id: '${id}'})\nRETURN element`;
const builtinQueries = {
  'no-filter': 'builtin no-filter',
  c1: 'builtin c1',
  c2: 'builtin c2',
  c3: 'builtin c3',
  c4: 'builtin c4',
  'deployment-system': 'builtin deployment-system',
  'deployment-container': 'builtin deployment-container',
  deployment: 'builtin deployment',
};
const dependencies = {
  builtinQueries,
  resultKind: (query) => query.includes('RETURN TABLE') ? 'table' : 'graph',
};

test('reserved AIQ basenames override built-in views at any project depth', () => {
  const c2 = graphQuery('custom-c2');
  const deployment = graphQuery('custom-deployment');
  const catalog = new ProjectViewQueryCatalog([
    { sourceName: 'views/c2.aiq', source: c2 },
    { sourceName: 'architecture/deep/deployment-container.aiq', source: deployment },
    { sourceName: 'views/impact.aiq', source: graphQuery('impact') },
    { sourceName: 'views/C1.AIQ', source: graphQuery('wrong-case') },
  ], dependencies);

  assert.deepEqual(catalog.resolve('c2'), { query: c2, overridePath: 'views/c2.aiq' });
  assert.deepEqual(catalog.resolve('deployment-container'), {
    query: deployment,
    overridePath: 'architecture/deep/deployment-container.aiq',
  });
  assert.deepEqual(catalog.resolve('c1'), { query: builtinQueries.c1 });
  assert.equal(catalog.webviewQueries().c2, c2);
  assert.equal(catalog.webviewQueries().c1, builtinQueries.c1);
  assert.equal(catalog.matches([
    { sourceName: 'views/c2.aiq', source: c2 },
    { sourceName: 'architecture/deep/deployment-container.aiq', source: deployment },
    { sourceName: 'views/impact.aiq', source: graphQuery('impact') },
    { sourceName: 'views/C1.AIQ', source: graphQuery('wrong-case') },
  ]), true);
  assert.equal(catalog.matches([{ sourceName: 'views/c2.aiq', source: c2 }]), false);
  assert.equal(catalog.matches([
    { sourceName: 'views/c2.aiq', source: graphQuery('changed') },
    { sourceName: 'architecture/deep/deployment-container.aiq', source: deployment },
    { sourceName: 'views/impact.aiq', source: graphQuery('impact') },
    { sourceName: 'views/C1.AIQ', source: graphQuery('wrong-case') },
  ]), false);
});

test('replacing the catalogue applies edits and restores the built-in after deletion', () => {
  const first = graphQuery('first');
  const second = graphQuery('second');

  assert.equal(new ProjectViewQueryCatalog([
    { sourceName: 'views/c3.aiq', source: first },
  ], dependencies).resolve('c3').query, first);
  assert.equal(new ProjectViewQueryCatalog([
    { sourceName: 'views/c3.aiq', source: second },
  ], dependencies).resolve('c3').query, second);
  assert.equal(new ProjectViewQueryCatalog([], dependencies).resolve('c3').query, builtinQueries.c3);
});

test('duplicate reserved basenames fail deterministically instead of choosing a file', () => {
  const catalog = new ProjectViewQueryCatalog([
    { sourceName: 'z/c1.aiq', source: graphQuery('z') },
    { sourceName: 'a/c1.aiq', source: graphQuery('a') },
  ], dependencies);

  assert.throws(
    () => catalog.resolve('c1'),
    /Query name 'c1' is ambiguous: a\/c1\.aiq, z\/c1\.aiq/,
  );
  assert.equal(catalog.webviewQueries().c1, builtinQueries.c1);
});

test('a reserved override cannot replace a diagram with a table report', () => {
  const catalog = new ProjectViewQueryCatalog([{
    sourceName: 'reports/c4.aiq',
    source: 'MATCH (element:Element) RETURN TABLE elementId(element) AS id',
  }], dependencies);

  assert.throws(
    () => catalog.resolve('c4'),
    /Built-in view override 'c4' must return a graph/,
  );
  assert.equal(catalog.webviewQueries().c4, builtinQueries.c4);
});
