import assert from "node:assert/strict";
import {
  buildLanguageSnapshotResultFromSources,
  canonicalDiagramElementId,
  coreLanguageSnapshot,
  declaredDeploymentEnvironments,
  diagramOccurrenceId,
  deploymentEnvironmentsForElement,
  deploymentFocusElementIds,
  diagramQuickActionMetadata,
  linkProject,
  parseDiagramOccurrenceId,
  replaceDiagramOccurrenceCanonical,
  renderGraphviz,
  selectDeploymentGraph,
  selectElementDrillDown,
  selectIsolatedElementGraph,
  selectIsolatedRenderGraph,
  selectPathGraph,
} from "../build/runtime/index.js";

assert.deepEqual(parseDiagramOccurrenceId("shop/api"), { canonicalId: "shop/api" });
assert.deepEqual(parseDiagramOccurrenceId("shop/api@@eu/node"), {
  canonicalId: "shop/api", qualifier: "eu/node",
});
assert.equal(diagramOccurrenceId("shop/api", "eu/node"), "shop/api@@eu/node");
assert.equal(replaceDiagramOccurrenceCanonical("shop/api@@eu/node", "shop/backend"), "shop/backend@@eu/node");
assert.equal(replaceDiagramOccurrenceCanonical("shop/api", "shop/backend"), "shop/backend");
assert.throws(() => diagramOccurrenceId("shop/api@@old", "new"));
assert.throws(() => diagramOccurrenceId("shop/api", ""));

const definitions = buildLanguageSnapshotResultFromSources([
  source("definitions.ai", `
define type AppEnvironment of Environment
    Compute compute
    NetworkConnection network
    ReviewGateway gateway
    ClusterLink clusterLink

define type ReviewGateway of NetworkConnection
    constructor reviewGateway
    required InfrastructureComponent relay

define type ClusterLink of NetworkConnection
    constructor clusterLink
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
    gateway:
        reviewGateway gateway
            relay:
                infrastructureComponent proxy
                    name = Review proxy
            projection:
                source $from originalLink target relay
                target relay connectTo target $to
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

system reviewSystem
    name = Review system
    service reviewSource
        name = Review source
        deployment:
            uses appProfile
        links:
            -> reviewTarget
                deployment:
                    uses gateway

    service reviewTarget
        name = Review target
        deployment:
            uses appProfile
`),
  ],
});
assert.deepEqual(declaredDeploymentEnvironments(result), [{
  id: "eu",
  name: "Europe",
  sourceIdentity: "infra.ai",
}]);
assertNoErrors(result.diagnostics);

const metadata = diagramQuickActionMetadata(result);
assert.equal(
  diagramQuickActionMetadata(result),
  metadata,
  "quick-action metadata is derived once for an immutable linked-project revision",
);
assert.equal(metadata["shop/storefront"]?.hasChildren, true);
assert.equal(metadata["shop/storefront"]?.hasDeployment, true, "a boundary inherits deployment availability from descendants");
assert.equal(metadata["shop/api"]?.hasChildren, true);
assert.equal(metadata["shop/api"]?.hasDeployment, true);
assert.equal(
  metadata["eu/eu"]?.hasChildren,
  false,
  "physical deployment descendants do not enable logical Drill down",
);
assert.equal(metadata["shop/api"]?.declaration?.sourceName, "model.ai");
assert.equal(
  metadata["shop/billing"]?.declaration?.sourceName,
  "target.ai",
  "quick actions retain the declaration file of imported elements",
);
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
  deploymentElements.every((element) => metadata[element.id]?.isolateEligible === true),
  true,
  "every rendered deployment element can be isolated",
);

const drillDown = selectElementDrillDown(result, "shop/api");
assert.deepEqual(
  new Set(Object.keys(drillDown.elements)),
  new Set(["shop/api", "shop/worker", "shop/queue", "shop/billing", "shop/frontend"]),
  "drill-down includes the next logical level and one-hop external endpoints",
);
assert.equal(drillDown.externalElements.includes("shop/billing"), true);
assert.equal(
  drillDown.groups.some((group) => group.owner === "shop/api" && group.elements.includes("shop/worker")),
  true,
);
assert.deepEqual(
  new Set(drillDown.edges.map((edge) => `${edge.source}->${edge.target}`)),
  new Set(["shop/api->shop/worker", "shop/api->shop/queue", "shop/api->shop/billing", "shop/frontend->shop/api"]),
);
assert.deepEqual(Object.keys(selectElementDrillDown(result, "shop/missing").elements), []);

const systemDrillDown = selectElementDrillDown(result, "shop/storefront");
assert.deepEqual(
  new Set(Object.keys(systemDrillDown.elements)),
  new Set(["shop/storefront", "shop/api", "shop/queue", "shop/frontend", "shop/isolated", "shop/backend"]),
  "drill-down opens only the next logical level and folds an external descendant to its closed boundary",
);
assert.equal(systemDrillDown.elements["shop/worker"], undefined, "deeper descendants stay folded");
assert.deepEqual(systemDrillDown.groups, [{
  owner: "shop/storefront",
  elements: ["shop/api", "shop/frontend", "shop/isolated", "shop/queue"],
}]);
assert.equal(
  systemDrillDown.edges.some((edge) => edge.source === "shop/api" && edge.target === "shop/backend" && edge.derived),
  true,
  "a relationship to a nested external element is rolled up to one external boundary cube",
);
const isolatedSystemDrillDown = selectIsolatedRenderGraph(systemDrillDown, "shop/api");
assert.equal(isolatedSystemDrillDown.elements["shop/worker"], undefined);
assert.deepEqual(
  new Set(Object.keys(isolatedSystemDrillDown.elements)),
  new Set(["shop/api", "shop/queue", "shop/frontend", "shop/backend"]),
  "Isolate composes with the current Drill down projection instead of rebuilding the original view",
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
const visibleDeploymentElementId = "eu/proxy";
assert(deploymentElements.some((element) => element.id === visibleDeploymentElementId));
const isolatedDeploymentElement = selectIsolatedElementGraph(
  result,
  visibleDeploymentElementId,
  { context: "shop", tab: "model.ai", view: "deployment-container", environment: "eu" },
);
assert.equal(
  isolatedDeploymentElement.layout?.focus,
  visibleDeploymentElementId,
  "Isolate keeps the exact deployment occurrence selected on the current diagram",
);
assert(
  isolatedDeploymentElement.edges.length > 0
    && isolatedDeploymentElement.edges.every((edge) =>
      edge.source === visibleDeploymentElementId || edge.target === visibleDeploymentElementId),
  "Isolate keeps every visible relationship incident to a deployment element",
);
assert(
  isolatedDeploymentElement.edges.some((edge) => edge.projected || edge.edge.projected === true),
  "Isolate keeps projected relationships because they are visible to the user",
);
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

const cyclicPathResult = linkProject({
  snapshot: coreLanguageSnapshot,
  sources: [source("cyclic-path.ai", `
context cyclic

system application
    name = Application
    service source
        name = Source
        links:
            -> target
            -> side
            -> branch

    service target
        name = Target

    service side
        name = Side
        links:
            -> source
            -> audit

    service audit
        name = Audit
        links:
            -> side

    service branch
        name = Branch
        links:
            -> target
            -> detour

    service detour
        name = Detour
        links:
            -> branch
`)],
});
assertNoErrors(cyclicPathResult.diagnostics);
const cycleFreePath = selectPathGraph(cyclicPathResult, "cyclic/source", "cyclic/target");
assert.deepEqual(
  new Set(cycleFreePath.edges.map((edge) => `${edge.source}->${edge.target}`)),
  new Set([
    "cyclic/source->cyclic/target",
    "cyclic/source->cyclic/branch",
    "cyclic/branch->cyclic/target",
  ]),
  "Find path keeps every simple route while excluding edges that require revisiting a node",
);
assert.deepEqual(
  new Set(Object.keys(cycleFreePath.elements)),
  new Set(["cyclic/source", "cyclic/branch", "cyclic/target"]),
  "Find path removes side cycles that lie on no simple source-to-target path",
);

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
const logicalMultiEnvironmentPath = selectPathGraph(
  multiEnvironmentResult,
  "multi/source",
  "multi/target",
);
assert.equal(logicalMultiEnvironmentPath.edges.length, 1);
assert.equal(
  logicalMultiEnvironmentPath.edges.every((edge) => edge.projected === false && edge.edge.projected !== true),
  true,
  "Find path without a view uses only authored logical relationships",
);
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
const euPathWithCapturedSourceScope = selectPathGraph(
  multiEnvironmentResult,
  "multi/source",
  "multi/target",
  { context: "multi", tab: "multi-model.ai", view: "deployment-container", environment: "eu" },
  { targetEnvironment: "eu" },
);
assert(
  euPathWithCapturedSourceScope.edges.length > 0,
  "an environment-scoped path uses the scope captured when Find path started",
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

const crossEnvironmentResult = linkProject({
  snapshot: definitions.snapshot,
  sources: [
    source("cross-east.ai", `
environment east
    name = East

deployment production
    compute:
        compute node
            name = East node
    clusterLink:
        clusterLink boundary
            name = Boundary link
            projection:
                source $from originalLink target $to
`),
    source("cross-west.ai", `
environment west
    name = West

deployment production
    compute:
        compute node
            name = West node
    network:
        networkConnection internal
            name = Internal network
            projection:
                source $from originalLink target $to
`),
    source("cross-model.ai", `
context cross

deploymentProfile eastProfile
    appliesTo:
        production from east
    runsOn compute

deploymentProfile westProfile
    appliesTo:
        production from west
    runsOn compute

system application
    name = Application
    service source
        name = Source
        deployment:
            uses eastProfile
        links:
            -> bridge
                deployment:
                    uses clusterLink

    service bridge
        name = Bridge
        deployment:
            uses westProfile
        links:
            -> target
                deployment:
                    uses network

    service target
        name = Target
        deployment:
            uses westProfile
`),
  ],
});
assertNoErrors(crossEnvironmentResult.diagnostics);
assert.deepEqual(
  deploymentEnvironmentsForElement(crossEnvironmentResult, "cross/bridge").map((environment) => environment.id),
  ["east", "west"],
  "deployment environments describe every D2 slice containing the element's neighborhood",
);
const eastDeployment = selectDeploymentGraph(crossEnvironmentResult, "cross/bridge", "east");
assert.deepEqual(
  eastDeployment.edges.map((edge) => `${edge.source}->${edge.target}`),
  ["cross/source->cross/bridge"],
  "a cross-environment relationship remains visible from its source-side D2 slice",
);
const eastOnlyCrossEnvironmentPath = selectPathGraph(
  crossEnvironmentResult,
  "cross/source",
  "cross/target",
  undefined,
  { sourceEnvironment: "east", targetEnvironment: "east" },
);
assert.equal(
  eastOnlyCrossEnvironmentPath.edges.length,
  0,
  "a target occurrence constrained to the wrong environment produces no physical path",
);
const selectedCrossEnvironmentPath = selectPathGraph(
  crossEnvironmentResult,
  "cross/source",
  "cross/target",
  { context: "cross", tab: "cross-model.ai", view: "deployment-container", environment: "east" },
  { sourceEnvironment: "east", targetEnvironment: "west" },
);
assert.deepEqual(
  new Set(selectedCrossEnvironmentPath.edges.map((edge) => `${edge.source}->${edge.target}`)),
  new Set(["cross/source->cross/bridge", "cross/bridge->cross/target"]),
  "Find path traverses the all-environment deployment graph between occurrences selected in different environments",
);
const allEnvironmentPath = selectPathGraph(
  crossEnvironmentResult,
  "cross/source",
  "cross/target",
  { context: "cross", tab: "cross-model.ai", view: "deployment" },
);
assert.deepEqual(
  new Set(allEnvironmentPath.edges.map((edge) => `${edge.source}->${edge.target}`)),
  new Set(["cross/source->cross/bridge", "cross/bridge->cross/target"]),
  "the all-environment deployment view finds routes that cross D2 slices",
);

const splitSourceCrossEnvironmentResult = linkProject({
  snapshot: definitions.snapshot,
  sources: [
    source("split-east.ai", `
environment east
    name = East

deployment production
    compute:
        compute node
            name = East node
    clusterLink:
        clusterLink boundary
            name = Boundary link
            projection:
                source $from originalLink target $to
`),
    source("split-west.ai", `
environment west
    name = West

deployment production
    compute:
        compute node
            name = West node
    network:
        networkConnection internal
            name = Internal network
            projection:
                source $from originalLink target $to
`),
    source("split-caller.ai", `
context split

import bridge from context split

deploymentProfile eastProfile
    appliesTo:
        production from east
    runsOn compute

deploymentProfile replicatedProfile
    appliesTo:
        production from east
        production from west
    runsOn compute

system application
    name = Application
    service source
        name = Source
        deployment:
            uses eastProfile
        links:
            -> bridge
                deployment:
                    uses clusterLink
    service replicated
        name = Replicated
        deployment:
            uses replicatedProfile
`),
    source("split-target.ai", `
context split

deploymentProfile westProfile
    appliesTo:
        production from west
    runsOn compute

system backend
    name = Backend
    service bridge
        name = Bridge
        deployment:
            uses westProfile
        links:
            -> target
                deployment:
                    uses network

    service target
        name = Target
        deployment:
            uses westProfile
`),
  ],
});
assertNoErrors(splitSourceCrossEnvironmentResult.diagnostics);
assert.deepEqual(
  deploymentEnvironmentsForElement(splitSourceCrossEnvironmentResult, "split/bridge").map((environment) => environment.id),
  ["east", "west"],
  "deployment environment discovery includes a relationship declared in another source file",
);
assert.equal(
  selectDeploymentGraph(splitSourceCrossEnvironmentResult, "split/bridge", "east").edges
    .some((edge) => edge.edge.originSource === "split/source" && edge.edge.originTarget === "split/bridge"),
  true,
  "deployment keeps an incoming cross-environment relationship declared in another source file",
);
const splitSourcePhysicalPath = selectPathGraph(
  splitSourceCrossEnvironmentResult,
  "split/source",
  "split/target",
  undefined,
  { sourceEnvironment: "east" },
);
assert.equal(
  splitSourcePhysicalPath.edges.some((edge) =>
    edge.edge.originSource === "split/bridge" && edge.edge.originTarget === "split/target"
  ),
  true,
  "a physical route continues through relationships declared in another source file",
);
const splitBridgeDeployment = selectDeploymentGraph(splitSourceCrossEnvironmentResult, "split/bridge", "west");
assert.deepEqual(
  Object.keys(splitBridgeDeployment.elements).filter((id) => canonicalDiagramElementId(id) === "split/bridge"),
  ["split/bridge@@west/node"],
  "deployment does not retain a plain logical element beside its placed occurrence",
);
assert.equal(
  new Set(splitBridgeDeployment.edges.map((edge) => `${edge.edge.id}\0${edge.source}\0${edge.target}`)).size,
  splitBridgeDeployment.edges.length,
  "deployment returns one projected edge per occurrence pair",
);
assert.deepEqual(
  Object.keys(splitSourcePhysicalPath.elements).filter((id) => canonicalDiagramElementId(id) === "split/bridge"),
  ["split/bridge@@west/node"],
  "Find path does not retain a plain logical element beside its placed occurrence",
);
assert.equal(
  new Set(splitSourcePhysicalPath.edges.map((edge) => `${edge.edge.id}\0${edge.source}\0${edge.target}`)).size,
  splitSourcePhysicalPath.edges.length,
  "Find path returns one projected edge per occurrence pair",
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
const externalSourceResult = linkProject({
  snapshot: coreLanguageSnapshot,
  sources: [
    source("app.ai", `
context app

import google from context identity
import test from context tests

system editor
    name = Editor
    service backend
        name = Backend
        component oidc
            name = OIDC
            links:
                -> google from identity
`),
    source("identity.ai", `
context identity

external system google
    name = Google Identity
`),
    source("tests.ai", `
context tests

import editor from context app

external system test
    name = Test System
    links:
        -> editor from app
`),
  ],
});
assertNoErrors(externalSourceResult.diagnostics);
const externalSourcePath = selectPathGraph(
  externalSourceResult,
  "tests/test",
  "identity/google",
  { context: "app", tab: "app.ai", view: "c1" },
);
assert.deepEqual(
  new Set(externalSourcePath.edges.map((edge) => `${edge.source}->${edge.target}`)),
  new Set(["tests/test->app/editor", "app/editor->identity/google"]),
  "Find path keeps the active view context when the source endpoint belongs to an external context",
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
assert.equal(dot.includes("insight://goto?"), false, "relationship arrows do not navigate on a plain click");

console.log("diagram quick actions contracts passed");

function assertNoErrors(diagnostics) {
  assert.deepEqual(diagnostics.filter((item) => item.level === undefined || item.level === "ERROR"), []);
}

function source(sourceName, sourceText) {
  return { sourceName, source: sourceText.trimStart() };
}
