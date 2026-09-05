import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildLanguageSnapshotResultFromSources,
  coreLanguageSnapshot,
  linkProject,
  selectGraph,
} from "../build/runtime/index.js";

const deploymentSystemView = readFileSync(
  new URL("../../../src/main/resources/com/github/lonelylockley/insight/builtin-views/deployment-system.aiq", import.meta.url),
  "utf8",
);

const sources = [
  source("definitions.ai", `
define type AppEnvironment of Environment
    Compute compute
    NetworkConnection network
`),
  source("eu.ai", `
environment eu
    name = Europe

deployment production
    compute:
        compute compute
            name = Compute
    network:
        networkConnection network
            name = Network
            projection:
                source $from originalLink target $to
`),
  source("model.ai", `
context app

deploymentProfile application
    appliesTo:
        production from eu
    runsOn compute

external actor customer
    name = Customer
    links:
        -> frontend
            deployment:
                uses network

external system partner
    name = Partner

    service partner_api
        name = Partner API
        deployment:
            uses application

system storefront
    name = Storefront

    container frontend
        name = Frontend
        deployment:
            uses application

system payments
    name = Payments

    service backend
        name = Backend
        deployment:
            uses application
`),
  source("components.ai", `
context app

import backend from context app
import frontend from context app
import partner_api from context app

extend container frontend
    component checkout
        name = Checkout
        links:
            -> backend
                deployment:
                    uses network

extend service backend
    component payment_handler
        name = Payment handler
        links:
            -> partner_api
                deployment:
                    uses network

extend service partner_api
    component integration
        name = Integration
`),
];

const snapshot = buildLanguageSnapshotResultFromSources(sources, [coreLanguageSnapshot]);
assertNoErrors(snapshot.diagnostics);
const result = linkProject({ snapshot: snapshot.snapshot, sources });
assertNoErrors(result.diagnostics);

const declaringSource = selectD1("model.ai");
assertInternal(declaringSource, "app/storefront");
assertInternal(declaringSource, "app/payments");

const partialSource = selectD1("components.ai");
assertInternal(partialSource, "app/storefront");
assertInternal(partialSource, "app/payments");
assertExternal(partialSource, "app/partner");

console.log("deployment system partial-source boundary contracts passed");

function selectD1(tab) {
  return selectGraph(result, { context: "app", tab, view: "deployment-system" }, deploymentSystemView);
}

function assertInternal(graph, id) {
  assert(graph.elements[id], `${id} is missing`);
  assert.equal(graph.externalElements.includes(id), false, `${id} should be internal`);
}

function assertExternal(graph, id) {
  assert(graph.elements[id], `${id} is missing`);
  assert.equal(graph.externalElements.includes(id), true, `${id} should be external`);
}

function assertNoErrors(diagnostics) {
  assert.deepEqual(
    diagnostics.filter((diagnostic) => diagnostic.level === undefined || diagnostic.level === "ERROR"),
    [],
  );
}

function source(sourceName, sourceText) {
  return { sourceName, source: sourceText.trimStart() };
}
