import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const cliRoot = path.resolve(scriptDirectory, "..");
const repositoryRoot = path.resolve(cliRoot, "..");
const cliEntrypoint = path.join(cliRoot, "build", "index.js");
const temporaryRoot = mkdtempSync(path.join(os.tmpdir(), "archinsight-text-type-skill-contracts-"));

try {
  const output = path.join(temporaryRoot, "skill");
  const generated = spawnSync(process.execPath, [
    cliEntrypoint,
    "skill",
    "init",
    repositoryRoot,
    "--target",
    "codex",
    "--out",
    output,
  ], {
    cwd: repositoryRoot,
    encoding: "utf8",
  });
  assert.equal(generated.status, 0, generated.stderr);

  const syntax = readFileSync(path.join(output, "references", "syntax.md"), "utf8");
  assert(syntax.includes("`Text` is the built-in scalar type"));
  assert(syntax.includes("Lowercase `text` remains a valid attribute or presentation property name"));
  assert.equal(syntax.includes("required text "), false);

  console.log("canonical Text skill contracts passed");
} finally {
  rmSync(temporaryRoot, { recursive: true, force: true });
}
