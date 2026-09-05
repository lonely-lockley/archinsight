import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  descendantsByRule,
  firstChildByRule,
  firstDescendantByRule,
  firstTokenByName,
  parseInsightSource,
  sourceLocationOf,
  sourceRangeOf,
  textOf,
  tokenName,
  tokenType,
} from "../build/runtime/index.js";

const cases = [
  parsesOneCanonicalSourceModel,
  preservesRecoveredSyntaxAndRanges,
  derivesDefinitionAndDependencyMetadataFromSyntax,
  keepsFormattingOutOfDependencyIdentity,
  centralizesGenericAntlrReflection,
];

let failures = 0;
for (const testCase of cases) {
  try {
    await testCase();
  } catch (error) {
    failures++;
    console.error(`${testCase.name} failed`);
    console.error(error);
  }
}

if (failures > 0) {
  process.exitCode = 1;
} else {
  console.log("parser facade contract fixtures passed");
}

function parsesOneCanonicalSourceModel() {
  const parsed = parseInsightSource({
    sourceName: "model.ai",
    source: `context demo

import vendor from context external

system api
    name = API
    links:
        -> service from partner
`,
  });

  assert.equal(parsed.sourceName, "model.ai");
  assert.equal(parsed.metadata.role, "architecture");
  assert.equal(parsed.metadata.contributesToSnapshot, false);
  assert.equal(parsed.metadata.reliable, true);
  assert.deepEqual(parsed.diagnostics, []);
  assert.deepEqual(parsed.syntaxErrors, []);
  assert(parsed.tree !== undefined);
  assert(Object.isFrozen(parsed));
  assert(Object.isFrozen(parsed.tokens));
  assert(Object.isFrozen(parsed.syntax));

  const architecture = parsed.syntax.firstDescendant("architectureFile");
  assert(architecture !== undefined);
  assert.equal(parsed.syntax.children("contextDeclaration", architecture).length, 1);
  const context = parsed.syntax.firstChild("contextDeclaration", architecture);
  assert(context !== undefined);
  const contextName = firstChildByRule(context, "contextDeclarationName", parsed.ruleNames);
  assert(contextName !== undefined);
  assert.equal(parsed.syntax.text(contextName), "demo");
  assert.equal(descendantsByRule(parsed.tree, "namedImportDeclaration", parsed.ruleNames).length, 1);
  assert.equal(descendantsByRule(parsed.tree, "anonymousImportDeclaration", parsed.ruleNames).length, 1);
  assert.equal(parsed.syntax.descendants("namedImportDeclaration").length, 1);

  const contextToken = firstTokenByName(context, "CONTEXT", parsed.tokenName);
  assert(contextToken !== undefined);
  assert.equal(parsed.syntax.firstToken("CONTEXT", context), contextToken);
  assert.equal(tokenName(parsed.tokenName, tokenType(contextToken)), "CONTEXT");
  assert.deepEqual(sourceLocationOf(context, parsed.sourceName), {
    sourceName: "model.ai",
    line: 1,
    column: 1,
    endLine: 1,
    endColumn: 14,
  });
  assert.equal(sourceRangeOf(context).startOffset, 0);
  assert.equal(parsed.syntax.range(context).startOffset, 0);
  assert.equal(parsed.syntax.location(context, parsed.sourceName).sourceName, "model.ai");
}

function preservesRecoveredSyntaxAndRanges() {
  const parsed = parseInsightSource({
    sourceName: "recovered.ai",
    source: `context demo

system api
    name =
`,
  });

  assert(parsed.tree !== undefined, "ANTLR recovery must retain the usable CST");
  assert(parsed.syntaxErrors.length > 0);
  assert(parsed.diagnostics.some((item) => item.code === "SYNTAX_ERROR"));
  assert.equal(parsed.metadata.reliable, false);
  const assignment = firstDescendantByRule(parsed.tree, "assignment", parsed.ruleNames);
  assert(assignment !== undefined);
  const range = sourceRangeOf(assignment);
  assert.equal(range.line, 4);
  assert.equal(range.column, 5);
  assert(range.endOffset >= range.startOffset);
}

function derivesDefinitionAndDependencyMetadataFromSyntax() {
  const definition = parseInsightSource({
    sourceName: "types.ai",
    source: `# define type Fake
define type CustomSystem of System
    constructor customSystem
`,
  });
  assert.equal(definition.metadata.role, "definitions");
  assert.equal(definition.metadata.contributesToSnapshot, true);
  assert.equal(definition.metadata.supportDependencySignature, "");

  const environment = parseInsightSource({
    sourceName: "prod.ai",
    source: `environment prod

import shared from context platform
extend system payments
    name = Payments
`,
  });
  assert.equal(environment.metadata.role, "environment");
  assert.match(environment.metadata.dependencySignature, /^environment:prod/m);
  assert.match(environment.metadata.supportDependencySignature, /import:shared:platform:/);
  assert.match(environment.metadata.supportDependencySignature, /extension:system:payments/);
}

function keepsFormattingOutOfDependencyIdentity() {
  const compact = parseInsightSource({
    sourceName: "compact.ai",
    source: `context demo
import vendor from context external
`,
  });
  const formatted = parseInsightSource({
    sourceName: "formatted.ai",
    source: `# leading comment
context demo

# import note
import   vendor   from context external
`,
  });
  assert.equal(formatted.metadata.reliable, true);
  assert.equal(compact.metadata.dependencySignature, formatted.metadata.dependencySignature);
  assert.equal(compact.metadata.supportDependencySignature, formatted.metadata.supportDependencySignature);
}

async function centralizesGenericAntlrReflection() {
  const consumers = [
    "src/antlr-adapter.ts",
    "src/core-snapshot.ts",
    "src/project-linker.ts",
    "src/semantic-highlighting.ts",
  ];
  for (const file of consumers) {
    const source = await readFile(file, "utf8");
    assert.doesNotMatch(source, /function (?:childrenOf|ruleName|tokenType|tokenStart|tokenStop|terminalSymbol)\(/, file);
  }
  const analysis = await readFile("src/project-analysis-session.ts", "utf8");
  assert.doesNotMatch(analysis, /\.split\(\/\\r\?\\n|\^\\s\*\(\?:define/, "analysis metadata must come from the parser facade");
}
