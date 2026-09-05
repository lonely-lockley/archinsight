import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildLanguageSnapshotResultFromSources,
  builtinViewDefinition,
  coreLanguageSnapshot,
  linkProject,
  selectGraph,
} from "../build/runtime/index.js";

const views = Object.fromEntries(["c1", "c2", "c3", "c4"].map((name) => [
  name,
  readFileSync(
    new URL(`../../../src/main/resources/com/github/lonelylockley/insight/builtin-views/${name}.aiq`, import.meta.url),
    "utf8",
  ),
]));

const result = linkedProject(
  source("framework.ai", `
define type Module of CodeElement
    constructor module

    required Text name
    List of Wire links

extend type Component
    List of Module _

extend type Module
    List of Module _
`),
  source("model.ai", `
context app

system editor
    name = Editor

    service frontend
        name = Frontend

    service backend
        name = Backend

    service renderer
        name = Renderer
`),
  source("backend_components.ai", `
context app

extend service backend
    component api
        name = API

        module api_entry
            name = API entry
            links:
                -> repository_store

    component repository
        name = Repository

        module repository_store
            name = Repository store
`),
  source("frontend_components.ai", `
context app

import api from context app

extend service frontend
    component ui
        name = UI
        links:
            -> api
`),
  source("api_details.ai", `
context app

extend module api_entry
    module api_helper
        name = API helper
`),
);

const c1 = selectGraph(result, { context: "app", tab: "model.ai", view: "c1" }, views.c1);
assert.deepEqual(Object.keys(c1.elements), ["app/editor"]);
assert.deepEqual(c1.edges, [], "C1 must not expose relationships internal to its only system");

const c2 = selectGraph(result, { context: "app", tab: "backend_components.ai", view: "c2" }, views.c2);
assert.deepEqual(Object.keys(c2.elements).sort(), ["app/backend", "app/frontend"]);
assert.deepEqual(edgeEndpoints(c2), ["app/frontend->app/backend"]);
assert.equal(c2.externalElements.length, 0);
assert(c2.edges.every((edge) => edge.source !== edge.target), "C2 must not expose component-level links as container self-loops");

const c2Definition = builtinViewDefinition("c2");
const customC2 = selectGraph(result, {
  context: "app",
  tab: "backend_components.ai",
  pipeline: {
    boundary: c2Definition.boundary,
    stages: c2Definition.stages,
  },
}, views.c2);
assert.deepEqual(
  graphSignature(customC2),
  graphSignature(c2),
  "a custom query with the same declared pipeline must not need a built-in view name",
);

const customContainerRollup = selectGraph(result, {
  context: "app",
  tab: "model.ai",
  pipeline: {
    boundary: null,
    stages: ["deployment-system-rollup"],
    deploymentRootType: "ContainerElement",
  },
}, views.c3);
assert.deepEqual(Object.keys(customContainerRollup.elements).sort(), ["app/backend", "app/frontend"]);
assert.deepEqual(edgeEndpoints(customContainerRollup), ["app/frontend->app/backend"]);
assert.throws(() => selectGraph(result, {
  context: "app",
  tab: "model.ai",
  pipeline: {
    boundary: null,
    stages: ["deployment-system-rollup"],
  },
}, views.c3), /explicit deploymentRootType/);

const c3 = selectGraph(result, { context: "app", tab: "model.ai", view: "c3" }, views.c3);
assert.deepEqual(Object.keys(c3.elements).sort(), ["app/api", "app/repository", "app/ui"]);
assert.deepEqual(edgeEndpoints(c3), [
  "app/api->app/repository",
  "app/ui->app/api",
]);
assert(c3.edges.every((edge) =>
  hasType(c3.elements[edge.source], "ComponentElement")
  && hasType(c3.elements[edge.target], "ComponentElement")
), "C3 edges must not retain C2 container endpoints");

const c4 = selectGraph(result, { context: "app", tab: "api_details.ai", view: "c4" }, views.c4);
assert.deepEqual(Object.keys(c4.elements).sort(), ["app/api_entry", "app/api_helper", "app/repository"]);
assert.deepEqual(edgeEndpoints(c4), ["app/api_entry->app/repository"]);
assert.deepEqual(c4.externalElements, ["app/repository"]);
assert.equal(c4.elements["app/repository_store"], undefined, "C4 must fold code outside the opened component");

const directComponentNeighborhood = `
  MATCH (component:ComponentElement)
  WHERE component.context = $context
  OPTIONAL MATCH (component)-[link:REFERENCES]-(related:Element)
  RETURN component, link, related
`;
const unscoped = selectGraph(result, { context: "app", tab: "model.ai" }, directComponentNeighborhood);
for (const view of ["deployment", "no-filter"]) {
  const selected = selectGraph(result, { context: "app", tab: "model.ai", view }, directComponentNeighborhood);
  assert.deepEqual(graphSignature(selected), graphSignature(unscoped), `${view} must not apply C1-C4 boundary normalization`);
}

console.log("built-in view level isolation contracts passed");

function edgeEndpoints(graph) {
  return graph.edges.map((edge) => `${edge.source}->${edge.target}`).sort();
}

function graphSignature(graph) {
  return {
    elements: Object.keys(graph.elements).sort(),
    edges: graph.edges.map((edge) => [
      edge.source,
      edge.target,
      edge.edge.originSource ?? edge.edge.source,
      edge.edge.originTarget ?? edge.edge.target,
    ].join("|")).sort(),
    externalElements: [...graph.externalElements].sort(),
  };
}

function hasType(element, type) {
  return element !== undefined && (element.type === type || element.baseTypes.includes(type));
}

function linkedProject(...sources) {
  const snapshot = buildLanguageSnapshotResultFromSources(sources, [coreLanguageSnapshot]);
  assertNoErrors(snapshot.diagnostics);
  const linked = linkProject({ snapshot: snapshot.snapshot, sources });
  assertNoErrors(linked.diagnostics);
  return linked;
}

function assertNoErrors(diagnostics) {
  assert.deepEqual(diagnostics.filter((diagnostic) => diagnostic.level === undefined || diagnostic.level === "ERROR"), []);
}

function source(sourceName, sourceText) {
  return { sourceName, source: sourceText.trimStart() };
}
