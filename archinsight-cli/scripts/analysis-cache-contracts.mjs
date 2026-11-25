import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const temporaryRoot = mkdtempSync(path.join(tmpdir(), "archinsight-cli-cache-"));
const project = path.join(temporaryRoot, "project");
const projectionProject = path.join(temporaryRoot, "projection-project");
const defaultCache = path.join(project, ".archinsight", "cache");
const alternateCache = path.join(temporaryRoot, "alternate-cache");
const cli = path.resolve("build/index.js");

try {
  mkdirSync(project);
  writeModel("Initial");

  const cold = run(project);
  assertSuccess(cold, "MISS");
  const coldOutput = JSON.parse(cold.stdout);
  assert.equal(coldOutput.summary.ERROR, 0);
  assert.equal(generations().length, 1);

  const warm = run(project);
  assertSuccess(warm, "HIT");
  assert.deepEqual(JSON.parse(warm.stdout), coldOutput);

  const generationsBeforeDisabledRun = generations();
  const disabled = run(project, "--no-cache");
  assertSuccess(disabled, "MISS");
  assert.deepEqual(JSON.parse(disabled.stdout), coldOutput);
  assert.deepEqual(generations(), generationsBeforeDisabledRun);

  const alternate = run(project, "--cache-dir", alternateCache);
  assertSuccess(alternate, "MISS");
  assert.deepEqual(JSON.parse(alternate.stdout), coldOutput);
  assert.equal(generations(alternateCache).length, 1);

  const firstGeneration = generations()[0];
  const truncated = readFileSync(firstGeneration).subarray(0, 24);
  writeFileSync(firstGeneration, truncated);
  const recoveredFromTruncation = run(project);
  assertSuccess(recoveredFromTruncation, "MISS");
  assert.deepEqual(JSON.parse(recoveredFromTruncation.stdout), coldOutput);

  writeModel("Changed"); // Same byte length: mtime and size are not cache identities.
  const changed = run(project);
  assertSuccess(changed, "INCREMENTAL");
  assert.equal(JSON.parse(changed.stdout).summary.ERROR, 0);

  const newest = generations()[0];
  const corrupted = readFileSync(newest);
  corrupted[100] ^= 0xff;
  writeFileSync(newest, corrupted);
  const fallback = run(project);
  assertSuccess(fallback, "INCREMENTAL");
  assert.equal(JSON.parse(fallback.stdout).summary.ERROR, 0);

  for (const generation of generations()) invalidateAbiWithValidDigest(generation);
  writeFileSync(path.join(projectCacheDirectory(), ".tmp-interrupted-write"), Buffer.from("partial"));
  const incompatible = run(project);
  assertSuccess(incompatible, "MISS");
  assert.equal(JSON.parse(incompatible.stdout).summary.ERROR, 0);

  for (const generation of generations()) invalidateSchemaWithValidDigest(generation);
  const unknownSchema = run(project);
  assertSuccess(unknownSchema, "MISS");
  assert.equal(JSON.parse(unknownSchema.stdout).summary.ERROR, 0);

  verifyProjectionCacheAfterEditsAndUndo();

  console.log("CLI persistent analysis cache contracts passed");
} finally {
  rmSync(temporaryRoot, { recursive: true, force: true });
}

function verifyProjectionCacheAfterEditsAndUndo() {
  mkdirSync(path.join(projectionProject, "infra"), { recursive: true });
  writeFileSync(path.join(projectionProject, "framework.ai"), `extend type Environment
    Compute compute
    SecretStore secrets
    Monitoring observability

define type SecretStore of InfrastructureComponent
    constructor secretStore

define type Monitoring of InfrastructureComponent
    constructor monitoring
`);
  const infrastructure = `environment r1
    name = Region 1

deployment production
    compute:
        compute k8s_r1
            name = K8s r1
    secrets:
        secretStore vault_r1
            name = Vault
            runsOn:
                k8s_r1
            projection:
                source $from originalLink target $this
    observability:
        monitoring prom_r1
            name = Prometheus
            runsOn:
                k8s_r1
            projection:
                target $this connectTo source $from
`;
  const logical = `context shop

deploymentProfile everywhere
    appliesTo:
        production from r1
    runsOn compute
    uses observability

system shop_sys
    name = Shop
    service api
        name = API
        deployment:
            uses everywhere
`;
  writeFileSync(path.join(projectionProject, "infra", "r1.ai"), infrastructure);
  writeFileSync(path.join(projectionProject, "shop.ai"), logical);

  const cold = runProjection();
  assertSuccess(cold, "MISS");
  assert.match(cold.stdout, /r1\/prom_r1 connectTo shop\/api/);

  writeFileSync(
    path.join(projectionProject, "infra", "r1.ai"),
    infrastructure.replace("name = Prometheus", "name = Prometheus X"),
  );
  assertWarmEqualsFresh("infrastructure edit");

  writeFileSync(path.join(projectionProject, "infra", "r1.ai"), infrastructure);
  assertWarmEqualsFresh("infrastructure undo");

  writeFileSync(
    path.join(projectionProject, "shop.ai"),
    logical.replace("name = API", "name = API X"),
  );
  assertWarmEqualsFresh("logical edit");

  writeFileSync(path.join(projectionProject, "shop.ai"), logical);
  assertWarmEqualsFresh("logical undo");
}

function assertWarmEqualsFresh(label) {
  const warm = runProjection();
  assertSuccess(warm, "INCREMENTAL");
  const fresh = runProjection("--no-cache");
  assertSuccess(fresh, "MISS");
  assert.equal(warm.stdout, fresh.stdout, `${label} must match a fresh analysis`);
  assert.match(warm.stdout, /r1\/prom_r1 connectTo shop\/api/);
}

function runProjection(...options) {
  const env = {
    ...process.env,
    ARCHINSIGHT_CACHE_TRACE: "1",
  };
  delete env.ARCHINSIGHT_CACHE_DIR;
  delete env.ARCHINSIGHT_DISABLE_CACHE;
  return spawnSync(process.execPath, [
    cli,
    "query",
    projectionProject,
    "-s",
    "shop.ai",
    "-v",
    "deployment-container",
    "-e",
    "r1",
    "--format",
    "text",
    ...options,
  ], {
    cwd: path.resolve(".."),
    encoding: "utf8",
    env,
  });
}

function writeModel(name) {
  writeFileSync(path.join(project, "model.ai"), `context sample

system application
    name = ${name}
`);
}

function run(input, ...options) {
  const env = {
    ...process.env,
    ARCHINSIGHT_CACHE_TRACE: "1",
  };
  delete env.ARCHINSIGHT_CACHE_DIR;
  delete env.ARCHINSIGHT_DISABLE_CACHE;
  return spawnSync(process.execPath, [cli, "link", input, "--format", "json", ...options], {
    cwd: path.resolve(".."),
    encoding: "utf8",
    env,
  });
}

function assertSuccess(result, cacheStatus) {
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stderr, new RegExp(`CACHE\\t${cacheStatus}`));
}

function projectCacheDirectory(cache = defaultCache) {
  const projects = path.join(cache, "projects");
  const directories = readdirSync(projects);
  assert.equal(directories.length, 1);
  return path.join(projects, directories[0]);
}

function generations(cache = defaultCache) {
  return readdirSync(projectCacheDirectory(cache))
    .filter((name) => name.startsWith("analysis-") && name.endsWith(".aic"))
    .sort()
    .reverse()
    .map((name) => path.join(projectCacheDirectory(cache), name));
}

function invalidateAbiWithValidDigest(file) {
  const bytes = readFileSync(file);
  if (bytes.length < 128) return;
  bytes[16] ^= 0xff;
  rewriteWithValidDigest(file, bytes);
}

function invalidateSchemaWithValidDigest(file) {
  const bytes = readFileSync(file);
  if (bytes.length < 128) return;
  bytes.writeUInt16LE(0xffff, 10);
  rewriteWithValidDigest(file, bytes);
}

function rewriteWithValidDigest(file, bytes) {
  const digest = createHash("sha256").update(bytes.subarray(0, bytes.length - 32)).digest();
  digest.copy(bytes, bytes.length - 32);
  writeFileSync(file, bytes);
}
