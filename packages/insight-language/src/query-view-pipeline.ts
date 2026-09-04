import { builtinViewHasStage } from "./builtin-views.js";
import type { LinkProjectResult, QueryScope, RenderGraph } from "./contracts.js";

export interface QueryViewTransformations {
  applyBoundary(result: LinkProjectResult, graph: RenderGraph, scope: QueryScope): RenderGraph;
  filterDeploymentSeeds(result: LinkProjectResult, graph: RenderGraph, scope: QueryScope): RenderGraph;
  materializeGroups(graph: RenderGraph, materializePlacements: boolean): RenderGraph;
  applyEnvironment(result: LinkProjectResult, graph: RenderGraph, scope: QueryScope): RenderGraph;
  rollUpSystems(result: LinkProjectResult, graph: RenderGraph, scope: QueryScope): RenderGraph;
  simplifyInfrastructure(result: LinkProjectResult, graph: RenderGraph): RenderGraph;
}

export function runQueryViewPipeline(
  result: LinkProjectResult,
  scope: QueryScope,
  selected: RenderGraph,
  transformations: QueryViewTransformations,
): RenderGraph {
  const bounded = transformations.applyBoundary(result, selected, scope);
  const seedFiltered = builtinViewHasStage(scope.view, "deployment-seed-filter")
    ? transformations.filterDeploymentSeeds(result, bounded, scope)
    : bounded;
  const materialized = transformations.materializeGroups(
    seedFiltered,
    builtinViewHasStage(scope.view, "deployment-materialization"),
  );
  if (builtinViewHasStage(scope.view, "deployment-environment")) {
    return transformations.applyEnvironment(result, materialized, scope);
  }
  if (!builtinViewHasStage(scope.view, "deployment-system-rollup")) {
    return materialized;
  }
  const rolledUp = transformations.rollUpSystems(result, materialized, scope);
  return builtinViewHasStage(scope.view, "deployment-infrastructure-simplification")
    ? transformations.simplifyInfrastructure(result, rolledUp)
    : rolledUp;
}
