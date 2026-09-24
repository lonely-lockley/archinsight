import assert from "node:assert/strict";
import { analyzeQuery, parseQuery } from "../build/runtime/index.js";

const lexicalReferences = analyzeQuery(`
# $tab and $context in comments are inert
MATCH (node:Element)
WHERE node.name = '$tab' OR node.description = '$context'
RETURN node
`);
assert.deepEqual(lexicalReferences.referencedVariables, []);
assert.equal(lexicalReferences.requiresSource, false);
assert.equal(lexicalReferences.requiresContext, false);
assert.deepEqual(lexicalReferences.diagnostics, []);

const scopeReferences = analyzeQuery(`
MATCH (node:Element)
WHERE node.sourceIdentity = $tab AND node.context = $context
RETURN node
`);
assert.deepEqual(scopeReferences.referencedVariables, ["context", "tab"]);
assert.equal(scopeReferences.requiresSource, true);
assert.equal(scopeReferences.requiresContext, true);

const contextualTableAlias = parseQuery("MATCH (TABLE:Element) RETURN TABLE");
assert.equal(contextualTableAlias.matches[0].pattern.left.alias, "TABLE");
assert.deepEqual(contextualTableAlias.returns, ["TABLE"]);

const caseInsensitiveKeywords = parseQuery("match (node:Element) return node");
assert.equal(caseInsensitiveKeywords.matches[0].pattern.left.alias, "node");

const rangedSource = "MATCH (node:Element) RETURN TABLE elementId(node) AS id";
const ranged = parseQuery(rangedSource);
assert.equal(rangedSource.slice(ranged.range.startOffset, ranged.range.endOffset), rangedSource);
assert.equal(rangedSource.slice(ranged.clauses[0].range.startOffset, ranged.clauses[0].range.endOffset), "MATCH (node:Element)");
assert.equal(rangedSource.slice(ranged.projection.items[0].range.startOffset, ranged.projection.items[0].range.endOffset), "elementId(node) AS id");

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
const invalidVariable = analyzeQuery('MATCH (n) WHERE n.id = $ RETURN n', { sourceName: 'invalid.aiq' });
assert.equal(invalidVariable.resultKind, 'graph');
assert.equal(invalidVariable.diagnostics[0].code, 'AIQ_SYNTAX');
assert.equal(invalidVariable.diagnostics[0].sourceName, 'invalid.aiq');
assert.match(invalidVariable.diagnostics[0].message, /Unsupported query variable/);
assert(invalidVariable.diagnostics[0].endOffset > invalidVariable.diagnostics[0].startOffset);
assert.match(analyzeQuery("MATCH (n) WHERE n.id = '$tab").diagnostics[0].message, /Unterminated string/);
assert.match(analyzeQuery('MATCH (n) ! RETURN n').diagnostics[0].message, /Unsupported query token/);
assert.equal(analyzeQuery('MATCH (n) RETURN').resultKind, 'unknown');
assert.deepEqual(analyzeQuery('MATCH p = (a)-[:REFERENCES*1..3]->(b) RETURN TABLE length(p) AS hops').capabilityRequirements,
  ['path-traversal', 'table-result']);
