import type {
  LanguageBuildResult,
  LanguageDiagnostic,
  LanguageSnapshot,
  LinkProjectResult,
  ProjectSource,
} from "./contracts.js";
import { buildLanguageSnapshotResultFromSources, coreLanguageSnapshot } from "./core-snapshot.js";
import { ProjectLinkerState } from "./project-linker-state.js";

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
  readonly relinkedSources: ReadonlySet<string>;
  readonly relinkedSourceCount: number;
  readonly incrementalFallback: boolean;
}

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
  ) {
    this.sourcesByName = sourcesByName;
    this.snapshotBuild = snapshotBuild;
    this.snapshotSourceNames = snapshotSourceNames;
    this.state = state;
  }

  static create(
    sources: readonly ProjectSource[],
    baseSnapshots: readonly LanguageSnapshot[] = [coreLanguageSnapshot],
  ): ProjectAnalysisSession {
    const sourcesByName = normalizedSources(sources);
    const build = buildProject(sourcesByName, baseSnapshots);
    return new ProjectAnalysisSession(
      baseSnapshots,
      sourcesByName,
      build.snapshotBuild,
      build.snapshotSourceNames,
      build.state,
    );
  }

  analysis(): ProjectAnalysis {
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
  }

  fork(): ProjectAnalysisSession {
    return new ProjectAnalysisSession(
      this.baseSnapshots,
      new Map(this.sourcesByName),
      this.snapshotBuild,
      this.snapshotSourceNames,
      this.state.fork(),
    );
  }

  update(sources: readonly ProjectSource[]): ProjectAnalysisUpdate {
    const nextSources = normalizedSources(sources);
    const changes = sourceChanges(this.sourcesByName, nextSources);
    const changedSources = new Set(changes.map((change) => change.sourceName));
    if (changes.length === 0) {
      return this.updateResult("unchanged", changedSources, new Set(), 0, false);
    }
    if (!canUpdateIncrementally(changes)) {
      this.rebuild(nextSources);
      return this.updateResult("full", changedSources, new Set(nextSources.keys()), nextSources.size, false);
    }

    try {
      const nextState = this.state.fork();
      const relinkedSources = new Set<string>();
      let relinkedSourceCount = 0;
      for (const change of orderedChanges(changes)) {
        const update = change.next === undefined
          ? nextState.removeSource(change.sourceName)
          : nextState.replaceSource({ sourceName: change.sourceName, source: change.next });
        relinkedSourceCount += update.relinkedSources.size;
        for (const sourceName of update.relinkedSources) {
          relinkedSources.add(sourceName);
        }
      }
      this.sourcesByName = nextSources;
      this.state = nextState;
      return this.updateResult(
        "incremental",
        changedSources,
        relinkedSources,
        relinkedSourceCount,
        false,
      );
    } catch {
      this.rebuild(nextSources);
      return this.updateResult("full", changedSources, new Set(nextSources.keys()), nextSources.size, true);
    }
  }

  private rebuild(sourcesByName: Map<string, ProjectSource>): void {
    const build = buildProject(sourcesByName, this.baseSnapshots);
    this.sourcesByName = sourcesByName;
    this.snapshotBuild = build.snapshotBuild;
    this.snapshotSourceNames = build.snapshotSourceNames;
    this.state = build.state;
  }

  private updateResult(
    mode: ProjectAnalysisUpdateMode,
    changedSources: ReadonlySet<string>,
    relinkedSources: ReadonlySet<string>,
    relinkedSourceCount: number,
    incrementalFallback: boolean,
  ): ProjectAnalysisUpdate {
    return {
      ...this.analysis(),
      mode,
      changedSources,
      relinkedSources,
      relinkedSourceCount,
      incrementalFallback,
    };
  }
}

function buildProject(
  sourcesByName: ReadonlyMap<string, ProjectSource>,
  baseSnapshots: readonly LanguageSnapshot[],
): {
  readonly snapshotBuild: LanguageBuildResult;
  readonly snapshotSourceNames: readonly string[];
  readonly state: ProjectLinkerState;
} {
  const sources = [...sourcesByName.values()];
  const snapshotSources = sources.filter((source) => sourceAffectsSnapshot(source.source));
  const snapshotBuild = buildLanguageSnapshotResultFromSources(snapshotSources, baseSnapshots);
  return {
    snapshotBuild,
    snapshotSourceNames: snapshotSources.map((source) => source.sourceName),
    state: new ProjectLinkerState({ snapshot: snapshotBuild.snapshot, sources }),
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

function canUpdateIncrementally(changes: readonly SourceChange[]): boolean {
  return changes.every((change) => {
    if (sourceAffectsSnapshot(change.previous) || sourceAffectsSnapshot(change.next)) {
      return false;
    }
    if (change.previous === undefined) {
      return supportDependencySignature(change.next) === "";
    }
    if (change.next === undefined) {
      return true;
    }
    return dependencySignature(change.previous) === dependencySignature(change.next);
  });
}

function sourceAffectsSnapshot(source: string | undefined): boolean {
  return source !== undefined
    && /^\s*(?:define\s+(?:type|operator|enum|presentation)\b|extend\s+(?:type|enum|presentation)\b)/mu.test(source);
}

function dependencySignature(source: string | undefined): string {
  return source === undefined ? "" : source
    .split(/\r?\n/u)
    .filter((line) => /^(?:context|environment|import|from|extend)\b/u.test(line))
    .map((line) => line.trimEnd())
    .join("\n");
}

function supportDependencySignature(source: string | undefined): string {
  return source === undefined ? "" : source
    .split(/\r?\n/u)
    .filter((line) => /^(?:import|from|extend)\b/u.test(line))
    .map((line) => line.trimEnd())
    .join("\n");
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
