import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildLanguageSnapshotResultFromSources,
  coreLanguageSnapshot,
  linkProject,
} from "../build/runtime/index.js";

const definitions = buildLanguageSnapshotResultFromSources([
  source("definitions.ai", `
define type RoutedEnvironment of Environment
    Compute compute
    InfrastructureComponent tgw
    InfrastructureComponent privateGateway
    Storage database
    Storage archive
`),
], [coreLanguageSnapshot]);
assertNoErrors(definitions.diagnostics);

const result = linkProject({
  snapshot: definitions.snapshot,
  sources: [
    environment("us", true),
    environment("eu", false),
    environment("latam", false),
    source("model.ai", `
context application

deploymentProfile source_profile
    appliesTo:
        production from us
    runsOn compute

deploymentProfile target_profile
    appliesTo:
        production from latam
    runsOn compute

system product
    name = Product

    service caller
        name = Caller
        deployment:
            uses source_profile
            uses database
        links:
            -> callee
                technology = HTTPS
                description = Calls callee
                deployment:
                    route macroRegion

    service archiver
        name = Archiver
        deployment:
            uses source_profile
            uses archive

    service callee
        name = Callee
        deployment:
            uses target_profile
`),
  ],
});

assertNoErrors(result.diagnostics);
const projected = result.edges.filter((edge) => edge.projected === true);
const routed = projected.filter((edge) => edge.projectionRoot === "us/macroRegion");
assert.deepEqual(
  new Set(routed.map((edge) => `${edge.source} ${edge.operator} ${edge.target}`)),
  new Set([
    "application/caller -> eu/tgw_eu",
    "eu/tgw_eu connectTo latam/tgw_latam",
    "latam/tgw_latam connectTo latam/gateway_latam",
    "latam/gateway_latam -> application/callee",
  ]),
);
assert.equal(routed.filter((edge) => edge.operator === "->").length, 2);
assert(routed.filter((edge) => edge.operator === "->")
  .every((edge) => edge.attributes.description?.[0] === "Calls callee"));
assert.equal(projected.find((edge) => edge.source === "application/caller")?.sourcePlacement, "us/compute_us");
assert.equal(projected.find((edge) => edge.target === "application/callee")?.targetPlacement, "latam/compute_latam");
assert(projected.some((edge) => edge.source === "application/caller"
  && edge.target === "latam/database_latam"
  && edge.sourcePlacement === "us/compute_us"));
assert(projected.some((edge) => edge.source === "application/archiver"
  && edge.target === "latam/archive_latam"
  && edge.sourcePlacement === "us/compute_us"));

const local = link(`
context local_application

deploymentProfile regional
    appliesTo:
        production from us
        production from eu
    runsOn compute

system product
    name = Product
    service caller
        name = Caller
        deployment:
            uses regional
        links:
            -> callee
                deployment:
                    route clusterLocal
    service callee
        name = Callee
        deployment:
            uses regional
`);
assertNoErrors(local.diagnostics);
assert.equal(local.edges.filter((edge) => edge.projected && edge.projectionRoot?.endsWith("/clusterLocal")).length, 2);

const broadcast = link(`
context broadcast_application

deploymentProfile source_profile
    appliesTo:
        production from us
    runsOn compute

deploymentProfile target_profile
    appliesTo:
        production from eu
        production from latam
    runsOn compute

system product
    name = Product
    service caller
        name = Caller
        deployment:
            uses source_profile
        links:
            -> callee
                deployment:
                    route broadcast
    service callee
        name = Callee
        deployment:
            uses target_profile
`);
assertNoErrors(broadcast.diagnostics);
assert.deepEqual(
  new Set(broadcast.edges.filter((edge) => edge.projected).map((edge) => edge.targetPlacement)),
  new Set(["eu/compute_eu", "latam/compute_latam"]),
);

const missing = link(`
context missing_application

deploymentProfile source_profile
    appliesTo:
        production from us
    runsOn compute

deploymentProfile target_profile
    appliesTo:
        production from eu
    runsOn compute

system product
    name = Product
    service caller
        name = Caller
        deployment:
            uses source_profile
        links:
            -> callee
                deployment:
                    route macroRegion
    service callee
        name = Callee
        deployment:
            uses target_profile
`);
const missingTarget = missing.diagnostics.find((d) => d.code === "ROUTE_TARGET_DEPLOYMENT_MISSING");
assert.equal(missingTarget?.sourceName, "us.ai");
assert.match(missingTarget.message, /required by route 'macroRegion'.*caller → missing_application\/callee at model\.ai:\d+:\d+/);

const ambiguousSelection = link(`
context ambiguous_selection

deploymentProfile regional
    appliesTo:
        production from us
        production from eu
    runsOn compute

system product
    name = Product
    service caller
        name = Caller
        deployment:
            uses regional
        links:
            -> callee
                deployment:
                    route clusterLocal
                    route broadcast
    service callee
        name = Callee
        deployment:
            uses regional
`);
assertDiagnostic(ambiguousSelection, "ROUTE_SELECTION_AMBIGUOUS");

const undeployedEndpoints = link(`
context undeployed_endpoints

system product
    name = Product
    service caller
        name = Caller
        links:
            -> callee
                deployment:
                    route clusterLocal
    service callee
        name = Callee
`);
assertDiagnostic(undeployedEndpoints, "ROUTE_ENDPOINT_DEPLOYMENT_MISSING");

const undeclaredRoute = link(`
context undeclared_route

deploymentProfile regional
    appliesTo:
        production from us
    runsOn compute

system product
    name = Product
    service caller
        name = Caller
        deployment:
            uses regional
        links:
            -> callee
                deployment:
                    route doesNotExist
    service callee
        name = Callee
        deployment:
            uses regional
`);
assertDiagnostic(undeclaredRoute, "ROUTE_NOT_DECLARED");

const transitOnly = link(`
context transit_only

deploymentProfile regional
    appliesTo:
        production from us
    runsOn compute

system product
    name = Product
    service caller
        name = Caller
        deployment:
            uses regional
        links:
            -> callee
                deployment:
                    route transitOnly
    service callee
        name = Callee
        deployment:
            uses regional
`);
assertDiagnostic(transitOnly, "ROUTE_ENDPOINT_SECTION_REQUIRED");

const incompleteSection = link(`
context incomplete_section

deploymentProfile regional
    appliesTo:
        production from us
    runsOn compute

system product
    name = Product
    service caller
        name = Caller
        deployment:
            uses regional
        links:
            -> callee
                deployment:
                    route incomplete
    service callee
        name = Callee
        deployment:
            uses regional
`);
assertDiagnostic(incompleteSection, "ROUTE_SECTION_OUTPUT_REQUIRED");
assert.equal(incompleteSection.diagnostics.filter(d => d.code.startsWith("ROUTE_")).length, 1);
assert(!incompleteSection.edges.some(e => e.projected));

const missingInfrastructure = link(`
context missing_infrastructure

deploymentProfile regional
    appliesTo:
        production from us
    runsOn compute

system product
    name = Product
    service caller
        name = Caller
        deployment:
            uses regional
        links:
            -> callee
                deployment:
                    route missingInfrastructure
    service callee
        name = Callee
        deployment:
            uses regional
`);
assertDiagnostic(missingInfrastructure, "ROUTE_INFRASTRUCTURE_MISSING");

const unresolvedEnvironment = link(`
context unresolved_environment

deploymentProfile regional
    appliesTo:
        production from us
    runsOn compute

system product
    name = Product
    service caller
        name = Caller
        deployment:
            uses regional
        links:
            -> callee
                deployment:
                    route unresolvedEnvironment
    service callee
        name = Callee
        deployment:
            uses regional
`);
assertDiagnostic(unresolvedEnvironment, "ROUTE_DEPLOYMENT_NOT_FOUND");

const nestedInfrastructure = link(`
context nested_infrastructure

deploymentProfile regional
    appliesTo:
        production from us
    runsOn compute

system product
    name = Product
    service caller
        name = Caller
        deployment:
            uses regional
        links:
            -> callee
                deployment:
                    route nestedInfrastructure
    service callee
        name = Callee
        deployment:
            uses regional
`);
assertNoErrors(nestedInfrastructure.diagnostics);
assert(nestedInfrastructure.edges.some((edge) => edge.projected === true
  && edge.target === "us/firewall_a_us"));

const ambiguousInfrastructure = link(`
context ambiguous_infrastructure

deploymentProfile regional
    appliesTo:
        production from us
    runsOn compute

system product
    name = Product
    service caller
        name = Caller
        deployment:
            uses regional
        links:
            -> callee
                deployment:
                    route ambiguousInfrastructure
    service callee
        name = Callee
        deployment:
            uses regional
`);
assertDiagnostic(ambiguousInfrastructure, "ROUTE_INFRASTRUCTURE_AMBIGUOUS");

const targetOnlyDeployment = link(`
context target_only_deployment

deploymentProfile target_profile
    appliesTo:
        production from us
    runsOn compute

system product
    name = Product
    service caller
        name = Caller
        links:
            -> callee
                deployment:
                    route clusterLocal
    service callee
        name = Callee
        deployment:
            uses target_profile
`);
assertDiagnostic(targetOnlyDeployment, "ROUTE_ENDPOINT_NOT_PLACED");

const actorEndpoint = link(`
context actor_endpoint

deploymentProfile target_profile
    appliesTo:
        production from us
    runsOn compute

actor user
    name = User
    links:
        -> api
            deployment:
                route clusterLocal

system product
    name = Product
    service api
        name = API
        deployment:
            uses target_profile
`);
assertNoErrors(actorEndpoint.diagnostics);
assert(actorEndpoint.edges.some((edge) => edge.projected === true
  && edge.source === "actor_endpoint/user"
  && edge.target === "actor_endpoint/api"
  && edge.sourcePlacement === undefined
  && edge.targetPlacement === "us/compute_us"));

const unsupportedRouteTerm = link(`
context unsupported_route_term

deploymentProfile regional
    appliesTo:
        production from us
    runsOn compute

system product
    name = Product
    service caller
        name = Caller
        deployment:
            uses regional
        links:
            -> callee
                deployment:
                    route unsupportedTerm
    service callee
        name = Callee
        deployment:
            uses regional
`);
assertDiagnostic(unsupportedRouteTerm, "ROUTE_TERM_NOT_SUPPORTED");

for (const route of ["inboundOnly", "logicalInInbound", "physicalSections"]) {
  const sectionVariant = link(`
context ${route}

deploymentProfile regional
    appliesTo:
        production from us
    runsOn compute

system product
    name = Product
    service caller
        name = Caller
        deployment:
            uses regional
        links:
            -> callee
                technology = HTTPS
                deployment:
                    route ${route}
    service callee
        name = Callee
        deployment:
            uses regional
`);
  assertNoErrors(sectionVariant.diagnostics);
  assert(sectionVariant.edges.some((edge) => edge.projected === true));
}

const reverse = link(`
context reverse_route

deploymentProfile regional
    appliesTo:
        production from us
    runsOn compute

system product
    name = Product
    service caller
        name = Caller
        deployment:
            uses regional
        links:
            -> callee
                deployment:
                    route reverse
    service callee
        name = Callee
        deployment:
            uses regional
`);
assertNoErrors(reverse.diagnostics);
assert(reverse.edges.some((edge) => edge.projected === true
  && edge.source === "reverse_route/callee"
  && edge.target === "reverse_route/caller"));

const danglingBoundary = link(`
context dangling_boundary

deploymentProfile source_profile
    appliesTo:
        production from us
    runsOn compute

deploymentProfile target_profile
    appliesTo:
        production from eu
        production from latam
    runsOn compute

system product
    name = Product
    service caller
        name = Caller
        deployment:
            uses source_profile
        links:
            -> callee
                deployment:
                    route danglingBoundary
    service callee
        name = Callee
        deployment:
            uses target_profile
`);
assertDiagnostic(danglingBoundary, "ROUTE_SECTION_NOT_CONNECTED");

const orphanProjection = link(`
context orphan_projection

projection orphan
    outbound:
        $from originalLink $this
`);
assertDiagnostic(orphanProjection, "PROJECTION_OWNER_REQUIRED");

const unplacedComponentConsumer = link(`
context unplaced_component_consumer

deploymentProfile unplaced
    appliesTo:
        production from us

system product
    name = Product
    service consumer
        name = Consumer
        deployment:
            uses unplaced
            uses archive
`);
assertDiagnostic(unplacedComponentConsumer, "PROJECTION_SOURCE_NOT_PLACED");

const explicitlyQualifiedComponent = link(`
context explicitly_qualified_component

deploymentProfile regional
    appliesTo:
        production from us
    runsOn compute

system product
    name = Product
    service consumer
        name = Consumer
        deployment:
            uses regional
            uses archive_us from us
`);
assertNoErrors(explicitlyQualifiedComponent.diagnostics);
assert(explicitlyQualifiedComponent.edges.some((edge) => edge.projected === true
  && edge.source === "explicitly_qualified_component/consumer"
  && edge.target === "latam/archive_latam"));

const probeModel = source("caller.ai", `
context probe
deploymentProfile sender
    appliesTo:
        production from us
    runsOn compute
deploymentProfile receiver
    appliesTo:
        production from latam
    runsOn compute
system app
    name = App
    service caller
        name = Caller
        deployment:
            uses sender
            uses archive
        links:
            -> callee
                deployment:
                    route macroRegion
    service callee
        name = Callee
        deployment:
            uses receiver
`);
function probeRoute(route, storage, model = probeModel) {
  const us = environment("us", false);
  let inventory = us.source.replace("                infrastructureComponent firewall_a_us", [
    "                infrastructureComponent edgeGateway",
    "                    name = Edge gateway",
    "                infrastructureComponent outboundGateway",
    "                    name = Outbound gateway",
    "                infrastructureComponent firewall_a_us",
  ].join("\n"));
  if (storage) {
    inventory = inventory.replace(/        storage archive_us\n            name = Archive us/, () =>
      storage.split("\n").map(line => "        " + line).join("\n"));
  }
  return linkProject({ snapshot: definitions.snapshot, sources: [
    source(us.sourceName, inventory + "\n" + route),
    environment("eu_central_1", false), environment("latam", false), model,
  ] });
}
const cursorProbe = probeRoute(`route macroRegion
    outbound:
        $from connectTo tgw
        tgw connectTo tgw in latam
        tgw originalLink $to in latam`);
assertNoErrors(cursorProbe.diagnostics);
assert.deepEqual(cursorProbe.edges.filter(e => e.projectionRoot === "us/macroRegion")
  .map(e => [e.source, e.target]), [
  ["probe/caller", "us/tgw_us"], ["us/tgw_us", "latam/tgw_latam"], ["latam/tgw_latam", "probe/callee"],
]);
const isolated = cursorProbe.diagnostics.filter(d => d.code === "ISOLATED_ELEMENT" && d.sourceName === "us.ai");
assert(!isolated.some(d => d.message.includes("'macroRegion'")));
assert(isolated.some(d => d.message.includes("'clusterLocal'")));

// Moving the US branch must leave the independently created EU branch live.
const branchProbe = probeRoute(`route macroRegion
    outbound:
        $from connectTo tgw
        $from connectTo tgw in eu_central_1
        tgw in us connectTo tgw in latam
        tgw originalLink $to in latam`);
assertNoErrors(branchProbe.diagnostics);
assert.deepEqual(branchProbe.edges.filter(e => e.projectionRoot === "us/macroRegion" && e.operator === "->")
  .map(e => e.source).sort(), ["eu_central_1/tgw_eu_central_1", "latam/tgw_latam"]);

const brokenStorage = probeRoute(`route macroRegion
    outbound:
        $from originalLink $to in latam`, `storage reports
    name = Reports
    projection:
        outbound:
            $from connectTo privateGateway
        inbound:
            $from originalLink $this`);
const storageErrors = brokenStorage.diagnostics.filter(d => d.level === undefined || d.level === "ERROR");
assert.equal(storageErrors.length, 1);
assert.match(storageErrors[0].message, /section 'outbound' must reach '\$this'/);
assert(!brokenStorage.edges.some(e => e.projectionRoot === "us/reports"));

for (const file of ["docs/deployment.md", ...["deployment", "deployment-projections"]
  .map(name => `archinsight-cli/src/skill/resources/shared/references/${name}.md`)]) {
  const markdown = readFileSync(new URL("../../../" + file, import.meta.url), "utf8");
  const blocks = [...markdown.matchAll(/^```insight\n([\s\S]*?)\n```/gm)].map(match => match[1]);
  const route = blocks.find(block => block.includes("route macroRegion\n"));
  const storage = blocks.find(block => block.startsWith("storage ") && block.includes("transit:"));
  assert(route && storage, file);
  const linked = probeRoute(route.slice(route.indexOf("route macroRegion")), storage);
  assertNoErrors(linked.diagnostics);
  assert(linked.edges.some(e => e.projected && e.target === "probe/callee"), file);
  assert(linked.edges.some(e => e.projected && e.target === "eu_central_1/archive_eu_central_1"), file);
}

const migration = probeRoute(`route macroRegion
    outbound:
        source $from originalLink target tgw
            technology = HTTPS
        target tgw connectTo target $to`, undefined, {
  ...probeModel, source: probeModel.source.replace("route macroRegion", "uses oldNetwork"),
});
const migrationErrors = migration.diagnostics.filter(d => d.level === undefined || d.level === "ERROR");
assert.equal(migrationErrors.length, 3);
assert.equal(migrationErrors.filter(d => d.message.includes("prefixes 'source' and 'target' were removed")).length, 2);
assert(migrationErrors.some(d => d.code === "WIRE_USES_REMOVED" && d.sourceName === "caller.ai"));

console.log("deployment route contracts passed");

function environment(name, withRoute) {
  return source(`${name}.ai`, `
environment ${name}
    name = ${name}

deployment production
    compute:
        compute compute_${name}
            name = Compute ${name}
            components:
                infrastructureComponent firewall_a_${name}
                    name = Firewall A ${name}
                infrastructureComponent firewall_b_${name}
                    name = Firewall B ${name}
    tgw:
        infrastructureComponent tgw_${name}
            name = TGW ${name}
    privateGateway:
        infrastructureComponent gateway_${name}
            name = Private gateway ${name}
    database:
        storage database_${name}
            name = Database ${name}
${withRoute ? `            projection:
                outbound:
                    $from originalLink $this in latam
` : ""}
    archive:
        storage archive_${name}
            name = Archive ${name}
${withRoute ? `            projection:
                outbound:
                    $from connectTo $this
                inbound:
                    $from originalLink $this in latam
` : ""}
route clusterLocal
    outbound:
        $from originalLink $to

${withRoute ? `
route macroRegion
    outbound:
        $from originalLink $to
    transit:
        $from connectTo tgw in production from eu
        tgw connectTo $to
    inbound:
        $from connectTo tgw in production from latam
        tgw connectTo privateGateway
        privateGateway originalLink $to

route broadcast
    outbound:
        $from originalLink $to in eu
        $from originalLink $to in latam

route transitOnly
    transit:
        $from connectTo tgw
        tgw connectTo $to

route incomplete
    outbound:
        $from connectTo tgw
    transit:
        $from connectTo tgw
        tgw connectTo $to
    inbound:
        $from originalLink $to

route missingInfrastructure
    outbound:
        $from connectTo absent
        absent originalLink $to

route unresolvedEnvironment
    outbound:
        $from originalLink $to in nowhere

route nestedInfrastructure
    outbound:
        $from connectTo firewall_a_${name}
        firewall_a_${name} originalLink $to

route ambiguousInfrastructure
    outbound:
        $from connectTo components
        components originalLink $to

route unsupportedTerm
    outbound:
        $from originalLink $this

route inboundOnly
    inbound:
        $from originalLink $to

route logicalInInbound
    outbound:
        $from connectTo $to
    inbound:
        $from originalLink $to

route physicalSections
    outbound:
        $from connectTo $to
    inbound:
        $from connectTo $to

route reverse
    outbound:
        $to originalLink $from

route danglingBoundary
    outbound:
        $from originalLink $to in eu
        $from originalLink $to in latam
    inbound:
        $from in eu originalLink $to
` : ""}`);
}

function link(model) {
  return linkProject({
    snapshot: definitions.snapshot,
    sources: [environment("us", true), environment("eu", false), environment("latam", false), source("model.ai", model)],
  });
}

function assertNoErrors(diagnostics) {
  assert.deepEqual(
    diagnostics.filter((item) => item.level === undefined || item.level === "ERROR"),
    [],
  );
}

function assertDiagnostic(result, code) {
  assert(
    result.diagnostics.some((diagnostic) => diagnostic.code === code),
    `Expected diagnostic ${code}, got ${result.diagnostics.map((diagnostic) => diagnostic.code).join(", ")}`,
  );
}

function source(sourceName, sourceText) {
  return { sourceName, source: sourceText.trimStart() };
}
