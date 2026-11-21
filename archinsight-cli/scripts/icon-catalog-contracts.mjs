import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";

const cli = path.resolve("build/index.js");

const catalog = run("icons", "--format", "json");
assert.equal(catalog.status, 0, catalog.stderr);
const all = JSON.parse(catalog.stdout);
assert.equal(all.schemaVersion, "technology-icon-catalog.v1");
assert.equal(all.query, null);
assert(all.icons.length > 100);
assert(all.icons.some((icon) => icon.id === "java" && icon.label === "Java"));

const search = run("icons", "postgres", "--format", "json");
assert.equal(search.status, 0, search.stderr);
const matches = JSON.parse(search.stdout);
assert.equal(matches.query, "postgres");
assert.equal(matches.icons[0]?.id, "postgresql");

const text = run("icons", "quarkus", "--format", "text");
assert.equal(text.status, 0, text.stderr);
assert.match(text.stdout, /^quarkus\tQuarkus\t(?:plain|line|original)$/m);

const extra = run("icons", "java", "unexpected");
assert.equal(extra.status, 1);
assert.match(extra.stderr, /Usage: archinsight icons/);

console.log("CLI icon catalog contracts passed");

function run(...args) {
  return spawnSync(process.execPath, [cli, ...args], {
    cwd: path.resolve(".."),
    encoding: "utf8",
  });
}
