import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const cli = path.resolve("build/index.js");
const catalog = JSON.parse(readFileSync(path.resolve(
  "..",
  "src/main/resources/com/github/lonelylockley/insight/builtin-views/catalog.json",
), "utf8"));

const help = spawnSync(process.execPath, [cli, "--help"], { encoding: "utf8" });
assert.equal(help.status, 0, help.stderr);

for (const definition of catalog) {
  assert(help.stdout.includes(definition.id), `CLI help must include ${definition.id}`);
  const accepted = spawnSync(process.execPath, [
    cli,
    "query",
    path.resolve("missing-project"),
    "--view",
    definition.id,
  ], { encoding: "utf8" });
  assert.notEqual(accepted.status, 0);
  assert.doesNotMatch(accepted.stderr, /Unknown view/);
}

const alias = spawnSync(process.execPath, [cli, "query", ".", "--view", "default"], { encoding: "utf8" });
assert.notEqual(alias.status, 0);
assert.match(alias.stderr, /Unknown view 'default'/);

console.log("CLI built-in view catalogue contracts passed");
