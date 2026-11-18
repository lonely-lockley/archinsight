import assert from 'node:assert/strict';
import {
  CompletionEngine,
  BUILTIN_VIEW_QUERIES,
  coreLanguageSnapshot,
  createGeneratedInsightSyntaxProvider,
  diffRenderGraphs,
  InsightLanguageService,
  linkProject,
  renderGraphvizArtifact,
  renderDiagramDiffGraphvizArtifact,
  selectGraph,
} from '../build/runtime/index.js';

const completion = new CompletionEngine(createGeneratedInsightSyntaxProvider());

automaticAndExplicitIconsRenderFromTheSharedArtifact();
iconAnnotationsValidateTargetsDuplicatesAndIds();
iconValueCompletionIsBoundedAndCarriesPreviewMetadata();
languageServiceCarriesIconPlacements();
iconAnnotationParticipatesInSemanticDiffWithSourceProvenance();
externalAndDiffElementsUseTheSameIconArtifact();

console.log('technology icon contract fixtures passed');

function automaticAndExplicitIconsRenderFromTheSharedArtifact() {
  const result = link(`
context test

system app
    name = Application
    technology = SvelteKit, TypeScript

    @icon(java)
    service api
        name = API
        technology = Quarkus

    @icon(none)
    container database
        name = Database
        technology = PostgreSQL
`);
  assert.deepEqual(errors(result), []);
  const graph = selectGraph(result, { context: 'test', tab: 'model.ai' });
  const artifact = renderGraphvizArtifact(result, graph, 'dark');
  assert.deepEqual(artifact.icons.map(({ iconId }) => iconId).sort(), ['java', 'svelte']);
  assert.equal(artifact.icons.find(({ iconId }) => iconId === 'svelte')?.color, '#f4f4f4');
  const lightArtifact = renderGraphvizArtifact(result, graph, 'light');
  assert.equal(lightArtifact.icons.find(({ iconId }) => iconId === 'svelte')?.color, '#f4f4f4');
  assert.equal(lightArtifact.icons.find(({ iconId }) => iconId === 'java')?.color, '#f4f4f4');
  const groupedGraph = {
    ...graph,
    groups: [{ owner: 'test/app', elements: ['test/app/api'] }],
  };
  const darkBoundaryArtifact = renderGraphvizArtifact(result, groupedGraph, 'dark');
  assert.equal(darkBoundaryArtifact.icons.find(({ iconId }) => iconId === 'svelte')?.color, '#f4f4f4');
  const lightBoundaryArtifact = renderGraphvizArtifact(result, groupedGraph, 'light');
  assert.equal(lightBoundaryArtifact.icons.find(({ iconId }) => iconId === 'svelte')?.color, '#1e1e1e');
  for (const placement of artifact.icons) {
    assert(artifact.dot.includes(`id="${placement.slotId}"`));
    assert(artifact.dot.includes(`href="#${placement.slotId}"`));
  }
  assert.match(artifact.dot, /rowspan="[2-9]" width="40" height="40" fixedsize="true"/);
}

function iconAnnotationsValidateTargetsDuplicatesAndIds() {
  const result = link(`
context test

@icon(postgresql)
@icon(java)
system app
    name = App

    service api
        name = API
        links:
            @icon(github)
            -> database

    @icon(postgre)
    container database
        name = Database
`);
  const codes = errors(result).map(({ code }) => code).sort();
  assert.deepEqual(codes, ['ICON_ANNOTATION_DUPLICATE', 'ICON_NOT_FOUND', 'ICON_TARGET_NOT_SUPPORTED']);
  assert.match(result.diagnostics.find(({ code }) => code === 'ICON_NOT_FOUND')?.message ?? '', /postgresql/);
  const stableHyphenatedId = link('context test\n\n@icon(dot-net)\nsystem app\n    name = App');
  assert.equal(stableHyphenatedId.diagnostics.some(({ code }) => code === 'ICON_NOT_FOUND'), false);
}

function iconValueCompletionIsBoundedAndCarriesPreviewMetadata() {
  const source = `context test\n\n@icon(postgre`;
  const result = completion.complete({
    sourceName: 'model.ai',
    source,
    cursorOffset: source.length,
    snapshot: coreLanguageSnapshot,
  });
  assert.equal(result.items[0]?.label, 'postgresql');
  assert.equal(result.items[0]?.iconId, 'postgresql');
  assert.equal(result.replacementStartOffset, source.indexOf('postgre'));
  assert(result.items.length <= 50);

  const empty = `context test\n\n@icon(`;
  const curated = completion.complete({
    sourceName: 'model.ai', source: empty, cursorOffset: empty.length, snapshot: coreLanguageSnapshot,
  });
  assert(curated.items.length > 0 && curated.items.length < 20);
  assert.equal(curated.items[0]?.label, 'none');
  assert(curated.items.slice(1).every(({ iconId }) => iconId !== undefined));
  assert.equal(curated.isIncomplete, true);

  const narrowedSource = `context test\n\n@icon(ne`;
  const narrowed = completion.complete({
    sourceName: 'model.ai', source: narrowedSource, cursorOffset: narrowedSource.length, snapshot: coreLanguageSnapshot,
  });
  assert(narrowed.items.some(({ label }) => label === 'dot-net'));
}

function languageServiceCarriesIconPlacements() {
  const service = new InsightLanguageService();
  const rendered = service.linkAndRender({
    sources: [{ sourceName: 'model.ai', source: 'context test\n\nsystem app\n    name = App\n    technology = Java' }],
    scope: { context: 'test', tab: 'model.ai' },
    theme: 'dark',
  });
  assert.equal(rendered.icons[0]?.iconId, 'java');
  assert(rendered.dot.includes(rendered.icons[0]?.slotId ?? 'missing-slot'));
}

function iconAnnotationParticipatesInSemanticDiffWithSourceProvenance() {
  const before = link('context test\n\n@icon(java)\nsystem app\n    name = App');
  const after = link('context test\n\n@icon(kotlin)\nsystem app\n    name = App');
  const diff = diffRenderGraphs(
    selectGraph(before, { context: 'test', tab: 'model.ai' }),
    selectGraph(after, { context: 'test', tab: 'model.ai' }),
  );
  const entry = diff.elements['test/app'];
  assert.equal(entry?.status, 'changed');
  assert(entry?.origins.some(({ semanticPath, precision, sourceName }) =>
    semanticPath?.startsWith('annotations.') && precision === 'exact' && sourceName === 'model.ai'));
}

function externalAndDiffElementsUseTheSameIconArtifact() {
  const externalResult = linkProject({
    snapshot: coreLanguageSnapshot,
    sources: [
      { sourceName: 'external.ai', source: 'context external\n\nexternal system database\n    name = Database\n    technology = PostgreSQL' },
      { sourceName: 'model.ai', source: 'context test\n\nimport database from context external\n\nsystem app\n    name = App\n    links:\n        -> database' },
    ],
  });
  assert.deepEqual(errors(externalResult), []);
  const externalArtifact = renderGraphvizArtifact(
    externalResult,
    selectGraph(externalResult, { context: 'test', tab: 'model.ai', view: 'c1' }, BUILTIN_VIEW_QUERIES.c1),
    'light',
  );
  assert(externalArtifact.icons.some(({ iconId }) => iconId === 'postgresql'));

  const before = link('context test\n\nsystem app\n    name = App\n    technology = Unknown internal runtime');
  const after = link('context test\n\nsystem app\n    name = App\n    technology = Java');
  const beforeGraph = selectGraph(before, { context: 'test', tab: 'model.ai' });
  const afterGraph = selectGraph(after, { context: 'test', tab: 'model.ai' });
  const diff = diffRenderGraphs(beforeGraph, afterGraph);
  const diffArtifact = renderDiagramDiffGraphvizArtifact(before, after, diff, 'dark');
  assert.equal(diffArtifact.icons[0]?.iconId, 'java');
  assert(!renderGraphvizArtifact(before, beforeGraph, 'dark').dot.includes('icon-slot'));
}

function link(source) {
  return linkProject({
    snapshot: coreLanguageSnapshot,
    sources: [{ sourceName: 'model.ai', source }],
  });
}

function errors(result) {
  return result.diagnostics.filter(({ level }) => level === undefined || level === 'ERROR');
}
