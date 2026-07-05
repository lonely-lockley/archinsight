import assert from "node:assert/strict";
import { CharStream, Token } from "antlr4ng";
import { InsightLexer } from "../build/runtime/generated/InsightLexer.js";
import { LexerState } from "../build/runtime/runtime/layout-lexer-helper.js";

const cases = [
  emitsContextAsStructuralKeyword,
  emitsAnnotationParametersAsSingleTextToken,
  emitsTextBoundariesAndBalancesIndentationAtEof,
  emitsSiblingEnumValuesWithoutNestedBlocks,
  preservesOpenTextBetweenIncrementalLines,
  keepsSyntheticTextBoundaryTokensOnValueLine,
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
  console.log("layout contract fixtures passed");
}

function emitsContextAsStructuralKeyword() {
  assert.deepEqual(tokenize("context fintech"), [
    "CONTEXT:context",
    "IDENTIFIER:fintech",
    "EOL:\n",
  ]);
}

function emitsAnnotationParametersAsSingleTextToken() {
  assert.deepEqual(tokenize("@attribute(style=dotted,arrowhead=diamond)"), [
    "ATTRIBUTE_ANNOTATION:@attribute",
    "LPAREN:(",
    "ANNOTATION_VALUE:style=dotted,arrowhead=diamond",
    "RPAREN:)",
    "EOL:\n",
  ]);
}

function emitsTextBoundariesAndBalancesIndentationAtEof() {
  assert.deepEqual(tokenize(`
define enum of Tier
    t1
        name = Tier 1`.trimStart()), [
    "DEFINE:define",
    "ENUM:enum",
    "OF:of",
    "TYPE_IDENTIFIER:Tier",
    "EOL:\n",
    "INDENT:<INDENT>",
    "IDENTIFIER:t1",
    "EOL:\n",
    "INDENT:<INDENT>",
    "IDENTIFIER:name",
    "EQ:= ",
    "WRAP:<WRAP>",
    "TEXT:Tier 1",
    "UNWRAP:<UNWRAP>",
    "EOL:\n",
    "DEDENT:<DEDENT>",
    "DEDENT:<DEDENT>",
  ]);
}

function emitsSiblingEnumValuesWithoutNestedBlocks() {
  assert.deepEqual(tokenize(`
define enum of Text
    europe
    usa
`.trimStart()), [
    "DEFINE:define",
    "ENUM:enum",
    "OF:of",
    "TYPE_IDENTIFIER:Text",
    "EOL:\n",
    "INDENT:<INDENT>",
    "IDENTIFIER:europe",
    "EOL:\n",
    "IDENTIFIER:usa",
    "EOL:\n",
    "DEDENT:<DEDENT>",
  ]);
}

function preservesOpenTextBetweenIncrementalLines() {
  let state = new LexerState();

  state = tokenizeLine("define enum of Tier", state).state;
  state = tokenizeLine("    t1", state).state;
  const nameLine = tokenizeLine("        name = Tier 1", state);

  assert.deepEqual(nameLine.tokens, [
    "EOL:\n",
    "INDENT:<INDENT>",
    "IDENTIFIER:name",
    "EQ:= ",
    "WRAP:<WRAP>",
    "TEXT:Tier 1",
  ]);
  assert.equal(nameLine.state.textOpen, true);
  assert.equal(nameLine.state.indentation, 2);

  const nextEntry = tokenizeLine("    t2", nameLine.state);

  assert.deepEqual(nextEntry.tokens, [
    "UNWRAP:<UNWRAP>",
    "EOL:\n",
    "DEDENT:<DEDENT>",
    "IDENTIFIER:t2",
  ]);
  assert.equal(nextEntry.state.textOpen, false);
  assert.equal(nextEntry.state.indentation, 1);
}

function keepsSyntheticTextBoundaryTokensOnValueLine() {
  const source = `
context shared

system app
    name = App
    service api
`.trimStart();
  const tokens = readTokenSnapshots(new InsightLexer(CharStream.fromString(source)));
  const wrap = token(tokens, "WRAP", "<WRAP>");
  const text = token(tokens, "TEXT", "App");
  const unwrap = token(tokens, "UNWRAP", "<UNWRAP>");
  const eolAfterValue = tokens[tokens.indexOf(unwrap) + 1];
  const service = token(tokens, "IDENTIFIER", "service");
  const appOffset = source.indexOf("App");
  const appLineBreak = source.indexOf("\n", appOffset);

  assert.equal(wrap.start, appOffset);
  assert.equal(wrap.stop, appOffset);
  assert.equal(wrap.line, 4);
  assert.equal(wrap.column, 11);
  assert.equal(text.start, appOffset);
  assert.equal(text.stop, appOffset + "App".length - 1);
  assert.equal(text.line, 4);
  assert.equal(text.column, 11);
  assert.equal(unwrap.start, appLineBreak);
  assert.equal(unwrap.stop, appLineBreak);
  assert.equal(unwrap.line, 4);
  assert.equal(unwrap.column, 14);
  assert.equal(eolAfterValue?.type, "EOL");
  assert.equal(eolAfterValue?.line, 4);
  assert.equal(eolAfterValue?.column, 14);
  assert.equal(service.start, source.indexOf("service"));
  assert.equal(service.line, 5);
  assert.equal(service.column, 4);
}

function tokenize(source) {
  return readTokens(new InsightLexer(CharStream.fromString(source)));
}

function tokenizeLine(line, state) {
  const lexer = new InsightLexer(CharStream.fromString(`\n${line}`));
  lexer.enableSingleLineMode();
  lexer.restoreState(state);
  return { tokens: readTokens(lexer), state: lexer.snapshotState() };
}

function readTokens(lexer) {
  return readTokenSnapshots(lexer).map((item) => `${item.type}:${item.text}`);
}

function readTokenSnapshots(lexer) {
  const tokens = [];
  while (true) {
    const token = lexer.nextToken();
    if (token.type === Token.EOF) {
      return tokens;
    }
    tokens.push({
      type: InsightLexer.symbolicNames[token.type],
      text: token.text,
      line: token.line,
      column: token.column,
      start: token.start,
      stop: token.stop,
    });
  }
}

function token(tokens, type, text) {
  const result = tokens.find((item) => item.type === type && item.text === text);
  assert(result !== undefined, `Missing token ${type}:${text}`);
  return result;
}
