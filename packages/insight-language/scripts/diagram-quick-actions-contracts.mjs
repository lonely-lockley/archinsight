import assert from "node:assert/strict";
import {
  buildLanguageSnapshotResultFromSources,
  coreLanguageSnapshot,
  deploymentEnvironmentsForElement,
  deploymentFocusElementIds,
  diagramQuickActionMetadata,
  linkProject,
  renderGraphviz,
  selectDeploymentGraph,
  selectIsolatedElementGraph,
  selectPathGraph,
} from "../build/runtime/index.js";

const definitions = buildLanguageSnapshotResultFromSources([
  source("definitions.ai", `
define type AppEnvironment of Environment
    Compute compute
    NetworkConnection network
`),
], [coreLanguageSnapshot]);
assertNoErrors(definitions.diagnostics);

const result = linkProject({
  snapshot: definitions.snapshot,
  sources: [
    source("infra.ai", `
environment eu
    name = Europe

deployment production
    compute:
        compute k8s
            name = Kubernetes
    network:
        networkConnection network
            projection:
                source $from originalLink target $to
`),
    source("target.ai", `
context shop

deploymentProfile targetProfile
    appliesTo:
        production from eu
    runsOn compute

system backend
    name = Backend
    service billing
        name = Billing
        deployment:
            uses targetProfile
`),
    source("model.ai", `
context shop

import billing from context shop

deploymentProfile appProfile
    appliesTo:
        production from eu
    runsOn compute

system storefront
    name = Storefront
    service api
        name = API
        deployment:
            uses appProfile
        component worker
            name = Worker
        links:
            -> worker
            -> queue
                deployment:
                    uses network
            -> billing

    service queue
        name = Queue
        deployment:
            uses appProfile

    service frontend
        name = Frontend
        links:
            -> api

    service isolated
        name = Isolated
`),
  ],
});
assertNoErrors(result.diagnostics);

const metadata = diagramQuickActionMetadata(result);
assert.equal(metadata["shop/storefront"]?.hasChildren, true);
assert.equal(metadata["shop/storefront"]?.hasDeployment, true, "a boundary inherits deployment availability from descendants");
assert.equal(metadata["shop/api"]?.hasChildren, true);
assert.equal(metadata["shop/api"]?.hasDeployment, true);
const configuredWithoutOccurrence = {
  ...result,
  elements: result.elements.map((element) => {
    if (element.id !== "shop/queue") return element;
    const { deployed: _deployed, ...withoutOccurrence } = element;
    return withoutOccurrence;
  }),
};
assert.equal(
  diagramQuickActionMetadata(configuredWithoutOccurrence)["shop/queue"]?.hasDeployment,
  false,
  "deployment configuration without a materialized occurrence keeps the action disabled",
);
assert.equal(metadata["shop/api"]?.pathEligible, true);
assert(metadata["shop/api"]?.declaration);
const deploymentElements = result.elements.filter((element) => element.baseTypes.includes("DeploymentElement"));
assert(deploymentElements.length > 0);
assert.equal(
  deploymentElements.every((element) => metadata[element.id]?.pathEligible === true),
  true,
  "deployment elements are valid Find path endpoints",
);
assert.equal(
  deploymentElements.every((element) => metadata[element.id]?.isolateEligible === false),
  true,
  "deployment boundaries do not gain Isolate actions",
);

const isolatedApi = selectIsolatedElementGraph(result, "shop/api");
assert.deepEqual(
  new Set(Object.keys(isolatedApi.elements)),
  new Set(["shop/api", "shop/worker", "shop/queue", "shop/billing", "shop/frontend"]),
  "raw isolate keeps the selected element and every direct neighbor",
);
assert.deepEqual(
  new Set(isolatedApi.edges.map((edge) => `${edge.source}->${edge.target}`)),
  new Set(["shop/api->shop/worker", "shop/api->shop/queue", "shop/api->shop/billing", "shop/frontend->shop/api"]),
);
assert.deepEqual(isolatedApi.layout, {
  kind: "isolate",
  focus: "shop/api",
  incoming: ["shop/frontend"],
  outgoing: ["shop/billing", "shop/queue", "shop/worker"],
});
const frontendToApi = result.edges.find((edge) => edge.source === "shop/frontend" && edge.target === "shop/api");
assert(frontendToApi);
const bidirectionalApi = selectIsolatedElementGraph({
  ...result,
  edges: [...result.edges, {
    ...frontendToApi,
    id: "bidirectional-api-frontend",
    source: "shop/api",
    target: "shop/frontend",
  }],
}, "shop/api");
assert.deepEqual(bidirectionalApi.layout, {
  kind: "isolate",
  focus: "shop/api",
  incoming: ["shop/frontend@@isolate-incoming"],
  outgoing: ["shop/billing", "shop/frontend@@isolate-outgoing", "shop/queue", "shop/worker"],
});
assert.equal(bidirectionalApi.elements["shop/frontend"], undefined);
assert.equal(bidirectionalApi.elements["shop/frontend@@isolate-incoming"]?.attributes.name?.[0], "Frontend");
assert.equal(bidirectionalApi.elements["shop/frontend@@isolate-outgoing"]?.attributes.name?.[0], "Frontend");
assert.equal(
  bidirectionalApi.edges.some((edge) => edge.source === "shop/frontend@@isolate-incoming" && edge.target === "shop/api"),
  true,
);
assert.equal(
  bidirectionalApi.edges.some((edge) => edge.source === "shop/api" && edge.target === "shop/frontend@@isolate-outgoing"),
  true,
);
const bidirectionalDot = renderGraphviz(result, bidirectionalApi, "dark");
assert(bidirectionalDot.includes('"shop/frontend@@isolate-incoming" ['));
assert(bidirectionalDot.includes('"shop/frontend@@isolate-outgoing" ['));
assert.deepEqual(
  Object.keys(selectIsolatedElementGraph(result, "shop/missing").elements),
  [],
  "an unknown isolate target produces an empty graph",
);

assert.deepEqual(deploymentEnvironmentsForElement(result, "shop/api"), [{ id: "eu", name: "Europe" }]);
const deployment = selectDeploymentGraph(result, "shop/api", "eu");
assert.deepEqual(deploymentFocusElementIds(result, "shop/api", deployment), ["shop/api"]);
assert(Object.keys(deployment.elements).some((id) => id.startsWith("shop/api")), "deployment contains the selected logical occurrence");
assert(deployment.edges.length > 0, "deployment retains the selected element's physical path");
const deploymentFocus = new Set(Object.keys(deployment.elements).filter((id) => id === "shop/api" || id.startsWith("shop/api@@")));
assert(
  deployment.edges.every((edge) => deploymentFocus.has(edge.source) || deploymentFocus.has(edge.target)),
  "deployment contains only the first-level environment of the selected component",
);
const storefrontDeployment = selectDeploymentGraph(result, "shop/storefront", "eu");
assert.deepEqual(
  deploymentFocusElementIds(result, "shop/storefront", storefrontDeployment),
  ["shop/api", "shop/queue"],
  "a deployment boundary focuses the materialized descendants rooted in its logical scope",
);
assert.deepEqual(
  deployment.groups,
  [{ owner: "eu/k8s", elements: ["shop/api", "shop/queue"] }],
  "deployment retains the ownership boundary that expresses placement and its first-level neighbor",
);
assert(
  deployment.groups.every((group) => group.elements.every((id) =>
    deployment.elements[id] !== undefined || deployment.groups.some((candidate) => candidate.owner === id)
  )),
  "deployment containment groups only retain selected members",
);
const authoredEdge = result.edges.find((edge) => edge.projected !== true);
const deploymentEndpoint = deploymentElements[0];
assert(authoredEdge && deploymentEndpoint);
const crossLayerEdge = {
  ...authoredEdge,
  id: "cross-c-d-path",
  source: "shop/api",
  target: deploymentEndpoint.id,
  projected: false,
};
const crossViewPath = selectPathGraph(
  { ...result, edges: [...result.edges, crossLayerEdge] },
  crossLayerEdge.source,
  crossLayerEdge.target,
);
assert.equal(
  crossViewPath.edges.some((edge) => edge.source === crossLayerEdge.source && edge.target === crossLayerEdge.target),
  true,
  "Find path traverses authored edges between C and D elements",
);
const deploymentOccurrenceEdge = deployment.edges[0];
assert(deploymentOccurrenceEdge);
const deploymentOccurrencePath = selectPathGraph(
  result,
  deploymentOccurrenceEdge.source,
  deploymentOccurrenceEdge.target,
  { context: "shop", tab: "model.ai", view: "deployment-container", environment: "eu" },
);
assert.equal(
  deploymentOccurrencePath.edges.some((edge) =>
    edge.source === deploymentOccurrenceEdge.source && edge.target === deploymentOccurrenceEdge.target),
  true,
  "Find path resolves canonical elements back to their displayed deployment occurrences",
);

const path = selectPathGraph(result, "shop/api", "shop/billing");
assert.deepEqual(new Set(Object.keys(path.elements)), new Set(["shop/api", "shop/billing"]));
assert.equal(path.edges.length, 1);
assert.equal(path.edges.every((edge) => edge.projected === false && edge.edge.projected !== true), true);
const multiStepPath = selectPathGraph(result, "shop/frontend", "shop/billing");
assert.deepEqual(
  new Set(multiStepPath.edges.map((edge) => `${edge.source}->${edge.target}`)),
  new Set(["shop/frontend->shop/api", "shop/api->shop/billing"]),
  "path relationships retain their direction",
);
const reversePath = selectPathGraph(result, "shop/billing", "shop/api");
assert.equal(reversePath.edges.length, 0, "path traversal follows authored relationship direction");
assert.deepEqual(
  new Set(Object.keys(reversePath.elements)),
  new Set(["shop/api", "shop/billing"]),
  "a missing directed path still returns both requested endpoints",
);
const missingPath = selectPathGraph(result, "shop/billing", "shop/isolated");
assert.equal(missingPath.edges.length, 0, "disconnected elements have no path");
assert.deepEqual(new Set(Object.keys(missingPath.elements)), new Set(["shop/billing", "shop/isolated"]));

const multiEnvironmentResult = linkProject({
  snapshot: definitions.snapshot,
  sources: [
    source("multi-eu.ai", `
environment eu
    name = Europe

deployment production
    compute:
        compute node
            name = EU node
    network:
        networkConnection network
            projection:
                source $from originalLink target $to
`),
    source("multi-us.ai", `
environment us
    name = United States

deployment production
    compute:
        compute node
            name = US node
    network:
        networkConnection network
            projection:
                source $from originalLink target $to
`),
    source("multi-model.ai", `
context multi

deploymentProfile multiRegion
    appliesTo:
        production from eu
        production from us
    runsOn compute

system application
    name = Application
    service source
        name = Source
        deployment:
            uses multiRegion
        links:
            -> target
                deployment:
                    uses network
    service target
        name = Target
        deployment:
            uses multiRegion
`),
  ],
});
assertNoErrors(multiEnvironmentResult.diagnostics);
const euOnlyPath = selectPathGraph(
  multiEnvironmentResult,
  "multi/source",
  "multi/target",
  { context: "multi", tab: "multi-model.ai", view: "c2" },
  { sourceEnvironment: "eu", targetEnvironment: "eu" },
);
assert(euOnlyPath.edges.length > 0, "an environment-scoped deployment path remains connected");
assert.equal(
  Object.keys(euOnlyPath.elements).some((id) => id.includes("@@us/")),
  false,
  "the same path materialized in another environment is excluded",
);
assert.equal(
  Object.values(euOnlyPath.elements)
    .filter((element) => element.capabilities?.includes("deployment-element") === true)
    .every((element) => element.context === "eu"),
  true,
  "deployment elements come only from the selected endpoint environment",
);
const euPathSelectedFromAnotherTab = selectPathGraph(
  multiEnvironmentResult,
  "multi/source",
  "multi/target",
  { context: "eu", tab: "multi-eu.ai", view: "deployment-container", environment: "eu" },
  { targetEnvironment: "eu" },
);
assert(
  euPathSelectedFromAnotherTab.edges.length > 0,
  "an environment-scoped path remains rooted at its source when the target is selected from another tab",
);
const mixedEnvironmentPath = selectPathGraph(
  multiEnvironmentResult,
  "multi/source",
  "multi/target",
  { context: "multi", tab: "multi-model.ai", view: "deployment-container", environment: "eu" },
  { sourceEnvironment: "eu", targetEnvironment: "us" },
);
assert.equal(mixedEnvironmentPath.edges.length, 0, "endpoints selected in different environments have no path");
assert.deepEqual(
  new Set(Object.keys(mixedEnvironmentPath.elements)),
  new Set(["multi/source", "multi/target"]),
  "a mixed-environment result still renders both requested endpoints",
);

const rolledUpResult = linkProject({
  snapshot: coreLanguageSnapshot,
  sources: [source("rolled-up.ai", `
context demo

external actor user
    name = User
    links:
        -> ui from demo
        -> oidc from demo

external system google
    name = Google Identity

system editor
    name = Editor
    container web
        name = Web
        component ui
            name = UI
            links:
                -> oidc
        component oidc
            name = OIDC
            links:
                -> google from demo
`)],
});
assertNoErrors(rolledUpResult.diagnostics);
const rolledUpPath = selectPathGraph(
  rolledUpResult,
  "demo/user",
  "demo/google",
  { context: "demo", tab: "rolled-up.ai", view: "c1" },
);
assert.deepEqual(
  new Set(rolledUpPath.edges.map((edge) => `${edge.source}->${edge.target}`)),
  new Set(["demo/user->demo/editor", "demo/editor->demo/google"]),
  "the C1 path corridor includes relationships rolled up from nested endpoints",
);
assert.equal(rolledUpPath.edges.every((edge) => edge.derived), true);
assert.deepEqual(
  new Set(rolledUpPath.edges.map((edge) => `${edge.edge.source}->${edge.edge.target}`)),
  new Set(["demo/user->demo/ui", "demo/user->demo/oidc", "demo/oidc->demo/google"]),
  "rendered roll-up edges preserve their authored endpoint provenance",
);
const componentScalePath = selectPathGraph(
  rolledUpResult,
  "demo/user",
  "demo/google",
  { context: "demo", tab: "rolled-up.ai", view: "c3" },
);
assert.deepEqual(
  new Set(componentScalePath.edges.map((edge) => `${edge.source}->${edge.target}`)),
  new Set([
    "demo/user->demo/ui",
    "demo/user->demo/oidc",
    "demo/ui->demo/oidc",
    "demo/oidc->demo/google",
  ]),
  "the C3 path corridor keeps both the direct route and the longer alternative at the current scale",
);
assert.equal(componentScalePath.elements["demo/editor"], undefined, "the C1 system shortcut is absent from a C3 path");
assert.equal(
  componentScalePath.groups.some((group) => group.owner === "demo/web"
    && group.elements.includes("demo/ui") && group.elements.includes("demo/oidc")),
  true,
  "the current view boundary is retained in the path result",
);

const isolatedOidc = selectIsolatedElementGraph(
  rolledUpResult,
  "demo/oidc",
  { context: "demo", tab: "rolled-up.ai", view: "c3" },
);
assert.deepEqual(
  new Set(Object.keys(isolatedOidc.elements)),
  new Set(["demo/user", "demo/ui", "demo/oidc", "demo/google"]),
  "isolate keeps only the selected element and its direct neighbors as nodes",
);
assert.deepEqual(isolatedOidc.groups, [], "isolate removes architectural boundaries from the result");
assert.deepEqual(isolatedOidc.layout, {
  kind: "isolate",
  focus: "demo/oidc",
  incoming: ["demo/ui", "demo/user"],
  outgoing: ["demo/google"],
}, "isolate groups neighbors by their relationship direction");
assert.deepEqual(
  new Set(isolatedOidc.edges.map((edge) => `${edge.source}->${edge.target}`)),
  new Set(["demo/user->demo/oidc", "demo/ui->demo/oidc", "demo/oidc->demo/google"]),
  "isolate keeps only relationships incident to the selected element",
);
assert.equal(
  isolatedOidc.edges.some((edge) => edge.source === "demo/user" && edge.target === "demo/ui"),
  false,
  "relationships between neighboring elements do not expand the one-hop isolate",
);

const dot = renderGraphviz(result, isolatedApi, "dark");
assert(dot.includes("rankdir=LR"), "isolate renders incoming and outgoing groups horizontally");
assert(dot.includes('{ rank=same; "shop/frontend"; }'), "incoming neighbors share one rank");
assert(dot.includes('{ rank=same; "shop/api"; }'), "the isolated element has its own central rank");
assert(dot.includes('{ rank=same; "shop/billing"; "shop/queue"; "shop/worker"; }'), "outgoing neighbors share one rank");
assert.equal(dot.includes("subgraph cluster_"), false, "isolate renders no boundary clusters");
const workerStatement = dot.split("\n").find((line) => line.includes('"shop/worker" ['));
assert(workerStatement);
assert.equal(workerStatement.includes("URL="), false, "element nodes no longer navigate on a plain click");
assert(dot.includes("insight://goto?"), "relationship declarations retain their own source navigation");

console.log("diagram quick actions contracts passed");

function assertNoErrors(diagnostics) {
  assert.deepEqual(diagnostics.filter((item) => item.level === undefined || item.level === "ERROR"), []);
}

function source(sourceName, sourceText) {
  return { sourceName, source: sourceText.trimStart() };
}
