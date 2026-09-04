import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const linker = source("../src/project-linker.ts");
const antlrAdapter = source("../src/antlr-adapter.ts");
const documentAggregate = source("../src/document-aggregate.ts");
const queryEngine = source("../src/query-engine.ts");
const querySyntax = source("../src/query-syntax.ts");
const queryContext = source("../src/query-execution-context.ts");
const queryPipeline = source("../src/query-view-pipeline.ts");
const operatorRegistry = source("../src/operator-implementation-registry.ts");
const graphvizRenderer = source("../src/graphviz-renderer.ts");
const coreSnapshot = source("../src/core-snapshot.ts");
const typeSystem = source("../src/type-system.ts");
const coreCode = source("../../../src/main/resources/com/github/lonelylockley/insight/core_code.ai");
const cliProjectRuntime = source("../../../archinsight-cli/src/project-runtime.ts");
const diagramQueryPresets = source("../../archinsight-workbench/src/diagram-query-presets.ts");
const tabPersistence = source("../../../archinsight-web/src/lib/workspace/editor/tab-persistence.ts");

assert(linker.includes('from "./presentation-resolver.js"'));
assert(linker.includes('from "./linked-project-index.js"'));
assert(linker.includes('from "./document-aggregate.js"'));
assert(antlrAdapter.includes('from "./document-aggregate.js"'));
assert(documentAggregate.includes("documentAggregateRoot"));
assert(documentAggregate.includes("documentAggregateMember"));
assert.equal(linker.includes('findConstructor("environment", "Environment")'), false,
  "document aggregate roots must resolve from capabilities, not built-in names");
assert.equal(linker.includes('constructorsForExpectedType("DeploymentElement")'), false,
  "aggregate member fallback must resolve from the root schema");
assert.deepEqual(stageCalls(linker), [
  "createLinkingWorkspace",
  "resolveDeploymentStage",
  "materializeLogicalRelationshipsStage",
  "expandProjectionStage",
  "completeLinkingPipeline",
], "linkProject must remain a readable orchestration over explicit phases");
assert(linker.includes("LINK_INTROSPECTION_RULES"), "linked-project inspection must remain a rule registry");

assert(queryEngine.includes('from "./query-syntax.js"'));
assert(queryEngine.includes('from "./query-execution-context.js"'));
assert(queryEngine.includes('from "./query-view-pipeline.js"'));
assert.equal(queryEngine.includes("class QueryParser"), false, "query syntax must not drift back into evaluation");
assert.equal(queryEngine.includes("function tokenizeQuery"), false, "query tokenization belongs to query syntax");
assert.equal(occurrences(queryEngine, "createQueryExecutionContext(result, scope)"), 2,
  "selection and standalone environment discovery each create one canonical context");
assert(querySyntax.includes("class QueryParser"));
assert(queryContext.includes("elementsById"));
assert(queryContext.includes("parentByChild"));
assert(queryPipeline.includes("runQueryViewPipeline"));
assert(queryPipeline.includes("queryViewPipeline(scope.view, scope.pipeline)"),
  "custom and built-in views must resolve through the same explicit pipeline contract");
assert.equal(queryPipeline.includes("builtinViewHasStage(scope.view"), false,
  "pipeline execution must not dispatch directly on a built-in view name");
assert(operatorRegistry.includes("ImmutableOperatorImplementationRegistry"));
assert.equal(linker.includes("const operatorImplementations = new Map"), false,
  "operator implementations must be supplied by the immutable registry contract");
assert.equal(/action\.operator\s*[!=]==?\s*["'](?:uses|runsOn)["']/.test(linker), false,
  "deployment behavior must be selected by semantic capability, not operator spelling");
assert(graphvizRenderer.includes('from "./render-identity.js"'));
assert.equal(graphvizRenderer.includes("function safeId"), false,
  "render identities must not collapse punctuation through lossy replacement");
assert.equal(graphvizRenderer.includes('.replace("/", "__")'), false,
  "qualified model ids must remain intact in DOT");
assert.equal(coreSnapshot.includes("CONSTRUCTORLESS_EXTENSION_POINT_TYPES"), false,
  "constructorless extension points must be declared explicitly, not privileged by name");
assert(coreCode.includes("define abstract type CodeElement of Element"),
  "the core extension point must exercise the public abstract-type contract");
const operatorResolver = typeSystem.slice(
  typeSystem.indexOf("operatorConstructor("),
  typeSystem.indexOf("private inheritanceChain("),
);
assert.equal(operatorResolver.includes(".find("), false,
  "linking and completion operator resolution must not depend on declaration order");
assert.equal(occurrences(operatorResolver, "uniqueMostSpecificOperator("), 3,
  "ordinary, relation, and type-slot operators must share specificity resolution");
assert(cliProjectRuntime.includes("analyzeQuery(query)"),
  "CLI scope requirements must come from parsed query metadata");
assert.equal(cliProjectRuntime.includes("function queryUsesVariable"), false,
  "CLI scope requirements must not scan raw query text");
assert(diagramQueryPresets.includes("legacyPresetQueries"),
  "legacy preset migrations must consume explicit catalogue history");
assert.equal(diagramQueryPresets.includes("deploymentLegacyQueries"), false,
  "legacy presets must not be synthesized by editing the latest query");
assert(tabPersistence.includes("presetId") && tabPersistence.includes("presetVersion")
  && tabPersistence.includes("customizedQuery"),
  "persisted tabs must distinguish identified presets from customized queries");

const route = source("../../../archinsight-web/src/routes/+page.svelte");
const workspacePage = source("../../../archinsight-web/src/lib/workspace/WorkspacePage.svelte");
assert(route.split("\n").length < 20, "the route must remain a thin host");
assert(workspacePage.split("\n").length < 100, "workspace composition must not absorb controller state again");
for (const controller of [
  "analysis/analysis-controller.ts",
  "diagram/diagram-controller.ts",
  "editor/workspace-file-controller.ts",
  "projects/project-controller.ts",
  "repository/repository-controller.ts",
  "shell/workspace-runtime.ts",
]) {
  assert(source(`../../../archinsight-web/src/lib/workspace/${controller}`).length > 0, `${controller} is missing`);
}

console.log("architecture phase boundary contracts passed");

function stageCalls(text) {
  const body = text.slice(text.indexOf("export function linkProject"), text.indexOf("function createLinkingWorkspace"));
  return [...body.matchAll(/\b(createLinkingWorkspace|resolveDeploymentStage|materializeLogicalRelationshipsStage|expandProjectionStage|completeLinkingPipeline)\(/g)]
    .map((match) => match[1]);
}

function occurrences(text, fragment) {
  return text.split(fragment).length - 1;
}

function source(relativePath) {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}
