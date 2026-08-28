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
const temporaryRoot = mkdtempSync(path.join(os.tmpdir(), "archinsight-view-externality-skill-contracts-"));

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
  ], { cwd: repositoryRoot, encoding: "utf8" });
  assert.equal(generated.status, 0, generated.stderr);

  const c1Reference = reference(output, "c1-context.md");
  const c2Reference = reference(output, "c2-containers.md");
  const c3Reference = reference(output, "c3-components.md");
  const c4Reference = reference(output, "c4-code.md");
  const queries = reference(output, "queries.md");
  assert(c1Reference.includes("owned by another context are external to the C1 view"));
  assert(c2Reference.includes("folded to its owning closed system"));
  assert(c3Reference.includes("folded to the nearest closed container or service"));
  assert.match(c4Reference, /folded to the nearest closed\s+component/);
  assert(queries.includes("`IS External` in a custom query continues to match only the explicit model"));

  const c2Query = example(output, "c2.aiq");
  const c3Query = example(output, "c3.aiq");
  const c4Query = example(output, "c4.aiq");
  assert.equal(c2Query.includes("IS External"), false);
  assert.equal(c3Query.includes("IS External"), false);
  assert(c2Query.includes("related IS ContainerElement OR related IS SystemElement"));
  assert(c3Query.includes("related IS ComponentElement OR related IS ContainerElement OR related IS SystemElement"));
  assert(c4Query.includes("related IS CodeElement OR related IS ComponentElement"));

  console.log("view-relative externality skill contracts passed");
} finally {
  rmSync(temporaryRoot, { recursive: true, force: true });
}

function reference(root, name) {
  return readFileSync(path.join(root, "references", name), "utf8");
}

function example(root, name) {
  return readFileSync(path.join(root, "examples", "builtin-views", name), "utf8");
}
