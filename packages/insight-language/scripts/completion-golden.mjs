import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  buildLanguageSnapshotFromSources,
  CompletionEngine,
  coreLanguageSnapshot,
  createGeneratedInsightSyntaxProvider,
} from "../build/runtime/index.js";

const CARET = "<caret>";
const fixtureDirectory = "fixtures/completion";
const completion = new CompletionEngine(createGeneratedInsightSyntaxProvider());
const technicalExpectedTokens = new Set(["EOF", "EOL", "INDENT", "DEDENT", "WRAP", "UNWRAP", "WHITESPACE", "VALUE_EOL"]);

let failures = 0;
for (const fixtureFile of readdirSync(fixtureDirectory).filter((file) => file.endsWith(".fixture")).sort()) {
  for (const testCase of parseFixture(join(fixtureDirectory, fixtureFile))) {
    const caret = testCase.source.indexOf(CARET);
    if (caret < 0 || testCase.source.indexOf(CARET, caret + CARET.length) >= 0) {
      throw new Error(`${testCase.name}: expected exactly one ${CARET}`);
    }
    const source = testCase.source.replace(CARET, "");
    const snapshot = buildLanguageSnapshotFromSources([
      ...testCase.framework.map((framework, index) => ({ sourceName: `framework-${index}.ai`, source: framework })),
      { sourceName: "architecture.ai", source },
    ], [coreLanguageSnapshot]);
    const result = completion.complete({
      sourceName: "architecture.ai",
      source,
      cursorOffset: caret,
      snapshot,
    });
    const actual = new Set(result.items.map((item) => `${item.kind} ${item.label}`));
    for (const token of result.expectedTokens) {
      if (technicalExpectedTokens.has(token)) {
        failures++;
        console.error(`${testCase.name}: did not expect technical token ${token} in expected tokens`);
      }
    }
    for (const expected of testCase.contains) {
      if (!actual.has(expected)) {
        failures++;
        console.error(`${testCase.name}: expected ${expected}, got ${formatItems(actual)}`);
      }
    }
    for (const forbidden of testCase.lacks) {
      if (actual.has(forbidden)) {
        failures++;
        console.error(`${testCase.name}: did not expect ${forbidden}, got ${formatItems(actual)}`);
      }
    }
  }
}

if (failures > 0) {
  process.exitCode = 1;
} else {
  console.log("completion golden fixtures passed");
}

function parseFixture(path) {
  const cases = [];
  let current;
  let section;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    if (line.startsWith("=== ")) {
      current = { name: `${path}: ${line.slice(4)}`, framework: [], source: [], contains: [], lacks: [] };
      cases.push(current);
      section = undefined;
    } else if (line.startsWith("--- ")) {
      section = line.slice(4);
    } else if (current !== undefined && section !== undefined) {
      if (section === "source") {
        current.source.push(line);
      } else if (section === "framework") {
        current.framework.push(line);
      } else if (section === "contains" && line.trim().length > 0) {
        current.contains.push(line.trim());
      } else if (section === "lacks" && line.trim().length > 0) {
        current.lacks.push(line.trim());
      }
    }
  }
  return cases.map((testCase) => ({
    ...testCase,
    framework: testCase.framework.length === 0 ? [] : [testCase.framework.join("\n")],
    source: testCase.source.join("\n"),
  }));
}

function formatItems(items) {
  return `[${[...items].sort().join(", ")}]`;
}
