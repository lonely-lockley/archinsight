import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = mkdtempSync(path.join(tmpdir(), "archinsight-cli-scope-"));
const cli = path.resolve("build/index.js");

try {
  write("definitions.ai", `
define type ProjectSystem of System
    constructor projectSystem
`);
  write("alpha.ai", `
context alpha

system application
    name = Alpha application

    container api
        name = Alpha API
`);
  write("alpha-details.ai", `
context alpha

extend system application
    container worker
        name = Alpha worker
`);
  write("beta.ai", `
context beta

system reporting
    name = Reporting
`);
  write("context.aiq", `
MATCH (system:SystemElement)
WHERE system.context = $context
RETURN system
`);
  write("tab.aiq", `
MATCH (element:Element)
WHERE element.sourceIdentity = $tab
RETURN element
`);

  const c1FromSource = graph("query", root, "-s", "alpha-details.ai", "-v", "c1", "--format", "json");
  assert.equal(c1FromSource.context, "alpha");
  assert(c1FromSource.elements["alpha/application"]);
  assert.equal(c1FromSource.elements["beta/reporting"], undefined);

  const c2FromSource = graph("query", root, "-s", "alpha-details.ai", "-v", "c2", "--format", "json");
  assert.equal(c2FromSource.context, "alpha");
  assert(c2FromSource.elements["alpha/worker"]);

  const renderedC2 = run("render", root, "-s", "alpha-details.ai", "-v", "c2", "--format", "json");
  assert.equal(renderedC2.status, 0, renderedC2.stderr);
  assert.equal(JSON.parse(renderedC2.stdout).graph.context, "alpha");

  const explicitC1 = graph("query", root, "-c", "beta", "-v", "c1", "--format", "json");
  assert.equal(explicitC1.context, "beta");
  assert(explicitC1.elements["beta/reporting"]);

  const compatibleExplicitContext = graph(
    "query", root, "-s", "alpha.ai", "-c", "alpha", "-v", "c2", "--format", "json",
  );
  assert.equal(compatibleExplicitContext.context, "alpha");
  assert(compatibleExplicitContext.elements["alpha/api"]);

  const contextQuery = graph("query", root, "-s", "alpha.ai", "-q", "context.aiq", "--format", "json");
  assert.equal(contextQuery.context, "alpha");
  assert(contextQuery.elements["alpha/application"]);

  const customQueryOverridesView = graph(
    "query", root, "-c", "alpha", "-v", "c2", "-q", "context.aiq", "--format", "json",
  );
  assert.equal(customQueryOverridesView.context, "alpha");
  assert(customQueryOverridesView.elements["alpha/application"]);

  const singleSource = graph("query", path.join(root, "alpha.ai"), "-v", "c2", "--format", "json");
  assert.equal(singleSource.context, "alpha");
  assert(singleSource.elements["alpha/api"]);

  assertFailure(
    ["query", root, "-v", "c1", "--format", "json"],
    /Cannot infer context.*Available contexts: alpha, beta/,
  );
  assertFailure(
    ["query", root, "-c", "alpha", "-v", "c2", "--format", "json"],
    /View 'c2' requires --source/,
  );
  assertFailure(
    ["query", root, "-s", "alpha.ai", "-c", "beta", "-v", "c1", "--format", "json"],
    /Context 'beta' conflicts with source 'alpha.ai', which declares context 'alpha'/,
  );
  assertFailure(
    ["query", root, "-s", "alpha.ai", "-c", "missing", "-v", "c1", "--format", "json"],
    /Context 'missing' is not declared/,
  );
  assertFailure(
    ["query", root, "-s", "definitions.ai", "-v", "c2", "--format", "json"],
    /contains definitions and does not declare a renderable context or environment/,
  );
  assertFailure(
    ["query", root, "-q", "tab.aiq", "--format", "json"],
    /This query requires --source/,
  );
  assertFailure(
    ["render", root, "-c", "alpha", "-v", "c2", "--format", "json"],
    /View 'c2' requires --source/,
  );

  console.log("CLI scope resolution contracts passed");
} finally {
  rmSync(root, { recursive: true, force: true });
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

function graph(...args) {
  const result = run(...args);
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

function assertFailure(args, message) {
  const result = run(...args);
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, message);
}
