import assert from "node:assert/strict";
import {
  buildLanguageSnapshotFromSources,
  coreLanguageSnapshot,
  mergeLanguageSnapshots,
  semanticHighlightInsight,
} from "../build/runtime/index.js";

const cases = [
  highlightsSameTextByParserContext,
  highlightsOperatorsAndConstructorsByRuleContext,
  highlightsProjectionTermsByRuleContext,
  highlightsContextDeclarationWhileTyping,
  highlightsAttributeNamesWhenValueIsInvalid,
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
  console.log("semantic highlighting contract fixtures passed");
}

function highlightsSameTextByParserContext() {
  const source = `
context demo

name name
    name = API
`.trimStart();
  const tokens = tokensByText(source);

  assertToken(tokens, "name", "function");
  assertToken(tokens, "name", "variable", ["declaration"]);
  assertToken(tokens, "name", "property");
}

function highlightsOperatorsAndConstructorsByRuleContext() {
  const source = `
context demo

uses publicGateway
    name = API
    -> broker

broker queue
    name = Queue
`.trimStart();
  const tokens = tokensByText(source, operatorSnapshot());

  assertToken(tokens, "uses", "operator");
  assertToken(tokens, "publicGateway", "variable");
  assertToken(tokens, "->", "operator");
  assertToken(tokens, "broker", "variable");
  assertToken(tokens, "broker", "function");
}

function highlightsProjectionTermsByRuleContext() {
  const source = `
define type Gateway of Element
    constructor gateway

    project:
        $from -> cdn
        cdn -> $this
        $slot from $owner publicGateway -> $to
`.trimStart();
  const tokens = tokensByText(source);

  assertToken(tokens, "$from", "variable");
  assertToken(tokens, "->", "operator");
  assertToken(tokens, "cdn", "property");
  assertToken(tokens, "$this", "variable");
  assertToken(tokens, "$slot", "variable");
  assertToken(tokens, "$owner", "variable");
  assertToken(tokens, "publicGateway", "property");
  assertToken(tokens, "$to", "variable");
}

function highlightsContextDeclarationWhileTyping() {
  const tokens = tokensByText("context demo");

  assertToken(tokens, "context", "keyword");
  assertToken(tokens, "demo", "variable", ["declaration"]);
}

function highlightsAttributeNamesWhenValueIsInvalid() {
  const source = `
context demo

Element api
    name =
`.trimStart();
  const tokens = tokensByText(source);

  assertToken(tokens, "name", "property");
}

function operatorSnapshot() {
  return mergeLanguageSnapshots([
    coreLanguageSnapshot,
    buildLanguageSnapshotFromSources([{
      sourceName: "operators.ai",
      source: `
define type Environment

define operator Uses of TypeSlotReference
    constructor uses Environment
        on Element
`.trimStart(),
    }]),
  ]);
}

function tokensByText(source, snapshot = coreLanguageSnapshot) {
  const lines = source.split("\n");
  const result = new Map();
  for (const token of semanticHighlightInsight(source, snapshot)) {
    const text = lines[token.line]?.slice(token.column, token.column + token.length);
    const items = result.get(text) ?? [];
    items.push(token);
    result.set(text, items);
  }
  return result;
}

function assertToken(tokens, text, type, modifiers = []) {
  const matching = tokens.get(text) ?? [];
  assert(
    matching.some((token) => token.type === type && sameModifiers(token.modifiers ?? [], modifiers)),
    `Expected ${text} as ${type}${modifiers.length === 0 ? "" : ` (${modifiers.join(", ")})`}; got ${matching.map(describeToken).join(", ")}`,
  );
}

function sameModifiers(left, right) {
  return left.length === right.length && left.every((item, index) => item === right[index]);
}

function describeToken(token) {
  const modifiers = token.modifiers?.length ? `:${token.modifiers.join(",")}` : "";
  return `${token.type}${modifiers}`;
}
