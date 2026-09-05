import assert from 'node:assert/strict';
import test from 'node:test';
import { DiagramSession, fileNameWithExtension } from '../src/diagram-session.ts';
import { makeGraphvizBackgroundsTransparent } from '../src/diagram-svg.ts';
import { previewHtml } from '../src/preview-webview.ts';

test('renders through one query and environment state machine', async () => {
  const harness = createHarness({ environment: 'prod' });
  const session = harness.session();

  const status = await session.render({ fileName: 'main.ai', source: 'source' }, {
    view: 'deployment-container',
    query: 'deployment query',
  });

  assert.equal(status, 'rendered');
  assert.deepEqual(session.queryState(), {
    view: 'deployment-container',
    query: 'deployment query',
    environment: 'prod',
  });
  assert.equal(session.previewState()?.svg, '<svg>deployment query</svg>');
  assert.deepEqual(harness.environmentRequests, [{ selected: undefined, forcePicker: false }]);
  assert.equal(harness.queryChanges.length, 1);
  assert.equal(harness.publishedQueries.length, 1);
  assert.equal(harness.previews.length, 1);
});

test('cancelled environment selection preserves the previous query and republishes it', async () => {
  const harness = createHarness({ cancelled: true });
  const session = harness.session();

  const status = await session.render({ fileName: 'main.ai', source: 'source' }, {
    view: 'deployment-container',
    query: 'new query',
    forceEnvironmentPicker: true,
  });

  assert.equal(status, 'cancelled');
  assert.deepEqual(session.queryState(), { view: 'c1', query: 'initial query' });
  assert.deepEqual(harness.publishedQueries, [{ view: 'c1', query: 'initial query' }]);
  assert.equal(harness.previews.length, 0);
  assert.deepEqual(harness.environmentRequests, [{ selected: undefined, forcePicker: true }]);
});

test('query changes survive unavailable input without inventing a preview', async () => {
  const harness = createHarness();
  const session = harness.session();

  assert.equal(await session.render(undefined, { view: 'c2', query: 'next query' }), 'unavailable');
  assert.deepEqual(session.queryState(), { view: 'c2', query: 'next query' });
  assert.equal(session.previewState(), undefined);
  assert.deepEqual(harness.queryChanges, [{ view: 'c2', query: 'next query' }]);
  assert.deepEqual(harness.publishedQueries, [{ view: 'c2', query: 'next query' }]);
});

test('refresh reuses explicitly updated query state without emitting query-change events', async () => {
  const harness = createHarness({ environment: 'prod' });
  const session = harness.session();
  const input = { fileName: 'main.ai', source: 'source' };

  await session.render(input, { view: 'deployment-container', query: 'first' });
  session.setQueryState('c2', 'refreshed');
  const changesBeforeRefresh = harness.queryChanges.length;

  assert.equal(await session.refresh(input), 'rendered');
  assert.deepEqual(session.queryState(), { view: 'c2', query: 'refreshed', environment: 'prod' });
  assert.equal(harness.queryChanges.length, changesBeforeRefresh);
  assert.equal(harness.previews.at(-1).query, 'refreshed');
});

test('newer renders and disposal suppress stale asynchronous results', async () => {
  let finishSlow;
  const slow = new Promise((resolve) => {
    finishSlow = resolve;
  });
  const harness = createHarness({ slow });
  const session = harness.session();
  const input = { fileName: 'main.ai', source: 'source' };

  const first = session.render(input, { view: 'c1', query: 'slow' });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(await session.render(input, { view: 'c2', query: 'fast' }), 'rendered');
  finishSlow();
  assert.equal(await first, 'stale');
  assert.deepEqual(harness.previews.map((state) => state.query), ['fast']);

  let finishDisposed;
  const disposedSlow = new Promise((resolve) => {
    finishDisposed = resolve;
  });
  const disposedHarness = createHarness({ slow: disposedSlow });
  const disposedSession = disposedHarness.session();
  const disposedRender = disposedSession.render(input, { view: 'c3', query: 'slow' });
  await new Promise((resolve) => setImmediate(resolve));
  disposedSession.dispose();
  finishDisposed();
  assert.equal(await disposedRender, 'stale');
  assert.equal(await disposedSession.render(input, { view: 'c4', query: 'ignored' }), 'stale');
});

test('downloads source, SVG, DOT, and webview-produced PNG through shared behavior', async () => {
  const harness = createHarness();
  const session = harness.session();
  await session.render({ fileName: 'main.ai', source: 'render source' }, { view: 'c1', query: 'query' });

  assert.equal(await session.download('source', { fileName: 'live.ai', source: 'live source' }), true);
  assert.equal(await session.download('svg'), true);
  assert.equal(await session.download('dot'), true);
  const png = session.download('png');
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(harness.pngRequests, ['<svg>query</svg>']);
  session.resolvePng('data:image/png;base64,cG5n');
  assert.equal(await png, true);

  assert.deepEqual(harness.saved.map(({ fileName }) => fileName), [
    'live.ai',
    'main.svg',
    'main.dot',
    'main.png',
  ]);
  assert.equal(Buffer.from(harness.saved[0].content).toString('utf8'), 'live source');
  assert.equal(Buffer.from(harness.saved[3].content).toString('utf8'), 'png');
});

test('reports unavailable artifacts and rejects failed or superseded PNG requests', async () => {
  const harness = createHarness({ omitArtifacts: true });
  const session = harness.session();

  assert.equal(await session.download('source'), false);
  assert.equal(await session.download('svg'), false);
  assert.deepEqual(harness.warnings, ['No rendered diagram is available.']);

  await session.render({ fileName: 'main.ai', source: 'source' }, { view: 'c1', query: 'query' });
  assert.equal(await session.download('svg'), false);
  assert.equal(await session.download('dot'), false);
  assert.equal(await session.download('png'), false);
  assert.deepEqual(harness.warnings.slice(1), [
    'No rendered SVG is available.',
    'No rendered DOT is available.',
    'No rendered diagram is available.',
  ]);

  const pngHarness = createHarness();
  const pngSession = pngHarness.session();
  await pngSession.render({ fileName: 'main.ai', source: 'source' }, { view: 'c1', query: 'query' });
  const first = pngSession.download('png');
  const firstRejected = assert.rejects(first, /PNG export was superseded/);
  const second = pngSession.download('png');
  await firstRejected;
  pngSession.resolvePng('invalid');
  await assert.rejects(second, /PNG export failed/);

  const third = pngSession.download('png');
  pngSession.dispose('Preview closed');
  await assert.rejects(third, /Preview closed/);
  pngSession.dispose();

  const failedHarness = createHarness({ requestPngError: new Error('webview unavailable') });
  const failedSession = failedHarness.session();
  await failedSession.render({ fileName: 'main.ai', source: 'source' }, { view: 'c1', query: 'query' });
  await assert.rejects(failedSession.download('png'), /webview unavailable/);
});

test('normalizes artifact file extensions', () => {
  assert.equal(fileNameWithExtension('model.ai', '.svg'), 'model.svg');
  assert.equal(fileNameWithExtension('MODEL.AI', '.dot'), 'MODEL.dot');
  assert.equal(fileNameWithExtension('model', '.png'), 'model.png');
});

test('keeps VS Code Graphviz backgrounds transparent without changing node polygons', () => {
  const svg = [
    '<svg>',
    '<g class="graph"><polygon fill="white" stroke="black" points="0,0"/></g>',
    '<g class="cluster"><polygon fill="white" stroke="blue" points="1,1"/></g>',
    '<g class="node"><polygon fill="red" stroke="green" points="2,2"/></g>',
    '</svg>',
  ].join('');

  const transparent = makeGraphvizBackgroundsTransparent(svg);
  assert.match(transparent, /class="graph"><polygon fill="transparent" stroke="transparent"/);
  assert.match(transparent, /class="cluster"><polygon fill="transparent" stroke="blue"/);
  assert.match(transparent, /class="node"><polygon fill="red" stroke="green"/);

  const missingAttributes = makeGraphvizBackgroundsTransparent(
    '<g class="graph"><polygon points="0,0"/></g>',
  );
  assert.match(missingAttributes, /<polygon points="0,0" fill="transparent" stroke="transparent"\/>/);
});

test('standalone preview HTML keeps its message and content security contract', () => {
  const html = previewHtml();
  const nonce = /script-src 'nonce-([^']+)'/.exec(html)?.[1];

  assert.equal(nonce?.length, 24);
  assert.match(html, new RegExp(`<script nonce="${nonce}">`));
  assert.match(html, /default-src 'none'/);
  assert.match(html, /error\.textContent = state\.error/);
  assert.match(html, /command: "ready"/);
  assert.match(html, /command: "png", dataUrl/);
});

function createHarness(options = {}) {
  const previews = [];
  const queryChanges = [];
  const publishedQueries = [];
  const environmentRequests = [];
  const saved = [];
  const warnings = [];
  const pngRequests = [];

  return {
    previews,
    queryChanges,
    publishedQueries,
    environmentRequests,
    saved,
    warnings,
    pngRequests,
    session: () => new DiagramSession({ view: 'c1', query: 'initial query' }, {
      usesEnvironment: (view) => view === 'deployment-container',
      chooseEnvironment: async (_input, selected, forcePicker) => {
        environmentRequests.push({ selected, forcePicker });
        return options.cancelled
          ? { cancelled: true }
          : { cancelled: false, environment: options.environment };
      },
      buildPreview: async (input, state) => {
        if (state.query === 'slow') {
          await options.slow;
        }
        return {
          ...state,
          fileName: input.fileName,
          source: input.source,
          ...(options.omitArtifacts ? {} : {
            svg: `<svg>${state.query}</svg>`,
            dot: `digraph { "${state.query}" }`,
          }),
        };
      },
      publishPreview: async (state) => {
        previews.push(state);
      },
      publishQuery: async (state) => {
        publishedQueries.push(state);
      },
      onQueryChanged: async (state) => {
        queryChanges.push(state);
      },
      save: async (fileName, content) => {
        saved.push({ fileName, content });
      },
      warn: (message) => {
        warnings.push(message);
      },
      requestPng: async (svg) => {
        pngRequests.push(svg);
        if (options.requestPngError !== undefined) {
          throw options.requestPngError;
        }
      },
      decodePng: (dataUrl) => {
        const encoded = /^data:image\/png;base64,(.+)$/.exec(dataUrl)?.[1];
        return encoded === undefined ? undefined : Buffer.from(encoded, 'base64');
      },
    }),
  };
}
