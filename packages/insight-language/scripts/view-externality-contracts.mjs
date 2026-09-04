import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildLanguageSnapshotResultFromSources,
  coreLanguageSnapshot,
  linkProject,
  renderGraphviz,
  selectGraph,
} from "../build/runtime/index.js";

const views = Object.fromEntries(["c1", "c2", "c3", "c4"].map((name) => [
  name,
  readFileSync(
    new URL(`../../../src/main/resources/com/github/lonelylockley/insight/builtin-views/${name}.aiq`, import.meta.url),
    "utf8",
  ),
]));

const cases = [
  calculatesExternalityAtEveryViewBoundary,
  treatsEveryOpenedBoundaryAsInternal,
  preservesFocusAcrossSplitImportedAndExtendedSources,
  keepsCustomExternalPredicateModelRelative,
  resolvesExplicitExternalityFromTypeCapability,
  rendersTheSameRelativeExternalityCarriedByQueryJson,
];

let failures = 0;
for (const testCase of cases) {
  try {
    testCase();
  } catch (error) {
    failures++;
    console.error(`${testCase.name} failed`);
    console.error(error);
  }
}

if (failures > 0) {
  process.exitCode = 1;
} else {
  console.log("view-relative externality contracts passed");
}

function calculatesExternalityAtEveryViewBoundary() {
  const result = focusedSplitProject();

  const c1 = selectBuiltin(result, "c1", "storefront.ai");
  assert.deepEqual(c1.externalElements, ["shop/vendor"]);
  assertEdge(c1, "shop/storefront", "shop/payments");

  const c2 = selectBuiltin(result, "c2", "storefront.ai");
  assertInternal(c2, "shop/storefront_service");
  assertExternal(c2, "shop/payments");
  assertMissing(c2, "shop/payments_service", "shop/payments_component", "shop/payments_module");
  assertEdge(c2, "shop/storefront_service", "shop/payments");
  assertEdge(c2, "shop/payments", "shop/storefront_service");

  const c3 = selectBuiltin(result, "c3", "storefront.ai");
  assertInternal(c3, "shop/checkout_component");
  assertExternal(c3, "shop/payments_service");
  assertMissing(c3, "shop/payments_component", "shop/payments_module");
  assertEdge(c3, "shop/checkout_component", "shop/payments_service");
  assertEdge(c3, "shop/payments_service", "shop/checkout_component");

  const c4 = selectBuiltin(result, "c4", "storefront.ai");
  assertInternal(c4, "shop/checkout_module");
  assertExternal(c4, "shop/payments_component");
  assertMissing(c4, "shop/payments_module");
  assertEdge(c4, "shop/checkout_module", "shop/payments_component");
  assertEdge(c4, "shop/payments_component", "shop/checkout_module");

  for (const graph of [c1, c2, c3, c4]) {
    const edge = graph.edges.find((candidate) =>
      (candidate.edge.originSource ?? candidate.edge.source) === "shop/checkout_module"
    );
    assert.equal(edge?.edge.originTarget ?? edge?.edge.target, "shop/payments_module");
    assert.deepEqual(edge?.edge.attributes.call, ["Submit payment"]);
  }
}

function treatsEveryOpenedBoundaryAsInternal() {
  const sameFile = combinedProject();
  const extended = combinedExtendedProject();

  for (const [view, expected] of [
    ["c2", ["shop/storefront_service", "shop/payments_service"]],
    ["c3", ["shop/checkout_component", "shop/payments_component"]],
    ["c4", ["shop/checkout_module", "shop/payments_module"]],
  ]) {
    const direct = selectBuiltin(sameFile, view, "model.ai");
    const throughExtensions = selectBuiltin(extended, view, "view.ai");
    for (const id of expected) {
      assertInternal(direct, id);
      assertInternal(throughExtensions, id);
    }
    assert.deepEqual(graphSignature(throughExtensions), graphSignature(direct));
  }
}

function preservesFocusAcrossSplitImportedAndExtendedSources() {
  const direct = focusedSplitProject();
  const extended = focusedExtendedProject();
  for (const view of ["c1", "c2", "c3", "c4"]) {
    assert.deepEqual(
      graphSignature(selectBuiltin(extended, view, "storefront.ai")),
      graphSignature(selectBuiltin(direct, view, "storefront.ai")),
    );
  }
}

function keepsCustomExternalPredicateModelRelative() {
  const result = focusedSplitProject();
  const custom = selectGraph(result, { context: "shop", tab: "storefront.ai" }, `
    MATCH (element:SystemElement)
    WHERE element IS External
    RETURN element
  `);
  assert.deepEqual(Object.keys(custom.elements), ["shop/vendor"]);
  assert.equal(custom.elements["shop/payments"], undefined);
}

function resolvesExplicitExternalityFromTypeCapability() {
  const result = linkedProject(
    source("definitions.ai", `
define type PartnerSystem of System
    constructor partner
        kind = internal

    capability = "external-element"
`),
    source("model.ai", `
context shop

partner vendor
    name = Vendor

system explicitly_marked
    name = Explicitly marked
    kind = external
`),
  );
  const graph = selectGraph(result, { context: "shop" }, `
    MATCH (element:SystemElement)
    WHERE element IS External
    RETURN element
  `);

  assert.deepEqual(Object.keys(graph.elements).sort(), ["shop/explicitly_marked", "shop/vendor"]);
  assert.deepEqual([...graph.externalElements].sort(), ["shop/explicitly_marked", "shop/vendor"]);
  assert.equal(result.elements.find((element) => element.id === "shop/vendor")?.attributes.kind?.[0], "internal");
}

function rendersTheSameRelativeExternalityCarriedByQueryJson() {
  const result = focusedSplitProject();
  const graph = selectBuiltin(result, "c2", "storefront.ai");
  const dot = renderGraphviz(result, graph, "dark");
  assertExternal(graph, "shop/payments");
  assert.match(dot, /"shop__payments" \[[^\n]*fillcolor="#737C67"/);
  assert.match(dot, /"shop__storefront_service" \[[^\n]*fillcolor="#5A189A"/);
}

function focusedSplitProject() {
  return linkedProject(
    source("framework.ai", framework()),
    source("payments.ai", `
context shop

import checkout_module from context shop

system payments
    name = Payments

    service payments_service
        name = Payments service

        component payments_component
            name = Payments component

            module payments_module
                name = Payments module
                links:
                    -> checkout_module
                        call = Notify result
`),
    source("storefront.ai", `
context shop

import payments_module from context shop

external actor vendor
    name = Vendor

system storefront
    name = Storefront

    service storefront_service
        name = Storefront service

        component checkout_component
            name = Checkout component

            module checkout_module
                name = Checkout module
                links:
                    -> payments_module
                        call = Submit payment
`),
  );
}

function focusedExtendedProject() {
  return linkedProject(
    source("framework.ai", framework()),
    source("roots.ai", `
context shop

external actor vendor
    name = Vendor

system storefront
    name = Storefront

system payments
    name = Payments
`),
    source("payments.ai", `
context shop

import checkout_module from context shop

extend system payments
    service payments_service
        name = Payments service

        component payments_component
            name = Payments component

            module payments_module
                name = Payments module
                links:
                    -> checkout_module
                        call = Notify result
`),
    source("storefront.ai", `
context shop

import payments_module from context shop

extend system storefront
    service storefront_service
        name = Storefront service

        component checkout_component
            name = Checkout component

            module checkout_module
                name = Checkout module
                links:
                    -> payments_module
                        call = Submit payment
`),
  );
}

function combinedProject() {
  return linkedProject(
    source("framework.ai", framework()),
    source("model.ai", `
context shop

system storefront
    name = Storefront

    service storefront_service
        name = Storefront service

        component checkout_component
            name = Checkout component

            module checkout_module
                name = Checkout module
                links:
                    -> payments_module
                        call = Submit payment

system payments
    name = Payments

    service payments_service
        name = Payments service

        component payments_component
            name = Payments component

            module payments_module
                name = Payments module
                links:
                    -> checkout_module
                        call = Notify result
`),
  );
}

function combinedExtendedProject() {
  return linkedProject(
    source("framework.ai", framework()),
    source("roots.ai", `
context shop

system storefront
    name = Storefront

system payments
    name = Payments
`),
    source("view.ai", `
context shop

extend system storefront
    service storefront_service
        name = Storefront service

        component checkout_component
            name = Checkout component

            module checkout_module
                name = Checkout module
                links:
                    -> payments_module
                        call = Submit payment

extend system payments
    service payments_service
        name = Payments service

        component payments_component
            name = Payments component

            module payments_module
                name = Payments module
                links:
                    -> checkout_module
                        call = Notify result
`),
  );
}

function framework() {
  return `
define type Module of CodeElement
    constructor module

    required Text name
    List of Wire links

extend type Component
    List of Module _
`;
}

function linkedProject(...sources) {
  const snapshot = buildLanguageSnapshotResultFromSources(sources, [coreLanguageSnapshot]);
  assertNoErrors(snapshot.diagnostics);
  const result = linkProject({ snapshot: snapshot.snapshot, sources });
  assertNoErrors(result.diagnostics);
  return result;
}

function selectBuiltin(result, view, tab) {
  return selectGraph(result, { context: "shop", tab, view }, views[view]);
}

function graphSignature(graph) {
  return {
    elements: Object.keys(graph.elements).sort(),
    edges: graph.edges.map((edge) => [
      edge.source,
      edge.target,
      edge.edge.originSource,
      edge.edge.originTarget,
      edge.edge.operator,
    ].join("|")),
    groups: graph.groups.map((group) => `${group.owner}:${[...group.elements].sort().join(",")}`).sort(),
    external: [...graph.externalElements].sort(),
  };
}

function assertEdge(graph, sourceId, targetId) {
  assert(graph.edges.some((edge) => edge.source === sourceId && edge.target === targetId),
    `missing ${sourceId} -> ${targetId}: ${JSON.stringify(graph.edges)}`);
}

function assertInternal(graph, id) {
  assert(graph.elements[id], `${id} is missing`);
  assert.equal(graph.externalElements.includes(id), false, `${id} should be internal`);
}

function assertExternal(graph, id) {
  assert(graph.elements[id], `${id} is missing`);
  assert.equal(graph.externalElements.includes(id), true, `${id} should be external`);
}

function assertMissing(graph, ...ids) {
  for (const id of ids) {
    assert.equal(graph.elements[id], undefined, `${id} should be folded`);
  }
}

function assertNoErrors(diagnostics) {
  assert.deepEqual(diagnostics.filter((diagnostic) => diagnostic.level === undefined || diagnostic.level === "ERROR"), []);
}

function source(sourceName, sourceText) {
  return { sourceName, source: sourceText.trimStart() };
}
