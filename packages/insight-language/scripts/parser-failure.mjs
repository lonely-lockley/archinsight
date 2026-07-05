import {
  CompletionEngine,
  coreLanguageSnapshot,
  createGeneratedInsightSyntaxProvider,
  parseWithGeneratedInsightParser,
} from "../build/runtime/index.js";

const source = "тест";
const parsed = parseWithGeneratedInsightParser({
  sourceName: "invalid.ai",
  source,
  cursorOffset: source.length,
  snapshot: coreLanguageSnapshot,
});

if (parsed.parseFailure === undefined) {
  console.error("expected parser failure for non-ASCII token input");
  process.exitCode = 1;
}

const completion = new CompletionEngine(createGeneratedInsightSyntaxProvider());
completion.complete({
  sourceName: "invalid.ai",
  source,
  cursorOffset: source.length,
  snapshot: coreLanguageSnapshot,
});

if (process.exitCode !== 1) {
  console.log("parser failure handling passed");
}
