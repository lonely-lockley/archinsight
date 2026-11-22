import type {
  LanguageBuildResult,
  LanguageDiagnostic,
  LanguageSnapshot,
  LinkProjectResult,
  ProjectSource,
} from "./contracts.js";
import { buildLanguageSnapshotResultFromParsedSources, coreLanguageSnapshot } from "./core-snapshot.js";
import { parseInsightSource, type ParsedSource, type SourceAnalysisMetadata } from "./parser-facade.js";
import { ProjectLinkerSourceCache } from "./project-linker.js";
import { ProjectLinkerState } from "./project-linker-state.js";
import {
  measureLinkPhase,
  type ProjectLinkerProfiler,
} from "./project-linker-profiler.js";

export type ProjectAnalysisUpdateMode = "unchanged" | "incremental" | "full";

export interface ProjectAnalysis {
  readonly sources: readonly ProjectSource[];
  readonly snapshotSources: readonly string[];
  readonly snapshotBuild: LanguageBuildResult;
  readonly result: LinkProjectResult;
  readonly diagnostics: readonly LanguageDiagnostic[];
}

export interface ProjectAnalysisUpdate extends ProjectAnalysis {
  readonly mode: ProjectAnalysisUpdateMode;
  readonly changedSources: ReadonlySet<string>;
  readonly supportSources: ReadonlySet<string>;
  readonly supportSourceCount: number;
  readonly relinkedSources: ReadonlySet<string>;
  readonly relinkedSourceCount: number;
  readonly reparsedSourceCount: number;
  readonly incrementalFallback: boolean;
}

export type ProjectSourceBatchParser = (
  sources: readonly ProjectSource[],
) => Promise<readonly ParsedSource[]>;

interface SourceChange {
  readonly sourceName: string;
  readonly previous: string | undefined;
  readonly next: string | undefined;
}

export class ProjectAnalysisSession {
  private sourcesByName: Map<string, ProjectSource>;
  private snapshotBuild: LanguageBuildResult;
  private snapshotSourceNames: readonly string[];
  private state: ProjectLinkerState;

  private constructor(
    private readonly baseSnapshots: readonly LanguageSnapshot[],
    sourcesByName: Map<string, ProjectSource>,
    snapshotBuild: LanguageBuildResult,
    snapshotSourceNames: readonly string[],
    state: ProjectLinkerState,
    private readonly profiler?: ProjectLinkerProfiler,
  ) {
    this.sourcesByName = sourcesByName;
    this.snapshotBuild = snapshotBuild;
    this.snapshotSourceNames = snapshotSourceNames;
    this.state = state;
  }

  static create(
    sources: readonly ProjectSource[],
    baseSnapshots: readonly LanguageSnapshot[] = [coreLanguageSnapshot],
    profiler?: ProjectLinkerProfiler,
  ): ProjectAnalysisSession {
    const sourcesByName = measureLinkPhase(profiler, "session.normalize-sources", () => normalizedSources(sources));
    return ProjectAnalysisSession.createNormalized(sourcesByName, baseSnapshots, profiler);
  }

  static async createAsync(
    sources: readonly ProjectSource[],
    parseSources: ProjectSourceBatchParser,
    baseSnapshots: readonly LanguageSnapshot[] = [coreLanguageSnapshot],
    profiler?: ProjectLinkerProfiler,
  ): Promise<ProjectAnalysisSession> {
    const sourcesByName = measureLinkPhase(profiler, "session.normalize-sources", () => normalizedSources(sources));
    const parsedSources = await parseSources([...sourcesByName.values()]);
    return ProjectAnalysisSession.createNormalized(sourcesByName, baseSnapshots, profiler, parsedSources);
  }

  private static createNormalized(
    sourcesByName: Map<string, ProjectSource>,
    baseSnapshots: readonly LanguageSnapshot[],
    profiler?: ProjectLinkerProfiler,
    parsedSources: readonly ParsedSource[] = [],
  ): ProjectAnalysisSession {
    const build = buildProject(sourcesByName, baseSnapshots, profiler, parsedSources);
    return new ProjectAnalysisSession(
      baseSnapshots,
      sourcesByName,
      build.snapshotBuild,
      build.snapshotSourceNames,
      build.state,
      profiler,
    );
  }

  analysis(): ProjectAnalysis {
    return measureLinkPhase(this.profiler, "session.materialize-analysis", () => {
      const linkedResult = this.state.result();
      const diagnostics = uniqueDiagnostics([...this.snapshotBuild.diagnostics, ...linkedResult.diagnostics]);
      const result = { ...linkedResult, diagnostics };
      return {
        sources: [...this.sourcesByName.values()],
        snapshotSources: this.snapshotSourceNames,
        snapshotBuild: this.snapshotBuild,
        result,
        diagnostics,
      };
    });
  }

  fork(): ProjectAnalysisSession {
    return new ProjectAnalysisSession(
      this.baseSnapshots,
      new Map(this.sourcesByName),
      this.snapshotBuild,
      this.snapshotSourceNames,
      this.state.fork(),
      this.profiler,
    );
  }

  update(sources: readonly ProjectSource[]): ProjectAnalysisUpdate {
    const nextSources = normalizedSources(sources);
    const changes = sourceChanges(this.sourcesByName, nextSources);
    const changedSources = new Set(changes.map((change) => change.sourceName));
    if (changes.length === 0) {
      return this.updateResult("unchanged", changedSources, new Set(), new Set(), 0, 0, false);
    }
    const parseCountBeforeClassification = this.state.sourceParseCount();
    const metadata = (sourceName: string, source: string | undefined): SourceAnalysisMetadata =>
      source === undefined ? emptySourceMetadata() : this.state.parsedSource(sourceName, source).metadata;
    if (!canUpdateIncrementally(changes, metadata)) {
      const parsedSources = [...nextSources.values()].map((source) =>
        this.state.parsedSource(source.sourceName, source.source)
      );
      this.rebuild(nextSources, parsedSources);
      return this.updateResult("full", changedSources, new Set(nextSources.keys()), new Set(nextSources.keys()), nextSources.size, nextSources.size, false);
    }

    try {
      const nextState = this.state.fork();
      const classifiedParseCount = this.state.sourceParseCount() - parseCountBeforeClassification;
      const update = nextState.replaceSources(orderedChanges(changes).map((change) => ({
        sourceName: change.sourceName,
        ...(change.next === undefined ? {} : { source: change.next }),
      })));
      const relinkedSources = update.relinkedSources;
      this.sourcesByName = nextSources;
      this.state = nextState;
      return this.updateResult(
        "incremental",
        changedSources,
        update.supportSources,
        relinkedSources,
        relinkedSources.size,
        classifiedParseCount + update.reparsedSourceCount,
        false,
      );
    } catch {
      this.rebuild(nextSources);
      return this.updateResult("full", changedSources, new Set(nextSources.keys()), new Set(nextSources.keys()), nextSources.size, nextSources.size, true);
    }
  }

  private rebuild(sourcesByName: Map<string, ProjectSource>, parsedSources: readonly ParsedSource[] = []): void {
    const build = buildProject(sourcesByName, this.baseSnapshots, this.profiler, parsedSources);
    this.sourcesByName = sourcesByName;
    this.snapshotBuild = build.snapshotBuild;
    this.snapshotSourceNames = build.snapshotSourceNames;
    this.state = build.state;
  }

  private updateResult(
    mode: ProjectAnalysisUpdateMode,
    changedSources: ReadonlySet<string>,
    supportSources: ReadonlySet<string>,
    relinkedSources: ReadonlySet<string>,
    relinkedSourceCount: number,
    reparsedSourceCount: number,
    incrementalFallback: boolean,
  ): ProjectAnalysisUpdate {
    return {
      ...this.analysis(),
      mode,
      changedSources,
      supportSources,
      supportSourceCount: supportSources.size,
      relinkedSources,
      relinkedSourceCount,
      reparsedSourceCount,
      incrementalFallback,
    };
  }
}

function buildProject(
  sourcesByName: ReadonlyMap<string, ProjectSource>,
  baseSnapshots: readonly LanguageSnapshot[],
  profiler?: ProjectLinkerProfiler,
  preparsedSources: readonly ParsedSource[] = [],
): {
  readonly snapshotBuild: LanguageBuildResult;
  readonly snapshotSourceNames: readonly string[];
  readonly state: ProjectLinkerState;
} {
  const sources = [...sourcesByName.values()];
  const sourceCache = new ProjectLinkerSourceCache();
  for (const parsed of preparsedSources) sourceCache.prime(parsed);
  const parsedSources = measureLinkPhase(profiler, "session.classify-sources", () =>
    sources.map((source) => sourceCache.parse(source.sourceName, source.source))
  );
  const snapshotSourceIndexes = parsedSources.flatMap((parsed, index) =>
    parsed.metadata.contributesToSnapshot ? [index] : []
  );
  const snapshotSources = snapshotSourceIndexes.map((index) => sources[index]!);
  const parsedSnapshotSources = snapshotSourceIndexes.map((index) => parsedSources[index]!);
  const snapshotBuild = measureLinkPhase(profiler, "session.build-snapshot", () =>
    buildLanguageSnapshotResultFromParsedSources(parsedSnapshotSources, baseSnapshots)
  );
  return {
    snapshotBuild,
    snapshotSourceNames: snapshotSources.map((source) => source.sourceName),
    state: new ProjectLinkerState({ snapshot: snapshotBuild.snapshot, sources }, undefined, sourceCache, profiler),
  };
}

function normalizedSources(sources: readonly ProjectSource[]): Map<string, ProjectSource> {
  return new Map(sources
    .map((source) => ({ ...source, sourceName: normalizeSourceName(source.sourceName) }))
    .sort((left, right) => left.sourceName.localeCompare(right.sourceName))
    .map((source) => [source.sourceName, source]));
}

function normalizeSourceName(sourceName: string): string {
  return sourceName.replaceAll("\\", "/").replace(/^\/+|\/+$/gu, "");
}

function sourceChanges(
  previous: ReadonlyMap<string, ProjectSource>,
  next: ReadonlyMap<string, ProjectSource>,
): SourceChange[] {
  const names = new Set([...previous.keys(), ...next.keys()]);
  return [...names].flatMap((sourceName) => {
    const before = previous.get(sourceName)?.source;
    const after = next.get(sourceName)?.source;
    return before === after ? [] : [{ sourceName, previous: before, next: after }];
  });
}

function orderedChanges(changes: readonly SourceChange[]): SourceChange[] {
  return [...changes].sort((left, right) => {
    const leftOrder = left.next === undefined ? 2 : left.previous === undefined ? 0 : 1;
    const rightOrder = right.next === undefined ? 2 : right.previous === undefined ? 0 : 1;
    return leftOrder - rightOrder || left.sourceName.localeCompare(right.sourceName);
  });
}

function canUpdateIncrementally(
  changes: readonly SourceChange[],
  metadata: (sourceName: string, source: string | undefined) => SourceAnalysisMetadata,
): boolean {
  return changes.every((change) => {
    const previous = metadata(change.sourceName, change.previous);
    const next = metadata(change.sourceName, change.next);
    if (!previous.reliable || !next.reliable || previous.contributesToSnapshot || next.contributesToSnapshot) {
      return false;
    }
    if (change.previous === undefined) {
      return next.supportDependencySignature === "";
    }
    if (change.next === undefined) {
      return true;
    }
    return previous.dependencySignature === next.dependencySignature;
  });
}

function emptySourceMetadata(): SourceAnalysisMetadata {
  return {
    role: "empty",
    contributesToSnapshot: false,
    dependencySignature: "",
    supportDependencySignature: "",
    reliable: true,
  };
}

function uniqueDiagnostics(diagnostics: readonly LanguageDiagnostic[]): readonly LanguageDiagnostic[] {
  const seen = new Set<string>();
  return diagnostics.filter((diagnostic) => {
    const key = [
      diagnostic.sourceName,
      diagnostic.level ?? "",
      diagnostic.code,
      diagnostic.message,
      diagnostic.line,
      diagnostic.column,
      diagnostic.endLine ?? "",
      diagnostic.endColumn ?? "",
    ].join("\0");
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}
