import type { BuiltinDiagramView } from "@insight/language";
import { groupProjectQueryPaths } from "@archinsight/workbench/project-query-paths";

export interface WorkspaceQuerySource {
  readonly sourceName: string;
  readonly source: string;
}

export interface ResolvedProjectViewQuery {
  readonly query: string;
  readonly overridePath?: string;
}

export interface ProjectViewQueryDependencies {
  readonly builtinQueries: Readonly<Record<BuiltinDiagramView, string>>;
  resultKind(query: string): "graph" | "table" | "unknown";
}

export class ProjectViewQueryCatalog {
  private readonly sources: ReadonlyMap<string, string>;
  private readonly pathsByName: ReadonlyMap<string, readonly string[]>;
  private readonly dependencies: ProjectViewQueryDependencies;

  constructor(
    sources: readonly WorkspaceQuerySource[],
    dependencies: ProjectViewQueryDependencies,
  ) {
    this.dependencies = dependencies;
    this.sources = new Map(sources.map(({ sourceName, source }) => [sourceName, source]));
    this.pathsByName = groupProjectQueryPaths([...this.sources.keys()]);
  }

  resolve(view: BuiltinDiagramView): ResolvedProjectViewQuery {
    const paths = this.pathsByName.get(view);
    if (paths === undefined) {
      return { query: this.dependencies.builtinQueries[view] };
    }
    if (paths.length > 1) {
      throw new Error(`Query name '${view}' is ambiguous: ${paths.join(", ")}`);
    }
    const overridePath = paths[0]!;
    const query = this.sources.get(overridePath)!;
    if (this.dependencies.resultKind(query) === "table") {
      throw new Error(`Built-in view override '${view}' must return a graph`);
    }
    return { query, overridePath };
  }

  matches(sources: readonly WorkspaceQuerySource[]): boolean {
    if (sources.length !== this.sources.size) return false;
    return sources.every(({ sourceName, source }) => this.sources.get(sourceName) === source);
  }

  webviewQueries(): Record<BuiltinDiagramView, string> {
    return Object.fromEntries(Object.entries(this.dependencies.builtinQueries).map(([view, builtin]) => {
      try {
        return [view, this.resolve(view as BuiltinDiagramView).query];
      } catch {
        return [view, builtin];
      }
    })) as Record<BuiltinDiagramView, string>;
  }
}
