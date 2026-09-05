import assert from "node:assert/strict";
import {
  buildLanguageSnapshotResultFromSources,
  buildProjectStructure,
  buildTypeHierarchy,
  coreLanguageSnapshot,
  filterProjectStructure,
  filterTypeHierarchy,
  linkProject,
} from "../build/runtime/index.js";

const sources = [
  source("definitions.ai", `
define type Module of CodeElement
    constructor module
    required Text name

extend type Component
    List of Module _
`),
  source("external.ai", `
context external

external system vendor
    name = Vendor
`),
  source("model.ai", `
context shop

import vendor from context external

system storefront
    name = Storefront

    service backend
        name = Backend

        component checkout
            name = Checkout

            module handler
                name = Handler
`),
];

const snapshotBuild = buildLanguageSnapshotResultFromSources(sources, [coreLanguageSnapshot]);
assertNoErrors(snapshotBuild.diagnostics);
const result = linkProject({ snapshot: snapshotBuild.snapshot, sources });
assertNoErrors(result.diagnostics);

const structure = buildProjectStructure(result);
assert.equal(structure.schemaVersion, "project-structure.v1");
assert(structure.contexts.some((context) => context.synthetic === true));

const visibleStructure = filterProjectStructure(structure, { includeSyntheticContexts: false });
assert(visibleStructure.contexts.every((context) => context.synthetic !== true));
const shop = visibleStructure.contexts.find((context) => context.id === "shop");
assert(shop);
assert.deepEqual(shop.children.map((child) => [child.kind, child.id]), [
  ["import", "vendor"],
  ["element", "storefront"],
]);
assert.equal(shop.children[0]?.constructor, "import");
assert.equal(shop.children[0]?.type, "ExternalSystem");
assert.deepEqual(declarationPath(shop.children[1]), ["storefront", "backend", "checkout", "handler"]);
assert.deepEqual(
  shop.children[1]?.children[0]?.children[0]?.children[0],
  {
    id: "handler",
    kind: "element",
    constructor: "module",
    type: "Module",
    source: "model.ai",
    line: 14,
    column: 13,
    children: [],
  },
);

const hierarchy = buildTypeHierarchy(snapshotBuild.snapshot);
const system = typeById(hierarchy, "System");
const syncWire = typeById(hierarchy, "SyncWire");
const module = typeById(hierarchy, "Module");
assert.deepEqual({ origin: system.origin, operator: system.operator }, { origin: "language", operator: false });
assert.deepEqual({ origin: syncWire.origin, operator: syncWire.operator }, { origin: "language", operator: true });
assert.deepEqual({ origin: module.origin, operator: module.operator }, { origin: "project", operator: false });

const projectTypes = filterTypeHierarchy(hierarchy, {
  includeLanguageTypes: false,
  includeOperators: false,
});
assert(typeById(projectTypes, "Module"));
assert.equal(optionalTypeById(projectTypes, "System"), undefined);
assert.equal(optionalTypeById(projectTypes, "SyncWire"), undefined);

const operatorsAndProjectTypes = filterTypeHierarchy(hierarchy, {
  includeLanguageTypes: false,
  includeOperators: true,
});
assert(typeById(operatorsAndProjectTypes, "Module"));
assert(typeById(operatorsAndProjectTypes, "SyncWire"));
assert.equal(optionalTypeById(operatorsAndProjectTypes, "System"), undefined);

const withoutModule = filterTypeHierarchy(hierarchy, {
  includeLanguageTypes: true,
  includeOperators: true,
  excludeIds: new Set(["Module"]),
});
assert.equal(optionalTypeById(withoutModule, "Module"), undefined);

console.log("project structure contracts passed");

function declarationPath(declaration) {
  return [declaration.id, ...(declaration.children[0] === undefined ? [] : declarationPath(declaration.children[0]))];
}

function typeById(hierarchy, id) {
  const type = optionalTypeById(hierarchy, id);
  assert(type, `${id} is missing from the type hierarchy`);
  return type;
}

function optionalTypeById(hierarchy, id) {
  for (const type of hierarchy) {
    if (type.id === id) {
      return type;
    }
    const child = optionalTypeById(type.children, id);
    if (child !== undefined) {
      return child;
    }
  }
  return undefined;
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
