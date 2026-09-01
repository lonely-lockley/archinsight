import { GENERATED_BUILTIN_VIEW_DEFINITIONS } from "./generated/builtin-view-catalog.js";

export type BuiltinDiagramView = typeof GENERATED_BUILTIN_VIEW_DEFINITIONS[number]["id"];
export type BuiltinViewAlias = typeof GENERATED_BUILTIN_VIEW_DEFINITIONS[number]["aliases"][number];
export type BuiltinViewEnvironmentPolicy = "none" | "single-relevant";
export type BuiltinViewLifecycle = "stable" | "legacy";
export type BuiltinViewBoundary = "context" | "system" | "container" | "component";
export type BuiltinViewStage =
  | "logical-boundary"
  | "deployment-seed-filter"
  | "deployment-materialization"
  | "deployment-environment"
  | "deployment-system-rollup"
  | "deployment-infrastructure-simplification";

export interface BuiltinViewDefinition {
  readonly id: BuiltinDiagramView;
  readonly order: number;
  readonly label: string;
  readonly shortLabel: string;
  readonly query: string;
  readonly sourceRequired: boolean;
  readonly contextRequired: boolean;
  readonly environment: BuiltinViewEnvironmentPolicy;
  readonly aliases: readonly string[];
  readonly lifecycle: BuiltinViewLifecycle;
  readonly boundary: BuiltinViewBoundary | null;
  readonly stages: readonly BuiltinViewStage[];
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
