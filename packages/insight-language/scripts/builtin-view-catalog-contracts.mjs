import assert from "node:assert/strict";
import {
  BUILTIN_VIEW_DEFINITIONS,
  BUILTIN_VIEW_IDS,
  BUILTIN_VIEW_QUERIES,
  builtinViewDefinition,
  builtinViewHasStage,
  isBuiltinDiagramView,
  resolveBuiltinView,
} from "../build/runtime/index.js";

assert.equal(BUILTIN_VIEW_DEFINITIONS.length, 8);
assert.equal(new Set(BUILTIN_VIEW_IDS).size, BUILTIN_VIEW_IDS.length);
assert.deepEqual(BUILTIN_VIEW_IDS, BUILTIN_VIEW_DEFINITIONS.map((definition) => definition.id));
assert.deepEqual(BUILTIN_VIEW_DEFINITIONS.map((definition) => definition.order), [0, 1, 2, 3, 4, 5, 6, 7]);
const aliases = BUILTIN_VIEW_DEFINITIONS.flatMap((definition) => definition.aliases);
assert.equal(new Set(aliases).size, aliases.length);
assert(aliases.every((alias) => !BUILTIN_VIEW_IDS.includes(alias)));

for (const definition of BUILTIN_VIEW_DEFINITIONS) {
  assert.equal(BUILTIN_VIEW_QUERIES[definition.id], definition.query);
  assert(definition.query.trim().length > 0, `${definition.id} must provide a query`);
  assert.equal(isBuiltinDiagramView(definition.id), true);
  assert.equal(resolveBuiltinView(definition.id), definition);
  assert(Number.isInteger(definition.presetVersion) && definition.presetVersion > 0);
  assert(definition.legacyPresetQueries.every(({ version, query }) =>
    Number.isInteger(version) && version > 0 && version < definition.presetVersion && query.trim().length > 0
  ));
}

assert.deepEqual(
  builtinViewDefinition("deployment-system").legacyPresetQueries.map(({ version }) => version),
  [1, 2],
);
assert.deepEqual(
  builtinViewDefinition("deployment-container").legacyPresetQueries.map(({ version }) => version),
  [1, 2],
);

assert.equal(resolveBuiltinView("default"), undefined);
assert.equal(resolveBuiltinView("default", true), builtinViewDefinition("no-filter"));
assert.equal(isBuiltinDiagramView("default"), false);
assert.equal(isBuiltinDiagramView("unknown"), false);
assert.equal(isBuiltinDiagramView(null), false);

assert.deepEqual(
  BUILTIN_VIEW_DEFINITIONS.filter((definition) => !definition.sourceRequired).map((definition) => definition.id),
  ["no-filter", "c1"],
);
assert(BUILTIN_VIEW_DEFINITIONS.every((definition) => definition.contextRequired));
assert.deepEqual(
  BUILTIN_VIEW_DEFINITIONS.filter((definition) => definition.environment === "single-relevant").map((definition) => definition.id),
  ["deployment-container"],
);
assert.deepEqual(
  BUILTIN_VIEW_DEFINITIONS.filter((definition) => definition.boundary !== null).map((definition) => definition.id),
  ["c1", "c2", "c3", "c4"],
);
assert.deepEqual(
  BUILTIN_VIEW_DEFINITIONS.filter((definition) => definition.lifecycle === "legacy").map((definition) => definition.id),
  ["deployment"],
);
assert.equal(builtinViewHasStage(undefined, "deployment-materialization"), false);
assert.equal(builtinViewHasStage("deployment", "deployment-materialization"), true);
assert.equal(builtinViewHasStage("deployment-container", "deployment-environment"), true);
assert.equal(builtinViewHasStage("deployment-system", "deployment-system-rollup"), true);
assert.equal(builtinViewHasStage("c2", "deployment-materialization"), false);

console.log("built-in view catalogue contracts passed");
