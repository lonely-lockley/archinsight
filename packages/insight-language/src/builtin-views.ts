import { GENERATED_BUILTIN_VIEW_DEFINITIONS } from "./generated/builtin-view-catalog.js";

export type BuiltinDiagramView = typeof GENERATED_BUILTIN_VIEW_DEFINITIONS[number]["id"];
export type BuiltinViewAlias = typeof GENERATED_BUILTIN_VIEW_DEFINITIONS[number]["aliases"][number];
export type BuiltinViewEnvironmentPolicy = "none" | "single-relevant";
export type BuiltinViewLifecycle = "stable" | "legacy";
export type ViewBoundaryScope = "context" | "tab";
export interface ViewBoundaryDefinition {
  readonly scope: ViewBoundaryScope;
  readonly boundaryType: string;
  readonly visibleType: string;
}
export type BuiltinViewStage =
  | "logical-boundary"
  | "deployment-seed-filter"
  | "deployment-materialization"
  | "deployment-environment"
  | "deployment-system-rollup"
  | "deployment-infrastructure-simplification";

export interface QueryViewPipelineDefinition {
  readonly boundary: ViewBoundaryDefinition | null;
  readonly stages: readonly BuiltinViewStage[];
  readonly deploymentRootType?: string;
}

export interface BuiltinViewDefinition {
  readonly id: BuiltinDiagramView;
  readonly presetVersion: number;
  readonly order: number;
  readonly label: string;
  readonly shortLabel: string;
  readonly query: string;
  readonly sourceRequired: boolean;
  readonly contextRequired: boolean;
  readonly environment: BuiltinViewEnvironmentPolicy;
  readonly aliases: readonly string[];
  readonly lifecycle: BuiltinViewLifecycle;
  readonly boundary: ViewBoundaryDefinition | null;
  readonly stages: readonly BuiltinViewStage[];
  readonly deploymentRootType?: string;
  readonly legacyPresetQueries: readonly {
    readonly version: number;
    readonly query: string;
  }[];
}

export const BUILTIN_VIEW_DEFINITIONS: readonly BuiltinViewDefinition[] = GENERATED_BUILTIN_VIEW_DEFINITIONS;
export const BUILTIN_VIEW_IDS: readonly BuiltinDiagramView[] = BUILTIN_VIEW_DEFINITIONS.map((definition) => definition.id);
export const BUILTIN_VIEW_QUERIES: Readonly<Record<BuiltinDiagramView, string>> = Object.fromEntries(
  BUILTIN_VIEW_DEFINITIONS.map((definition) => [definition.id, definition.query]),
) as Record<BuiltinDiagramView, string>;

const definitionsById = new Map(BUILTIN_VIEW_DEFINITIONS.map((definition) => [definition.id, definition]));
const definitionsByAlias = new Map(BUILTIN_VIEW_DEFINITIONS.flatMap((definition) =>
  definition.aliases.map((alias) => [alias, definition] as const)
));

export function builtinViewDefinition(view: BuiltinDiagramView): BuiltinViewDefinition {
  return definitionsById.get(view)!;
}

export function resolveBuiltinView(value: unknown, includeAliases = false): BuiltinViewDefinition | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  return definitionsById.get(value as BuiltinDiagramView)
    ?? (includeAliases ? definitionsByAlias.get(value) : undefined);
}

export function isBuiltinDiagramView(value: unknown): value is BuiltinDiagramView {
  return resolveBuiltinView(value) !== undefined;
}

export function builtinViewHasStage(
  view: BuiltinDiagramView | undefined,
  stage: BuiltinViewStage,
): boolean {
  return view !== undefined && builtinViewDefinition(view).stages.includes(stage);
}

export function queryViewPipeline(
  view: BuiltinDiagramView | undefined,
  pipeline?: QueryViewPipelineDefinition,
): QueryViewPipelineDefinition {
  if (pipeline !== undefined) {
    return pipeline;
  }
  const definition = view === undefined ? undefined : builtinViewDefinition(view);
  return {
    boundary: definition?.boundary ?? null,
    stages: definition?.stages ?? [],
    ...(definition?.deploymentRootType === undefined ? {} : { deploymentRootType: definition.deploymentRootType }),
  };
}
