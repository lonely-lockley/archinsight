import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const cliRoot = path.resolve(scriptDirectory, "..");

const entrypoint = source("index.ts");
assert.doesNotMatch(entrypoint, /from ["'](?:node:|@insight\/language|@viz-js\/viz|archy)/);
assert.doesNotMatch(entrypoint, /function run(?:Link|Render|Query|Structure|Environments|Skill)\b/);
assert.doesNotMatch(entrypoint, /references\/|examples\/|mkdtemp|writeFile|ProjectAnalysisSession/);
for (const command of ["runLink", "runRender", "runQuery", "runStructure", "runEnvironments", "runSkill"]) {
  assert.match(entrypoint, new RegExp(`\\b${command}\\b`), `entrypoint must dispatch ${command}`);
}

const packageSource = source(path.join("skill", "skill-package.ts"));
assert.match(packageSource, /generated\/skill-resources\.js/);
assert.match(packageSource, /BUILTIN_VIEW_DEFINITIONS/);
assert.match(packageSource, /coreSources/);
assert(packageSource.split("\n").length < 150, "skill package assembly must not absorb resource prose again");
assert.doesNotMatch(packageSource, /# Archinsight Agent Guide|## Reference routing/);
assert.doesNotMatch(packageSource, /node:fs|mkdtemp|rename\(|writeFile|process\.stdout/);

const installerSource = source(path.join("skill", "skill-installer.ts"));
assert.match(installerSource, /node:fs\/promises/);
assert.doesNotMatch(installerSource, /@insight\/language|generated\/skill-resources|references\/|examples\//);

const manifest = JSON.parse(readFileSync(path.join(cliRoot, "src", "skill", "resources", "manifest.json"), "utf8"));
assert.equal(manifest.schemaVersion, "archinsight-skill-resources.v1");
assert.deepEqual(Object.keys(manifest.targets).sort(), ["claude", "codex", "generic"]);
for (const [target, definition] of Object.entries(manifest.targets)) {
  assert.equal(typeof definition.defaultOutput, "string", `${target} default output`);
  assert.equal(typeof definition.entrypoint, "string", `${target} entrypoint`);
  assert.equal(typeof definition.installedByDefault, "boolean", `${target} installation mode`);
  assert.equal(typeof definition.resourceRoot, "string", `${target} resource root`);
}

console.log("CLI architecture contracts passed");

function source(relativePath) {
  return readFileSync(path.join(cliRoot, "src", relativePath), "utf8");
}
