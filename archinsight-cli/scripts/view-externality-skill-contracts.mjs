import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const cliRoot = path.resolve(scriptDirectory, "..");
const repositoryRoot = path.resolve(cliRoot, "..");
const cliEntrypoint = path.join(cliRoot, "build", "index.js");
const temporaryRoot = mkdtempSync(path.join(os.tmpdir(), "archinsight-view-externality-skill-contracts-"));

try {
  const output = path.join(temporaryRoot, "skill");
  const generated = spawnSync(process.execPath, [
    cliEntrypoint,
    "skill",
    "init",
    repositoryRoot,
    "--target",
    "codex",
    "--out",
    output,
  ], { cwd: repositoryRoot, encoding: "utf8" });
  assert.equal(generated.status, 0, generated.stderr);

  const c1Reference = reference(output, "c1-context.md");
  const c2Reference = reference(output, "c2-containers.md");
  const c3Reference = reference(output, "c3-components.md");
  const c4Reference = reference(output, "c4-code.md");
  const queries = reference(output, "queries.md");
  assert(c1Reference.includes("owned by another context are external to the C1 view"));
  assert(c2Reference.includes("folded to its owning closed system"));
  assert(c3Reference.includes("folded to the nearest closed container or service"));
  assert.match(c4Reference, /folded to the nearest closed\s+component/);
  assert(queries.includes("`IS External` in a custom query continues to match only the explicit model"));
  assert.match(c1Reference, /both declarations remain internal `System`\s+members/);
  assert.match(c1Reference, /presented as\s+external relative to the opened system boundary/);
  assert.match(c1Reference, /Do not rewrite it as\s+`ExternalSystem`/);

  const c2Query = example(output, "c2.aiq");
  const c3Query = example(output, "c3.aiq");
  const c4Query = example(output, "c4.aiq");
  assert.equal(c2Query.includes("IS External"), false);
  assert.equal(c3Query.includes("IS External"), false);
  assert(c2Query.includes("related IS ContainerElement OR related IS SystemElement"));
  assert(c3Query.includes("related IS ComponentElement OR related IS ContainerElement OR related IS SystemElement"));
  assert(c4Query.includes("related IS CodeElement OR related IS ComponentElement"));

  verifyOwnedPeerAcrossViews();

  console.log("view-relative externality skill contracts passed");
} finally {
  rmSync(temporaryRoot, { recursive: true, force: true });
}

function reference(root, name) {
  return readFileSync(path.join(root, "references", name), "utf8");
}

function example(root, name) {
  return readFileSync(path.join(root, "examples", "builtin-views", name), "utf8");
}

function verifyOwnedPeerAcrossViews() {
  const project = path.join(temporaryRoot, "owned-peer");
  mkdirSync(project, { recursive: true });
  file(project, "definitions.ai", `define type PeerEnvironment of Environment
    Compute compute
    NetworkConnection network
`);
  file(project, "infrastructure.ai", `environment eu
    name = Europe

deployment production
    compute:
        compute kubernetes
            name = Kubernetes
    network:
        networkConnection service_network
            name = Service network
            projection:
                source $from originalLink target $to
`);
  file(project, "fintech.ai", `context company_platform

deploymentProfile fintech_profile
    appliesTo:
        production from eu
    runsOn compute

system fintech
    name = Fintech

    service fintech_api
        name = Fintech API
        deployment:
            uses fintech_profile
`);
  file(project, "compliance.ai", `context company_platform

import fintech_api from context company_platform

deploymentProfile compliance_profile
    appliesTo:
        production from eu
    runsOn compute

system compliance
    name = Compliance

    service compliance_api
        name = Compliance API
        deployment:
            uses compliance_profile
        links:
            -> fintech_api
                deployment:
                    uses network
`);

  run(["link", project, "--format", "text"]);
  const c1 = query(project, "c1");
  assert(c1.elements["company_platform/compliance"]);
  assert(c1.elements["company_platform/fintech"]);
  assert.equal(c1.externalElements.includes("company_platform/fintech"), false);

  const c2 = query(project, "c2");
  assert(c2.elements["company_platform/compliance_api"]);
  assert(c2.elements["company_platform/fintech"]);
  assert(c2.externalElements.includes("company_platform/fintech"));
  assert.equal(c2.elements["company_platform/fintech_api"], undefined);

  const deployment = query(project, "deployment");
  assert(deployment.elements["company_platform/compliance_api"]);
  assert(deployment.elements["company_platform/fintech_api"]);
  assert(deployment.elements["eu/kubernetes"]);
  assert(deployment.edges.some((edge) => edge.source === "company_platform/compliance_api"
    && edge.target === "company_platform/fintech_api"));
}

function file(project, name, content) {
  writeFileSync(path.join(project, name), content);
}

function query(project, view) {
  return JSON.parse(run([
    "query",
    project,
    "--context",
    "company_platform",
    "--source",
    "compliance.ai",
    "--view",
    view,
    "--format",
    "json",
  ]));
}

function run(args) {
  const result = spawnSync(process.execPath, [cliEntrypoint, ...args], {
    cwd: repositoryRoot,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout;
}
