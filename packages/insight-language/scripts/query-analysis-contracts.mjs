import assert from "node:assert/strict";
import { analyzeQuery } from "../build/runtime/index.js";

const lexicalReferences = analyzeQuery(`
# $tab and $context in comments are inert
MATCH (node:Element)
WHERE node.name = '$tab' OR node.description = '$context'
RETURN node
`);
assert.deepEqual(lexicalReferences.referencedVariables, []);
assert.equal(lexicalReferences.requiresSource, false);
assert.equal(lexicalReferences.requiresContext, false);

const scopeReferences = analyzeQuery(`
MATCH (node:Element)
WHERE node.sourceIdentity = $tab AND node.context = $context
RETURN node
`);
assert.deepEqual(scopeReferences.referencedVariables, ["context", "tab"]);
assert.equal(scopeReferences.requiresSource, true);
assert.equal(scopeReferences.requiresContext, true);

console.log("query analysis contracts passed");
