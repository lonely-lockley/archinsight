import assert from "node:assert/strict";
import {
  CompletionEngine,
  buildLanguageSnapshotResultFromSources,
  builtinViewDefinition,
  coreLanguageSnapshot,
  createGeneratedInsightSyntaxProvider,
  linkProject,
  selectGraph,
} from "../build/runtime/index.js";

const definitions = buildLanguageSnapshotResultFromSources([source("custom-deployment.ai", `
define operator AlternativeProfileUse of Edge
    constructor deployedWith DeploymentProfile
        on Element

    capability = "deployment-use"

define operator AlternativeInfrastructureUse of Edge
    constructor connectedVia InfrastructureComponent
        on Element

    constructor connectedVia NetworkConnection
        on Wire

    capability = "deployment-use"

define operator AlternativePlacement of Edge
    constructor hostedBy InfrastructureComponent
        on DeploymentProfile or Element

    capability = "deployment-placement"

define type AppEnvironment of Environment
    Compute compute
    NetworkConnection network
`)], [coreLanguageSnapshot]);
assertNoErrors(definitions.diagnostics);

const result = linkProject({
  snapshot: definitions.snapshot,
  sources: [
    source("infra.ai", `
environment cluster
    name = Cluster

deployment production
    compute:
        compute k8s
            name = Kubernetes
    network:
        networkConnection private
            name = Private network
            projection:
                source $from originalLink target $to
`),
    source("model.ai", `
context shop

deploymentProfile regional
    appliesTo:
        production from cluster
    hostedBy compute

system storefront
    name = Storefront

    service web
        name = Web
        deployment:
            deployedWith regional
        links:
            -> api
                deployment:
                    connectedVia network

    service api
        name = API
        deployment:
            deployedWith regional
`),
  ],
});
assertNoErrors(result.diagnostics);
assert.deepEqual(result.elements.find((element) => element.id === "shop/web")?.attributes.runsOn, ["cluster/k8s"]);
const graph = selectGraph(
  result,
  { context: "shop", tab: "model.ai", view: "deployment" },
  builtinViewDefinition("deployment").query,
);
assert.deepEqual(graph.edges.map((edge) => `${edge.source}->${edge.target}`), ["shop/web->shop/api"]);

const completion = new CompletionEngine(createGeneratedInsightSyntaxProvider()).complete({
  sourceName: "draft.ai",
  source: "context shop\n\nsystem storefront\n    deployment:\n        ",
  cursorOffset: "context shop\n\nsystem storefront\n    deployment:\n        ".length,
  snapshot: definitions.snapshot,
  contextIds: ["shop"],
});
const labels = new Set(completion.items.map((item) => item.label));
assert(labels.has("deployedWith"));
assert(labels.has("connectedVia"));
assert(labels.has("hostedBy"));

console.log("deployment semantic capability contracts passed");

function source(sourceName, sourceText) {
  return { sourceName, source: sourceText.trimStart() };
}

function assertNoErrors(diagnostics) {
  assert.deepEqual(diagnostics.filter((item) => item.level === undefined || item.level === "ERROR"), []);
}
