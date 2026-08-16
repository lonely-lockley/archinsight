import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url);
const files = [
  "src/generated/InsightLexer.ts",
  "src/generated/InsightParser.ts",
];

for (const file of files) {
  const path = join(root.pathname, file);
  const source = readFileSync(path, "utf8");
  writeFileSync(path, source.replace(/[ \t]+$/gm, ""));
}
