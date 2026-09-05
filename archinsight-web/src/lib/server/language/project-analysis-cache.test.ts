import { beforeEach, describe, expect, it } from 'vitest';
import {
  CompletionEngine,
  createGeneratedInsightSyntaxProvider,
  type LanguageSnapshot,
  type LinkProjectResult
} from '@insight/language';
import { analysisMetricsSnapshot, resetAnalysisMetrics } from './analysis-observability';
import { ProjectAnalysisCache } from './project-analysis-cache';
import { parseAnalysisCacheConfig } from '$lib/server/config/analysis-cache-config';

const env = { NODE_ENV: 'test' };

describe('project analysis cache', () => {
  beforeEach(() => resetAnalysisMetrics());

  it('links one stored revision once and reuses it for later queries', async () => {
    const cache = new ProjectAnalysisCache();
    const sources = model('API');

    const first = await cache.analyze('owner:a\0project:p', sources, {}, env);
    const second = await cache.analyze('owner:a\0project:p', sources, {}, env);

    expect(first.mode).toBe('full');
    expect(second.mode).toBe('cache-hit');
    expect(second.revision).toBe(first.revision);
    expect(analysisMetricsSnapshot()).toMatchObject({
      fullSnapshotBuilds: 1,
      fullProjectLinks: 1,
      cacheHits: 1,
      cacheMisses: 1
    });
  });

  it('discards one project entry and rebuilds a forced analysis from a fresh session', async () => {
    const cache = new ProjectAnalysisCache();
    const key = 'owner:a\0project:p';
    const sources = model('API');
    await cache.analyze(key, sources, {}, env);

    const refreshed = await cache.analyze(key, sources, {}, env, { forceFullAnalysis: true });
    const reused = await cache.analyze(key, sources, {}, env);

    expect(refreshed.mode).toBe('full');
    expect(reused.mode).toBe('cache-hit');
    expect(cache.size()).toBe(1);
    expect(analysisMetricsSnapshot()).toMatchObject({
      fullSnapshotBuilds: 2,
      fullProjectLinks: 2,
      cacheHits: 1,
      cacheMisses: 2
    });
  });

  it('fully links forced overlays and leaves them out of the stored project cache', async () => {
    const cache = new ProjectAnalysisCache();
    const key = 'owner:a\0project:p';
    const sources = model('Stored API');
    await cache.analyze(key, sources, {}, env);

    const refreshed = await cache.analyze(key, sources, {
      'main.ai': source('Unsaved API')
    }, env, { forceFullAnalysis: true });

    expect(refreshed.mode).toBe('overlay-full');
    expect(refreshed.relinkedSources).toBe(1);
    expect(elementName(refreshed.result)).toBe('Unsaved API');
    expect(cache.size()).toBe(0);
    expect(analysisMetricsSnapshot()).toMatchObject({
      fullSnapshotBuilds: 2,
      fullProjectLinks: 2,
      incrementalSourceUpdates: 0
    });
  });

  it('keeps other owner and project entries when one analysis is forced', async () => {
    const cache = new ProjectAnalysisCache();
    const refreshedKey = 'owner:a\0project:same';
    const untouchedKey = 'owner:b\0project:same';
    await cache.analyze(refreshedKey, model('Owner A'), {}, env);
    await cache.analyze(untouchedKey, model('Owner B'), {}, env);

    await cache.analyze(refreshedKey, model('Owner A'), {}, env, { forceFullAnalysis: true });
    const untouched = await cache.analyze(untouchedKey, model('Owner B'), {}, env);

    expect(untouched.mode).toBe('cache-hit');
    expect(elementName(untouched.result)).toBe('Owner B');
    expect(cache.size()).toBe(2);
  });

  it('keeps browser overlays transient and out of the stored project state', async () => {
    const cache = new ProjectAnalysisCache();
    const sources = model('Stored API');

    const overlay = await cache.analyze('owner:a\0project:p', sources, {
      'main.ai': source('Unsaved API')
    }, env);
    const stored = await cache.analyze('owner:a\0project:p', sources, {}, env);

    expect(elementName(overlay.result)).toBe('Unsaved API');
    expect(elementName(stored.result)).toBe('Stored API');
    expect(cache.size()).toBe(1);
  });

  it('does not mix concurrent overlay analyses for the same stored project', async () => {
    const cache = new ProjectAnalysisCache();
    const sources = model('Stored API');

    const [left, right] = await Promise.all([
      cache.analyze('owner:a\0project:p', sources, { 'main.ai': source('Left draft') }, env),
      cache.analyze('owner:a\0project:p', sources, { 'main.ai': source('Right draft') }, env)
    ]);
    const stored = await cache.analyze('owner:a\0project:p', sources, {}, env);

    expect(elementName(left.result)).toBe('Left draft');
    expect(elementName(right.result)).toBe('Right draft');
    expect(elementName(stored.result)).toBe('Stored API');
  });

  it('isolates stored states by owner and project cache key', async () => {
    const cache = new ProjectAnalysisCache();

    const ownerA = await cache.analyze('owner:a\0project:same', model('Owner A'), {}, env);
    const ownerB = await cache.analyze('owner:b\0project:same', model('Owner B'), {}, env);

    expect(elementName(ownerA.result)).toBe('Owner A');
    expect(elementName(ownerB.result)).toBe('Owner B');
    expect(cache.size()).toBe(2);
  });

  it('keeps incremental edits, additions, removals, and renames equivalent to a clean link', async () => {
    const cache = new ProjectAnalysisCache();
    const key = 'owner:a\0project:p';
    let sources = model('API');
    await cache.analyze(key, sources, {}, env);

    sources = new Map(sources);
    sources.set('main.ai', source('Backend'));
    await expectEquivalentToClean(cache, key, sources, 'incremental');

    sources = new Map(sources);
    sources.set('extra.ai', 'context demo\n\nsystem worker\n    name = Worker\n');
    await expectEquivalentToClean(cache, key, sources, 'incremental');

    sources = new Map(sources);
    sources.set('renamed.ai', sources.get('extra.ai')!);
    sources.delete('extra.ai');
    await expectEquivalentToClean(cache, key, sources, 'incremental');

    sources = new Map(sources);
    sources.delete('renamed.ai');
    await expectEquivalentToClean(cache, key, sources, 'incremental');
  });

  it('performs a full rebuild when project definitions change', async () => {
    const cache = new ProjectAnalysisCache();
    const key = 'owner:a\0project:p';
    const initial = new Map([
      ['definitions.ai', definition('customSystem')],
      ['main.ai', 'context demo\n\ncustomSystem app\n    name = App\n']
    ]);
    await cache.analyze(key, initial, {}, env);
    const changed = new Map(initial);
    changed.set('definitions.ai', definition('application'));

    const result = await cache.analyze(key, changed, {}, env);

    expect(result.mode).toBe('full');
    expect(analysisMetricsSnapshot().fullProjectLinks).toBe(2);
    expect(result.snapshotBuild.snapshot.constructors.some((item) => item.spelling === 'application')).toBe(true);
  });

  it('uses definition overlays for deployment slot completion without changing the stored snapshot', async () => {
    const cache = new ProjectAnalysisCache();
    const key = 'owner:a\0project:p';
    const sources = new Map([
      ['definitions.ai', deploymentDefinitions('internalNetwork')],
      ['main.ai', 'context application\n\nsystem backend\n    name = Backend\n']
    ]);
    await cache.analyze(key, sources, {}, env);

    const overlay = await cache.analyze(key, sources, {
      'definitions.ai': deploymentDefinitions('messageBroker')
    }, env);
    const stored = await cache.analyze(key, sources, {}, env);

    expect(overlay.mode).toBe('overlay-full');
    expect(deploymentSlotCompletions(overlay.snapshotBuild.snapshot)).toContain('messageBroker');
    expect(deploymentSlotCompletions(overlay.snapshotBuild.snapshot)).not.toContain('internalNetwork');
    expect(deploymentSlotCompletions(stored.snapshotBuild.snapshot)).toContain('internalNetwork');
    expect(deploymentSlotCompletions(stored.snapshotBuild.snapshot)).not.toContain('messageBroker');
  });

  it('evicts least-recently-used states at the configured entry bound', async () => {
    const boundedEnv = { ...env, ARCHINSIGHT_ANALYSIS_CACHE_MAX_ENTRIES: '1' };
    const cache = new ProjectAnalysisCache(parseAnalysisCacheConfig(boundedEnv));
    await cache.analyze('owner:a\0project:one', model('One'), {}, boundedEnv);
    await cache.analyze('owner:a\0project:two', model('Two'), {}, boundedEnv);
    expect(cache.size()).toBe(1);
  });
});

async function expectEquivalentToClean(
  cache: ProjectAnalysisCache,
  key: string,
  sources: ReadonlyMap<string, string>,
  expectedMode: 'incremental'
) {
  const incremental = await cache.analyze(key, sources, {}, env);
  const clean = await new ProjectAnalysisCache().analyze('clean', sources, {}, env);
  expect(incremental.mode).toBe(expectedMode);
  expect(resultShape(incremental.result)).toEqual(resultShape(clean.result));
}

function model(name: string): Map<string, string> {
  return new Map([['main.ai', source(name)]]);
}

function source(name: string): string {
  return `context demo

system app
    name = ${name}
`;
}

function definition(constructor: string): string {
  return `define type CustomSystem of System
    constructor ${constructor}
`;
}

function deploymentDefinitions(slot: string): string {
  return `define type ApplicationEnvironment of Environment
    NetworkConnection ${slot}
`;
}

function deploymentSlotCompletions(snapshot: LanguageSnapshot): string[] {
  const sourceWithCursor = `context consumer

import backend from context application

system client
    name = Client
    links:
        ~> backend
            deployment:
                uses __CURSOR__
`;
  const cursorOffset = sourceWithCursor.indexOf('__CURSOR__');
  const source = sourceWithCursor.replace('__CURSOR__', '');
  const result = new CompletionEngine(createGeneratedInsightSyntaxProvider()).complete({
    sourceName: 'consumer.ai',
    source,
    cursorOffset,
    snapshot,
    contextIds: ['application', 'consumer'],
    indexedIdentifiers: new Map([
      ['backend', { label: 'backend', type: 'System', imported: true }]
    ])
  });
  return result.items.map((item) => item.label);
}

function elementName(result: LinkProjectResult): string | undefined {
  return result.elements.find((element) => element.localId === 'app')?.attributes.name?.[0];
}

function resultShape(result: LinkProjectResult) {
  return {
    diagnostics: [...result.diagnostics].map((item) => ({ ...item })).sort(byJson),
    contexts: [...result.contexts].map((item) => ({ ...item })).sort(byJson),
    elements: [...result.elements].map((item) => ({ ...item })).sort(byJson),
    imports: [...result.imports].map((item) => ({ ...item })).sort(byJson),
    edges: [...result.edges].map((item) => ({ ...item })).sort(byJson),
    tabRoots: result.tabRoots,
    graphNodes: [...result.graph.nodes()].sort(byJson),
    graphRelations: [...result.graph.relations()].sort(byJson)
  };
}

function byJson(left: unknown, right: unknown): number {
  return JSON.stringify(left).localeCompare(JSON.stringify(right));
}
