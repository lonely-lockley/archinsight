import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = mkdtempSync(path.join(tmpdir(), "archinsight-cli-environments-"));
const cli = path.resolve("build/index.js");

try {
  write("definitions.ai", `
define type RegionalEnvironment of Environment
    Compute compute
`);
  writeEnvironment("eu", "Europe", "eu_compute");
  writeEnvironment("sa", "South America", "sa_compute");
  write("eu-only.ai", `
context shop

deploymentProfile european
    appliesTo:
        production from eu
    runsOn compute

system storefront
    name = Storefront

    service api
        name = API
        deployment:
            uses european
`);
  write("multi-region.ai", `
context reporting

deploymentProfile global
    appliesTo:
        production from eu
        production from sa
    runsOn compute

system analytics
    name = Analytics

    service worker
        name = Worker
        deployment:
            uses global
`);

  const all = json("environments", root, "--format", "json");
  assert.deepEqual(all, {
    schemaVersion: "deployment-environments.v1",
    source: null,
    environments: [
      { id: "eu", name: "Europe", source: "eu.ai" },
      { id: "sa", name: "South America", source: "sa.ai" },
    ],
  });

  const relevant = json("environments", root, "--source", "eu-only.ai", "--format", "json");
  assert.deepEqual(relevant, {
    schemaVersion: "deployment-environments.v1",
    source: "eu-only.ai",
    environments: [
      { id: "eu", name: "Europe", source: "eu.ai" },
    ],
  });

  const multiRegion = json("environments", root, "-s", "multi-region.ai", "-f", "json");
  assert.deepEqual(multiRegion.environments.map((environment) => environment.id), ["eu", "sa"]);

  const text = run("environments", root, "--source", "eu-only.ai", "--format", "text");
  assert.equal(text.status, 0, text.stderr);
  assert.equal(text.stdout, "eu\tEurope\teu.ai\n");

  const missing = run("environments", root, "--source", "missing.ai", "--format", "json");
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /Source 'missing\.ai' is not part of project/);

  console.log("CLI environment list contracts passed");
} finally {
  rmSync(root, { recursive: true, force: true });
}

function writeEnvironment(id, name, compute) {
  write(`${id}.ai`, `
environment ${id}
    name = ${name}

deployment production
    compute:
        compute ${compute}
            name = ${name} compute
`);
}

function write(name, content) {
  writeFileSync(path.join(root, name), content.trimStart());
}

function run(...args) {
  return spawnSync(process.execPath, [cli, ...args], {
    cwd: path.resolve(".."),
    encoding: "utf8",
  });
}

function json(...args) {
  const result = run(...args);
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}
