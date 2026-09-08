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

const { queryVariableOccurrences } = await import('../build/runtime/index.js');
const source = "# $tab\nMATCH (n) WHERE n.name = '$context' AND n.sourceIdentity = $tab\nOR n.context = $context AND";
const occurrences = queryVariableOccurrences(source);
assert.deepEqual(occurrences.map((item) => item.name), ['tab', 'context']);
for (const item of occurrences) assert.equal(source.slice(item.startOffset, item.endOffset), `$${item.name}`);
assert.deepEqual(queryVariableOccurrences(''), []);
assert.deepEqual(queryVariableOccurrences('$'), []);
assert.deepEqual(queryVariableOccurrences("'$tab"), []);
assert.deepEqual(queryVariableOccurrences('$tabSuffix $context2 $tab $tab').map((item) => item.name), ['tabSuffix', 'context2', 'tab', 'tab']);
assert.deepEqual(queryVariableOccurrences('! $ $tab').map((item) => item.name), ['tab']);
assert.throws(() => analyzeQuery('MATCH (n) WHERE n.id = $ RETURN n'), /Unsupported query variable/);
assert.throws(() => analyzeQuery("MATCH (n) WHERE n.id = '$tab"), /Unterminated string/);
assert.throws(() => analyzeQuery('MATCH (n) ! RETURN n'), /Unsupported query token/);
