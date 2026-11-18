import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = mkdtempSync(path.join(os.tmpdir(), "archinsight-diagram-diff-"));
const project = path.join(root, "model");
const cli = path.resolve("build/index.js");

try {
  mkdirSync(project);
  git("init", "-q");
  write(`context sample

system a
    name = Service A

@planned
system b
    name = Service B
    links:
        -> a
            technology = HTTP
`);
  writeFileSync(path.join(project, "consumers.aiq"), `MATCH (target:Element {id: $target})
OPTIONAL MATCH (consumer)-[link:REFERENCES]->(target)
RETURN target, consumer, link
`);
  const paramsFile = path.join(project, "params.json");
  writeFileSync(paramsFile, JSON.stringify({ target: "a" }));
  mkdirSync(path.join(project, ".hidden"));
  mkdirSync(path.join(project, "node_modules"));
  writeFileSync(path.join(project, ".hidden", "broken.ai"), "not valid Insight");
  writeFileSync(path.join(project, "node_modules", "broken.ai"), "not valid Insight");
  writeFileSync(path.join(project, "README.md"), "fixture");
  git("add", ".");
  git("-c", "user.name=Archinsight Test", "-c", "user.email=test@archinsight.invalid", "commit", "-q", "-m", "before");
  const before = git("rev-parse", "HEAD").stdout.trim();

  write(`context sample

system a
    name = Service A renamed

@planned
system b
    name = Service B
    links:
        -> a
            technology = gRPC

system c
    name = Service C
    links:
        -> a
`);
  git("add", "model/model.ai");
  git("-c", "user.name=Archinsight Test", "-c", "user.email=test@archinsight.invalid", "commit", "-q", "-m", "after");
  const after = git("rev-parse", "HEAD").stdout.trim();

  const text = success("diff", project, "--from", before, "--to", after, "--view", "c1", "--format", "text");
  assert.match(text.stdout, /elements\tadded=1\tremoved=0\tchanged=1\tunchanged=1/);
  assert.match(text.stdout, /edges\tadded=1\tremoved=0\tchanged=1\tunchanged=0/);
  assert.match(text.stdout, /^element\tadded\tsample\/c\tSystem\tService C$/m);
  assert.match(text.stdout, /^element\tchanged\tsample\/a\tSystem\tService A renamed$/m);
  assert.match(text.stdout, /^edge\tadded\t[^\t]+\tsample\/c -> sample\/a\t-$/m);
  assert.match(text.stdout, /^edge\tchanged\t[^\t]+\tsample\/b -> sample\/a\tgRPC$/m);

  const json = success("diff", project, "--from", before, "--to", after, "--view", "c1", "--format", "json");
  const payload = JSON.parse(json.stdout);
  assert.equal(payload.revisions.from, before);
  assert.equal(payload.revisions.to, after);
  assert.equal(payload.diff.schemaVersion, "diagram-diff.v1");
  assert.equal(payload.diff.elements["sample/c"].status, "added");
  assert.equal(payload.diff.elements["sample/a"].status, "changed");
  assert.equal(payload.attributedDiff.schemaVersion, "attributed-diagram-diff.v1");
  assert(payload.attributedDiff.attribution["element:sample/a"].some((item) =>
    item.commits.some((commit) => commit.authorName === "Archinsight Test")
  ), "changed elements must carry blame metadata");
  assert(payload.diff.edges.some((entry) => entry.status === "added"
    && entry.rendered.source === "sample/c" && entry.rendered.target === "sample/a"));

  const parameterized = success(
    "diff", project, "--from", before, "--to", after,
    "--query", "consumers.aiq", "--param", 'target="a"', "--format", "json",
  );
  const parameterizedPayload = JSON.parse(parameterized.stdout);
  assert.equal(parameterizedPayload.diff.elements["sample/c"].status, "added");
  assert(parameterizedPayload.diff.edges.some((entry) => entry.status === "added"
    && entry.rendered.source === "sample/c" && entry.rendered.target === "sample/a"));
  const parameterFilePayload = JSON.parse(success(
    "diff", project, "--from", before, "--to", after,
    "--query", "consumers.aiq", "--params", paramsFile, "--format", "json",
  ).stdout);
  assert.equal(parameterFilePayload.diff.elements["sample/c"].status, "added");
  failure(
    "diff", project, "--from", before, "--to", after,
    "--query", "consumers.aiq", "--format", "json", /Missing query parameter: \$target/,
  );

  const dot = success("diff", project, "--from", before, "--to", after, "--view", "c1");
  assert.doesNotMatch(dot.stdout, /#(?:c8e6c9|ffcdd2|fff59d)/);
  assert.match(dot.stdout, /fillcolor="#5A189A",color="#2e7d32"/);
  assert.match(dot.stdout, /fillcolor="#5A189A",color="#f9a825"/);
  assert.match(dot.stdout, /#2e7d32/);
  assert.match(dot.stdout, /#f9a825/);
  assert.match(dot.stdout, /color="#f9a825"[^\]]*penwidth="2.5"/);
  assert.match(dot.stdout, /color="#2e7d32"[^\]]*penwidth="2.5"/);
  assert.match(dot.stdout, /<font color="#2e7d32" point-size="11px"><b>\+<\/b><\/font>/);
  assert.match(dot.stdout, /<font color="#f9a825" point-size="11px"><b>~<\/b><\/font>/);

  failure("diff", project, "--from", after, "--to", before, "--view", "c1", /ancestor/i);

  const fileDiff = success("diff", path.join(project, "model.ai"), "--from", before, "--to", after, "--view", "c1", "--format", "text");
  assert.match(fileDiff.stdout, /elements\tadded=1/);

  const svg = success("diff", project, "--from", before, "--to", after, "--view", "c1", "--format", "svg");
  assert.match(svg.stdout, /<svg\b/);
  const png = path.join(root, "diff.png");
  success("diff", project, "--from", before, "--to", after, "--view", "c1", "--format", "png", "--out", png);
  assert.deepEqual([...readFileSync(png).subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);

  failure("diff", project, "--to", after, "--view", "c1", /--from/);
  failure("diff", project, "--from", "missing", "--to", after, "--view", "c1", /Needed a single revision|unknown revision|ambiguous argument/i);
  failure("diff", path.join(root, "missing"), "--from", before, "--to", after, /Project path does not exist/);
  failure("diff", project, "--from", before, "--to", after, "--source", "missing.ai", "--view", "c1", /absent from both revisions/);

  mkdirSync(path.join(project, "moved"));
  git("mv", "model/model.ai", "model/moved/model.ai");
  git("-c", "user.name=Archinsight Test", "-c", "user.email=test@archinsight.invalid", "commit", "-q", "-m", "move model file");
  const moved = git("rev-parse", "HEAD").stdout.trim();
  const movedOnly = success("diff", project, "--from", after, "--to", moved, "--view", "c1", "--format", "text");
  assert.match(movedOnly.stdout, /elements\tadded=0\tremoved=0\tchanged=0\tunchanged=3/);
  assert.match(movedOnly.stdout, /edges\tadded=0\tremoved=0\tchanged=0\tunchanged=2/);
  const movedPathScope = success(
    "diff", project, "--from", after, "--to", moved,
    "--source", "moved/model.ai", "--view", "c1", "--format", "text",
  );
  assert.match(movedPathScope.stderr, /WARNING\tDIFF_SOURCE_MISSING\t[^\n]+\t1\t1\tSource 'moved\/model\.ai' is absent from the before revision/);
  const oldPathScope = success(
    "diff", project, "--from", after, "--to", moved,
    "--source", "model.ai", "--view", "c1", "--format", "text",
  );
  assert.match(oldPathScope.stderr, /WARNING\tDIFF_SOURCE_MISSING\t[^\n]+\t1\t1\tSource 'model\.ai' is absent from the after revision/);
  git("mv", "model/moved/model.ai", "model/model.ai");

  write("context\n");
  git("add", "-A", "model");
  git("-c", "user.name=Archinsight Test", "-c", "user.email=test@archinsight.invalid", "commit", "-q", "-m", "broken");
  const broken = git("rev-parse", "HEAD").stdout.trim();
  failure("diff", project, "--from", before, "--to", broken, "--view", "c1", /ERROR/);

  rmSync(path.join(project, "model.ai"));
  git("add", "-u", "model/model.ai");
  git("-c", "user.name=Archinsight Test", "-c", "user.email=test@archinsight.invalid", "commit", "-q", "-m", "removed");
  const removed = git("rev-parse", "HEAD").stdout.trim();
  const removedDot = success("diff", project, "--from", after, "--to", removed, "--view", "c1");
  assert.doesNotMatch(removedDot.stdout, /#ffcdd2/);
  assert.match(removedDot.stdout, /color="#c62828"/);
  assert.match(removedDot.stdout, /<font color="#c62828" point-size="11px"><b>−<\/b><\/font>/);
  const removedText = success("diff", project, "--from", after, "--to", removed, "--view", "c1", "--format", "text");
  assert.match(removedText.stdout, /^element\tremoved\tsample\/a\tSystem\tService A renamed$/m);
  failure("diff", project, "--from", removed, "--to", removed, "--view", "c1", /absent from both revisions/);
  console.log("CLI diagram diff contracts passed");
} finally {
  rmSync(root, { recursive: true, force: true });
}

function write(content) {
  writeFileSync(path.join(project, "model.ai"), content);
}

function git(...args) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return result;
}

function run(...args) {
  return spawnSync(process.execPath, [cli, ...args], { cwd: path.resolve(".."), encoding: "utf8" });
}

function success(...args) {
  const result = run(...args);
  assert.equal(result.status, 0, `stdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  return result;
}

function failure(...args) {
  const pattern = args.pop();
  const result = run(...args);
  assert.equal(result.status, 1, `stdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  assert.match(result.stderr, pattern);
}
