import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const temporaryRoot = mkdtempSync(path.join(os.tmpdir(), "archinsight-cli-failures-"));
const project = path.join(temporaryRoot, "project");
const cli = path.resolve("build/index.js");

try {
  mkdirSync(project);
  write("model.ai", `context sample

system application
    name = Application
`);
  write("broken.ai.disabled", "context");
  for (const ignored of [".hidden", "node_modules", "build", "dist"]) {
    mkdirSync(path.join(project, ignored));
    writeFileSync(path.join(project, ignored, "broken.ai"), "this is not Insight\n");
  }

  assertSuccess(run("--version"), /\d+\.\d+\.\d+/);
  assertSuccess(run("--help"), /Usage:/);
  assertFailure(run("unknown"), /Unknown command 'unknown'/);
  assertFailure(run("query", project, "--format"), /Option '--format' expects a value/);
  assertFailure(run("query", project, "--unknown"), /Unknown option '--unknown'/);
  assertFailure(run("query", project, "--format", "yaml"), /Unsupported format 'yaml'/);
  assertFailure(run("query", project, "--view", "unknown"), /Unknown view 'unknown'/);
  assertFailure(run("skill"), /Usage: archinsight skill init/);
  assertFailure(run("skill", "unknown"), /Unknown skill command 'unknown'/);
  assertFailure(run("skill", "init", project, "--target", "unknown"), /Unknown skill target 'unknown'/);

  const empty = path.join(temporaryRoot, "empty");
  mkdirSync(empty);
  assertFailure(run("link", empty), /No \.ai sources found/);
  assertFailure(run("query", project, "--source", "missing.ai"), /is not part of project/);

  const absoluteSource = path.join(project, "model.ai");
  const textQuery = assertSuccess(run("query", project, "--source", absoluteSource, "--format", "text"));
  assert.match(textQuery.stdout, /context\tsample/);

  const linkJson = path.join(temporaryRoot, "link.json");
  assertSuccess(run("link", project, "--format", "json", "--out", linkJson));
  const linkSummary = JSON.parse(readFileSync(linkJson, "utf8")).summary;
  assert.equal(linkSummary.ERROR, 0);
  assert.equal(linkSummary.WARNING, 0);

  const structureJson = path.join(temporaryRoot, "structure.json");
  assertSuccess(run("structure", project, "--format", "json", "--out", structureJson));
  assert.equal(JSON.parse(readFileSync(structureJson, "utf8")).schemaVersion, "project-structure.v1");

  const environments = assertSuccess(run("environments", project));
  assert.equal(environments.stdout, "");

  const dot = assertSuccess(run("render", project));
  assert.match(dot.stdout, /^digraph /);
  assert.match(dot.stderr, /RENDER_FINISHED/);

  const svg = assertSuccess(run("render", project, "--format", "svg"));
  assert.match(svg.stdout, /<svg\b/);

  const badRenderFormat = assertFailure(run("render", project, "--format", "png"), /RENDER_FAILED/);
  assert.match(badRenderFormat.stderr, /Unsupported render format 'png'/);

  write("invalid.ai", "context\n");
  for (const command of ["render", "query", "structure", "environments"]) {
    assertFailure(run(command, path.join(project, "invalid.ai")), /ERROR/);
  }

  assertFailure(
    run("skill", "init", project, "--target", "generic", "--out", ".", "--force"),
    /unsafe skill output directory/,
  );
  assertFailure(
    run("skill", "init", project, "--target", "generic", "--out", temporaryRoot, "--force"),
    /contains the project root/,
  );

  const defaultCodexProject = path.join(temporaryRoot, "default-codex");
  mkdirSync(defaultCodexProject);
  const defaultCodex = assertSuccess(run("skill", "init", defaultCodexProject, "--target", "codex"));
  assert.match(defaultCodex.stdout, /restart the codex session/);

  console.log("CLI failure and edge contracts passed");
} finally {
  rmSync(temporaryRoot, { recursive: true, force: true });
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

function assertSuccess(result, stdoutPattern) {
  assert.equal(result.status, 0, result.stderr);
  if (stdoutPattern !== undefined) {
    assert.match(result.stdout, stdoutPattern);
  }
  return result;
}

function assertFailure(result, stderrPattern) {
  assert.equal(result.status, 1, `stdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  assert.match(result.stderr, stderrPattern);
  return result;
}
