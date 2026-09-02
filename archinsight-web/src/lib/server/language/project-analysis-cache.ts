import { createHash } from 'node:crypto';
import {
  coreLanguageSnapshot,
  InsightLanguageService,
  type LanguageBuildResult,
  type LinkProjectResult,
  type ProjectAnalysis as LanguageProjectAnalysis,
  type ProjectAnalysisSession,
  type ProjectSource
} from '@insight/language';
import type { EnvSource } from '$lib/server/auth/auth-config';
import {
  incrementAnalysisMetric,
  observeAnalysis
} from './analysis-observability';

export type ProjectAnalysis = {
  revision: string;
  snapshotBuild: LanguageBuildResult;
  result: LinkProjectResult;
  mode: 'full' | 'cache-hit' | 'incremental' | 'overlay-incremental' | 'overlay-full';
  relinkedSources: number;
};

type AnalysisEntry = {
  key: string;
  revision: string;
  coreVersion: string;
  sources: Map<string, string>;
  sourceBytes: number;
  session: ProjectAnalysisSession;
  lastAccess: number;
};

type StoredAnalysis = {
  entry: AnalysisEntry;
  mode: 'full' | 'cache-hit' | 'incremental';
  relinkedSources: number;
};

type CacheConfig = {
  maxEntries: number;
  ttlMs: number;
  maxEntrySourceBytes: number;
  maxTotalSourceBytes: number;
};

type SourceChange = {
  sourceName: string;
  previous?: string;
  next?: string;
};

const service = new InsightLanguageService({ snapshot: coreLanguageSnapshot });
const coreVersion = digest(JSON.stringify(coreLanguageSnapshot));

export class ProjectAnalysisCache {
  private readonly entries = new Map<string, AnalysisEntry>();
  private readonly pending = new Map<string, Promise<void>>();

  async analyze(
    key: string,
    storedSources: ReadonlyMap<string, string>,
    overlays: Readonly<Record<string, string>>,
    env?: EnvSource
  ): Promise<ProjectAnalysis> {
    const base = await this.serialized(key, () => this.analyzeStored(key, storedSources, env));
    return this.applyOverlays(base, overlays, env);
  }

  clear(): void {
    this.entries.clear();
    this.pending.clear();
  }

  size(): number {
    return this.entries.size;
  }

  private async serialized<T>(key: string, action: () => T | Promise<T>): Promise<T> {
    const previous = this.pending.get(key) ?? Promise.resolve();
    const task = previous.catch(() => undefined).then(action);
    const completion = task.then(() => undefined, () => undefined);
    this.pending.set(key, completion);
    try {
      return await task;
    } finally {
      if (this.pending.get(key) === completion) {
        this.pending.delete(key);
      }
    }
  }

  private analyzeStored(
    key: string,
    requestedSources: ReadonlyMap<string, string>,
    env?: EnvSource
  ): StoredAnalysis {
    const started = performance.now();
    const config = cacheConfig(env);
    const now = Date.now();
    this.prune(config, now);
    const sources = normalizedSources(requestedSources);
    const revision = sourceRevision(sources);
    const previous = this.entries.get(key);

    if (previous?.revision === revision && previous.coreVersion === coreVersion) {
      previous.lastAccess = now;
      touch(this.entries, key, previous);
      incrementAnalysisMetric('cacheHits');
      observeAnalysis(env, 'language.analysis', {
        mode: 'cache-hit',
        sourceCount: sources.size,
        durationMs: elapsed(started)
      });
      return { entry: previous, mode: 'cache-hit', relinkedSources: 0 };
    }

    incrementAnalysisMetric('cacheMisses');
    const changes = previous === undefined ? [] : sourceChanges(previous.sources, sources);
    let stored: StoredAnalysis;
    if (
      previous !== undefined
      && previous.coreVersion === coreVersion
      && changes.length > 0
    ) {
      stored = this.incrementalEntry(previous, sources, revision, changes, now, env);
    } else {
      stored = {
        entry: this.fullEntry(key, sources, revision, now, env),
        mode: 'full',
        relinkedSources: 0
      };
    }

    const { entry } = stored;
    if (entry.sourceBytes <= config.maxEntrySourceBytes) {
      this.entries.set(key, entry);
      touch(this.entries, key, entry);
      this.prune(config, now);
    } else {
      this.entries.delete(key);
    }
    observeAnalysis(env, 'language.analysis', {
      mode: stored.mode,
      sourceCount: sources.size,
      changedSources: changes.length,
      durationMs: elapsed(started)
    });
    return stored;
  }

  private fullEntry(
    key: string,
    sources: Map<string, string>,
    revision: string,
    now: number,
    env?: EnvSource
  ): AnalysisEntry {
    const analysisStarted = performance.now();
    const session = service.createProjectAnalysisSession(projectSources(sources));
    const project = session.analysis();
    incrementAnalysisMetric('fullSnapshotBuilds');
    observeAnalysis(env, 'language.snapshot', {
      mode: 'full',
      sourceCount: sources.size,
      definitionSourceCount: project.snapshotSources.length,
      durationMs: elapsed(analysisStarted)
    });

    incrementAnalysisMetric('fullProjectLinks');
    observeAnalysis(env, 'language.link', {
      mode: 'full',
      sourceCount: sources.size,
      durationMs: elapsed(analysisStarted)
    });
    return {
      key,
      revision,
      coreVersion,
      sources,
      sourceBytes: sourcesSize(sources),
      session,
      lastAccess: now
    };
  }

  private incrementalEntry(
    previous: AnalysisEntry,
    sources: Map<string, string>,
    revision: string,
    changes: readonly SourceChange[],
    now: number,
    env?: EnvSource
  ): StoredAnalysis {
    const started = performance.now();
    const session = previous.session.fork();
    const update = session.update(projectSources(sources));
    if (update.mode === 'incremental') {
      incrementAnalysisMetric('incrementalSourceUpdates', update.changedSources.size);
      incrementAnalysisMetric('incrementalSourcesRelinked', update.relinkedSourceCount);
      observeAnalysis(env, 'language.link', {
        mode: 'incremental',
        changedSources: update.changedSources.size,
        relinkedSources: update.relinkedSourceCount,
        durationMs: elapsed(started)
      });
      return {
        entry: {
          ...previous,
          revision,
          sources,
          sourceBytes: sourcesSize(sources),
          session,
          lastAccess: now
        },
        mode: 'incremental',
        relinkedSources: update.relinkedSourceCount
      };
    }

    incrementAnalysisMetric('fullSnapshotBuilds');
    incrementAnalysisMetric('fullProjectLinks');
    observeAnalysis(env, 'language.snapshot', {
      mode: update.incrementalFallback ? 'incremental-fallback' : 'full',
      sourceCount: sources.size,
      definitionSourceCount: update.snapshotSources.length,
      durationMs: elapsed(started)
    });
    observeAnalysis(env, 'language.link', {
      mode: update.incrementalFallback ? 'incremental-fallback' : 'full',
      changedSources: changes.length,
      durationMs: elapsed(started)
    });
    return {
      entry: {
        ...previous,
        revision,
        sources,
        sourceBytes: sourcesSize(sources),
        session,
        lastAccess: now
      },
      mode: 'full',
      relinkedSources: 0
    };
  }

  private applyOverlays(
    stored: StoredAnalysis,
    overlays: Readonly<Record<string, string>>,
    env?: EnvSource
  ): ProjectAnalysis {
    const base = stored.entry;
    const changes = Object.entries(overlays)
      .map(([sourceName, next]) => ({ sourceName: normalizeSourceName(sourceName), previous: base.sources.get(normalizeSourceName(sourceName)), next }))
      .filter((change) => change.previous !== change.next);
    if (changes.length === 0) {
      return analysis(base, base.session.analysis(), stored.mode, stored.relinkedSources);
    }

    const merged = new Map(base.sources);
    for (const change of changes) {
      merged.set(change.sourceName, change.next!);
    }
    const revision = sourceRevision(merged);
    const started = performance.now();
    const session = base.session.fork();
    const update = session.update(projectSources(merged));
    if (update.mode === 'incremental') {
      incrementAnalysisMetric('incrementalSourceUpdates', update.changedSources.size);
      incrementAnalysisMetric('incrementalSourcesRelinked', update.relinkedSourceCount);
      observeAnalysis(env, 'language.link', {
        mode: 'overlay-incremental',
        changedSources: update.changedSources.size,
        relinkedSources: update.relinkedSourceCount,
        durationMs: elapsed(started)
      });
      return {
        revision,
        snapshotBuild: update.snapshotBuild,
        result: update.result,
        mode: 'overlay-incremental',
        relinkedSources: update.relinkedSourceCount
      };
    }

    incrementAnalysisMetric('fullSnapshotBuilds');
    incrementAnalysisMetric('fullProjectLinks');
    observeAnalysis(env, 'language.snapshot', {
      mode: 'overlay-full',
      sourceCount: merged.size,
      definitionSourceCount: update.snapshotSources.length,
      durationMs: elapsed(started)
    });
    observeAnalysis(env, 'language.link', {
      mode: update.incrementalFallback ? 'overlay-incremental-fallback' : 'overlay-full',
      changedSources: update.changedSources.size,
      durationMs: elapsed(started)
    });
    return {
      revision,
      snapshotBuild: update.snapshotBuild,
      result: update.result,
      mode: 'overlay-full',
      relinkedSources: merged.size
    };
  }

  private prune(config: CacheConfig, now: number): void {
    for (const [key, entry] of this.entries) {
      if (now - entry.lastAccess > config.ttlMs) {
        this.entries.delete(key);
      }
    }
    while (this.entries.size > config.maxEntries || totalSourceBytes(this.entries) > config.maxTotalSourceBytes) {
      const oldest = this.entries.keys().next().value as string | undefined;
      if (oldest === undefined) {
        break;
      }
      this.entries.delete(oldest);
    }
  }
}

export const projectAnalysisCache = new ProjectAnalysisCache();

export function resetProjectAnalysisCache(): void {
  projectAnalysisCache.clear();
}

function analysis(
  entry: AnalysisEntry,
  project: LanguageProjectAnalysis,
  mode: ProjectAnalysis['mode'],
  relinkedSources: number
): ProjectAnalysis {
  return {
    revision: entry.revision,
    snapshotBuild: project.snapshotBuild,
    result: project.result,
    mode,
    relinkedSources
  };
}

function sourceChanges(previous: ReadonlyMap<string, string>, next: ReadonlyMap<string, string>): SourceChange[] {
  const names = new Set([...previous.keys(), ...next.keys()]);
  return [...names].flatMap((sourceName) => {
    const before = previous.get(sourceName);
    const after = next.get(sourceName);
    return before === after ? [] : [{ sourceName, previous: before, next: after }];
  });
}

function projectSources(sources: ReadonlyMap<string, string>): ProjectSource[] {
  return [...sources.entries()].map(([sourceName, source]) => ({ sourceName, source }));
}

function normalizedSources(sources: ReadonlyMap<string, string>): Map<string, string> {
  return new Map([...sources.entries()]
    .map(([sourceName, source]) => [normalizeSourceName(sourceName), source] as const)
    .sort(([left], [right]) => left.localeCompare(right)));
}

function normalizeSourceName(sourceName: string): string {
  return sourceName.replaceAll('\\', '/').replace(/^\/+|\/+$/gu, '');
}

function sourceRevision(sources: ReadonlyMap<string, string>): string {
  const hash = createHash('sha256');
  for (const [sourceName, source] of [...sources.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    hash.update(sourceName).update('\0').update(source).update('\0');
  }
  return hash.digest('base64url');
}

function digest(value: string): string {
  return createHash('sha256').update(value).digest('base64url');
}

function sourcesSize(sources: ReadonlyMap<string, string>): number {
  let result = 0;
  for (const [sourceName, source] of sources) {
    result += Buffer.byteLength(sourceName) + Buffer.byteLength(source);
  }
  return result;
}

function cacheConfig(env: EnvSource | undefined): CacheConfig {
  return {
    maxEntries: numberValue(env?.ARCHINSIGHT_ANALYSIS_CACHE_MAX_ENTRIES, 32),
    ttlMs: numberValue(env?.ARCHINSIGHT_ANALYSIS_CACHE_TTL_SECONDS, 900) * 1_000,
    maxEntrySourceBytes: numberValue(env?.ARCHINSIGHT_ANALYSIS_CACHE_MAX_ENTRY_SOURCE_BYTES, 16_777_216),
    maxTotalSourceBytes: numberValue(env?.ARCHINSIGHT_ANALYSIS_CACHE_MAX_TOTAL_SOURCE_BYTES, 67_108_864)
  };
}

function numberValue(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function totalSourceBytes(entries: ReadonlyMap<string, AnalysisEntry>): number {
  let result = 0;
  for (const entry of entries.values()) {
    result += entry.sourceBytes;
  }
  return result;
}

function touch(entries: Map<string, AnalysisEntry>, key: string, entry: AnalysisEntry): void {
  entries.delete(key);
  entries.set(key, entry);
}

function elapsed(started: number): number {
  return Math.round((performance.now() - started) * 100) / 100;
}
