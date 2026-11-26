import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const temporaryRoot = mkdtempSync(path.join(os.tmpdir(), "archinsight-quick-actions-"));
const project = path.join(temporaryRoot, "project");
const cli = path.resolve("build/index.js");

try {
  mkdirSync(project);
  write("definitions.ai", `define type AppEnvironment of Environment
    Compute compute
    NetworkConnection network
    ClusterLink clusterLink

define type ClusterLink of NetworkConnection
    constructor clusterLink
`);
  write("eu.ai", environment("eu", "Europe", true));
  write("us.ai", environment("us", "United States"));
  write("model.ai", `context sample

deploymentProfile multiRegion
    appliesTo:
        production from eu
        production from us
    runsOn compute

deploymentProfile europeOnly
    appliesTo:
        production from eu
    runsOn compute

deploymentProfile usOnly
    appliesTo:
        production from us
    runsOn compute

external actor user
    name = User
    links:
        -> frontend
            technology = HTTPS
            deployment:
                route clusterLocal
        -> backend
            deployment:
                route clusterLocal

system platform
    name = Platform

    service frontend
        name = Frontend
        deployment:
            uses multiRegion
        links:
            -> backend
                deployment:
                    route clusterLocal

    service backend
        name = Backend
        deployment:
            uses multiRegion
        links:
            -> google
                deployment:
                    route clusterLocal

    service database
        name = Database
        deployment:
            uses europeOnly

    service isolated
        name = Isolated

    service cross_source
        name = Cross source
        deployment:
            uses europeOnly
        links:
            -> cross_target
                deployment:
                    route crossRegion

    service cross_target
        name = Cross target
        deployment:
            uses usOnly

external system google
    name = Google
`);

  const isolated = json("isolate", "--element", "sample/frontend");
  assert.equal(isolated.schemaVersion, "diagram-quick-action.v1");
  assert.equal(isolated.action, "isolate");
  assert.deepEqual(new Set(Object.keys(isolated.graph.elements)), new Set([
    "sample/user", "sample/frontend", "sample/backend",
  ]));
  assert.deepEqual(new Set(isolated.graph.edges.map((edge) => `${edge.source}->${edge.target}`)), new Set([
    "sample/user->sample/frontend", "sample/frontend->sample/backend",
  ]));

  const drilled = json("drill-down", "--element", "sample/platform");
  assert.equal(drilled.action, "drill-down");
  assert.deepEqual(new Set(Object.keys(drilled.graph.elements)), new Set([
    "sample/platform", "sample/frontend", "sample/backend", "sample/database", "sample/isolated",
    "sample/cross_source", "sample/cross_target", "sample/user", "sample/google",
  ]));
  assert(drilled.graph.groups.some((group) => group.owner === "sample/platform"));

  const missingEnvironment = run("quick-action", "deployment", project, "--element", "sample/frontend");
  assert.equal(missingEnvironment.status, 1);
  assert.match(missingEnvironment.stderr, /requires --environment.*eu \(Europe\).*us \(United States\)/);

  const deployment = json("deployment", "--element", "sample/platform", "--environment", "eu");
  assert.equal(deployment.environment, "eu");
  assert.deepEqual(deployment.focusElementIds, [
    "sample/backend",
    "sample/cross_source",
    "sample/cross_target",
    "sample/database",
    "sample/frontend",
  ]);
  assert(deployment.graph.groups.some((group) => group.owner === "eu/compute"));
  assert(deployment.graph.edges.every((edge) =>
    deployment.focusElementIds.includes(edge.source.split("@@")[0])
      || deployment.focusElementIds.includes(edge.target.split("@@")[0])
  ));

  const pathResult = json("find-path", "--from", "sample/user", "--to", "sample/google");
  assert.equal(pathResult.pathFound, true);
  assert.deepEqual(new Set(Object.keys(pathResult.graph.elements)), new Set([
    "sample/user", "sample/frontend", "sample/backend", "sample/google",
  ]));
  assert.deepEqual(new Set(pathResult.graph.edges.map((edge) => `${edge.source}->${edge.target}`)), new Set([
    "sample/user->sample/frontend",
    "sample/frontend->sample/backend",
    "sample/user->sample/backend",
    "sample/backend->sample/google",
  ]));
  const pathText = success("find-path", "--from", "sample/user", "--to", "sample/google", "--format", "text").stdout;
  assert.match(pathText, /^element\tsample\/frontend\tService\tFrontend$/m);
  assert.match(pathText, /^edge\tsample\/user -> sample\/frontend\tHTTPS$/m);
  assert.match(pathText, /^edge\tsample\/backend -> sample\/google\t-$/m);

  const crossEnvironmentPath = json(
    "find-path",
    "--from", "sample/cross_source",
    "--to", "sample/cross_target",
    "--environment", "eu",
  );
  assert.equal(crossEnvironmentPath.pathFound, true);
  assert.deepEqual(
    crossEnvironmentPath.graph.edges.map((edge) => `${edge.source}->${edge.target}`),
    ["sample/cross_source@@eu/compute->sample/cross_target@@us/compute"],
  );

  failure(
    "find-path",
    /Environment 'nosuch' is not available for 'sample\/cross_source'.*eu \(Europe\)/,
    "--from", "sample/cross_source", "--to", "sample/cross_target", "--environment", "nosuch",
  );
  failure(
    "find-path",
    /Environment 'us' is not available for 'sample\/cross_source'.*eu \(Europe\)/,
    "--from", "sample/cross_source", "--to", "sample/cross_target", "--environment", "us",
  );
  failure(
    "find-path",
    /No deployment is available for 'sample\/user'/,
    "--from", "sample/user", "--to", "sample/google", "--environment", "eu",
  );

  const noPath = json("find-path", "--from", "sample/google", "--to", "sample/user");
  assert.equal(noPath.pathFound, false);
  assert.deepEqual(Object.keys(noPath.graph.elements).sort(), ["sample/google", "sample/user"]);
  assert.deepEqual(noPath.graph.edges, []);

  const declaration = json("declaration", "--element", "sample/backend");
  assert.equal(declaration.declaration.sourceName, "model.ai");
  assert(declaration.declaration.line > 0);
  assert(declaration.declaration.column > 0);
  assert.deepEqual(Object.keys(declaration.graph.elements), ["sample/backend"]);
  assert.deepEqual(declaration.graph.edges, []);
  const declarationText = success("declaration", "--element", "sample/backend", "--format", "text").stdout;
  assert.match(declarationText, /^action\tdeclaration/m);
  assert.match(declarationText, /^declaration\t\{"sourceName":"model\.ai","line":\d+,"column":\d+,.*\}$/m);
  assert.match(declarationText, /^elements\t1$/m);

  const pngFile = path.join(temporaryRoot, "isolate.png");
  success("isolate", "--element", "sample/frontend", "--format", "png", "--out", pngFile);
  assert.equal(existsSync(pngFile), true);
  assert.deepEqual([...readFileSync(pngFile).subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);

  assert.match(success("find-path", "--from", "sample/user", "--to", "sample/google", "--format", "dot").stdout, /^digraph /);
  assert.match(success("isolate", "--element", "sample/frontend", "--format", "svg").stdout, /<svg\b/);
  assert.match(success("declaration", "--element", "sample/backend", "--format", "svg").stdout, /<svg\b/);

  const declarationPng = path.join(temporaryRoot, "declaration.png");
  success("declaration", "--element", "sample/backend", "--format", "png", "--out", declarationPng);
  assert.deepEqual([...readFileSync(declarationPng).subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);

  failure("isolate", /requires --element/, "--format", "json");
  failure("drill-down", /has no deeper logical level/, "--element", "sample/frontend");
  failure("deployment", /No deployment is available/, "--element", "sample/isolated");
  failure("find-path", /must be different/, "--from", "sample/user", "--to", "sample/user");
  failure("declaration", /not part of the linked project/, "--element", "sample/missing");

  console.log("quick action CLI contracts passed");
} finally {
  rmSync(temporaryRoot, { recursive: true, force: true });
}

function environment(id, name, crossEnvironment = false) {
  return `environment ${id}
    name = ${name}

deployment production
    compute:
        compute compute
            name = ${name} Compute
    network:
        networkConnection network
${crossEnvironment ? `    clusterLink:
        clusterLink boundary
` : ""}

route clusterLocal
    outbound:
        $from originalLink $to
${crossEnvironment ? `
route crossRegion
    outbound:
        $from originalLink $to in production from us
` : ""}
`;
}

function write(name, content) {
  writeFileSync(path.join(project, name), content);
}

function run(...args) {
  return spawnSync(process.execPath, [cli, ...args], {
    cwd: path.resolve(".."),
    encoding: "utf8",
  });
}

function success(action, ...args) {
  const result = run("quick-action", action, project, ...args);
  assert.equal(result.status, 0, `stdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  return result;
}

function json(action, ...args) {
  return JSON.parse(success(action, ...args, "--format", "json").stdout);
}

function failure(action, pattern, ...args) {
  const result = run("quick-action", action, project, ...args);
  assert.equal(result.status, 1, `stdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  assert.match(result.stderr, pattern);
}
