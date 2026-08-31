import assert from "node:assert/strict";
import {
  initialInsightLineLexerState,
  tokenizeInsightLine,
} from "../build/runtime/index.js";

const cases = [
  startsWithAClosedRootState,
  reportsVisibleTokensAndSourcePositions,
  carriesMultilineTextStateAcrossIndentedLines,
  closesMultilineTextAtItsIndentationBoundary,
  treatsTabsAsFourColumnIndentation,
];

for (const testCase of cases) {
  testCase();
}

console.log("line tokenizer contract fixtures passed");

function startsWithAClosedRootState() {
  assert.deepEqual(initialInsightLineLexerState(), {
    textOpen: false,
    indentation: 0,
  });
  assert.deepEqual(tokenizeInsightLine(""), {
    tokens: [],
    endState: { textOpen: false, indentation: 0 },
  });
}

function reportsVisibleTokensAndSourcePositions() {
  const result = tokenizeInsightLine("context demo # note");

  assert.deepEqual(result.tokens, [
    { name: "CONTEXT", text: "context", startIndex: 0, stopIndex: 6 },
    { name: "IDENTIFIER", text: "demo", startIndex: 8, stopIndex: 11 },
    { name: "COMMENT", text: "# note", startIndex: 13, stopIndex: 18 },
  ]);
  assert.deepEqual(result.endState, { textOpen: false, indentation: 0 });
  assert.equal(result.tokens.some((token) => token.name === "WHITESPACE"), false);
  assert.equal(result.tokens.some((token) => token.name === "EOL"), false);
}

function carriesMultilineTextStateAcrossIndentedLines() {
  const first = tokenizeInsightLine("    description = first line");
  assert.deepEqual(first.endState, { textOpen: true, indentation: 1 });
  assert.deepEqual(first.tokens.map(compactToken), [
    ["IDENTIFIER", "description", 4, 14],
    ["EQ", "= ", 16, 17],
    ["TEXT", "first line", 18, 27],
  ]);

  const continuation = tokenizeInsightLine("        second line", first.endState);
  assert.deepEqual(continuation.endState, { textOpen: true, indentation: 1 });
  assert(
    continuation.tokens.some((token) => token.name === "TEXT"
      && token.text === "second line"
      && token.startIndex === 8
      && token.stopIndex === 18),
  );
  assert(continuation.tokens.every((token) => token.startIndex >= 0));
  assert(continuation.tokens.every((token) => token.stopIndex < "        second line".length));
}

function closesMultilineTextAtItsIndentationBoundary() {
  const state = tokenizeInsightLine("    description = first line").endState;
  const boundary = tokenizeInsightLine("    system api", state);

  assert.deepEqual(boundary.endState, { textOpen: false, indentation: 1 });
  assert.deepEqual(boundary.tokens.map((token) => token.name), ["IDENTIFIER", "IDENTIFIER"]);

  const root = tokenizeInsightLine("system api", boundary.endState);
  assert.deepEqual(root.endState, { textOpen: false, indentation: 0 });
}

function treatsTabsAsFourColumnIndentation() {
  const result = tokenizeInsightLine("\t\tservice api");
  assert.deepEqual(result.endState, { textOpen: false, indentation: 2 });
  assert.deepEqual(result.tokens.map(compactToken), [
    ["IDENTIFIER", "service", 2, 8],
    ["IDENTIFIER", "api", 10, 12],
  ]);
}

function compactToken(token) {
  return [token.name, token.text, token.startIndex, token.stopIndex];
}
