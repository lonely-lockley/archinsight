import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = mkdtempSync(path.join(tmpdir(), "archinsight-cli-deployment-"));
const cli = path.resolve("build/index.js");

try {
  write("definitions.ai", `
define type AppEnvironment of Environment
    Compute compute
    NetworkConnection network
`);
  writeEnvironment("eu_central", "central_compute", "central_network");
  writeEnvironment("eu_west", "west_compute", "west_network");
  write("model.ai", `
context shop

deploymentProfile regional
    appliesTo:
        production from eu_central
        production from eu_west
    runsOn compute

system storefront
    name = Storefront

    service api
        name = API
        deployment:
            uses regional
`);

  const ambiguous = run("query", root, "-c", "shop", "-s", "model.ai", "-v", "deployment-container", "--format", "json");
  assert.equal(ambiguous.status, 1);
  assert.match(ambiguous.stderr, /requires --environment/);
  assert.match(ambiguous.stderr, /eu_central/);
  assert.match(ambiguous.stderr, /eu_west/);

  const selected = run(
    "query", root, "-c", "shop", "-s", "model.ai", "-v", "deployment-container",
    "--environment", "eu_west", "--format", "json",
  );
  assert.equal(selected.status, 0, selected.stderr);
  const graph = JSON.parse(selected.stdout);
  assert(Object.keys(graph.elements).some((id) => id.includes("eu_west")));
  assert.equal(Object.keys(graph.elements).some((id) => id.includes("eu_central")), false);

  const d1 = run("query", root, "-c", "shop", "-s", "model.ai", "-v", "deployment-system", "--format", "json");
  assert.equal(d1.status, 0, d1.stderr);
  assert(Object.values(JSON.parse(d1.stdout).elements).some((element) => element.type === "System"));

  console.log("CLI deployment view contracts passed");
} finally {
  rmSync(root, { recursive: true, force: true });
}

function writeEnvironment(context, compute, network) {
  write(`${context}.ai`, `
environment ${context}
    name = ${context}

deployment production
    compute:
        compute ${compute}
            name = ${compute}
    network:
        networkConnection ${network}
            name = ${network}
            projection:
                source $from originalLink target $to
`);
}

function write(name, content) {
  writeFileSync(path.join(root, name), content.trimStart());
}

function run(...args) {
  const result = spawnSync(process.execPath, [cli, ...args], { cwd: path.resolve(".."), encoding: "utf8" });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}
