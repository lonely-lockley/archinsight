import assert from "node:assert/strict";
import {
  buildLanguageSnapshotResultFromSources,
  coreLanguageSnapshot,
  linkProject,
} from "../build/runtime/index.js";

warnsOnARepeatedDeploymentReference();
resolvesAliasesBeforeDetectingDuplicatesOnCustomProfileTypes();
acceptsDistinctDeploymentProfileMembers();

console.log("deployment profile duplicate introspection contracts passed");

function warnsOnARepeatedDeploymentReference() {
  const model = `
context application

deploymentProfile archinsight_service
    appliesTo:
        production from eu
        production from eu
`.trimStart();
  const result = linked(coreLanguageSnapshot, model);

  assertNoErrors(result.diagnostics);
  const warnings = result.diagnostics.filter((item) => item.code === "DEPLOYMENT_PROFILE_MEMBER_DUPLICATE");
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0]?.level, "WARNING");
  assert.match(warnings[0]?.message ?? "", /'production'.*'archinsight_service'/);
  assert.equal(diagnosticText(model, warnings[0]), "production from eu");
}

function resolvesAliasesBeforeDetectingDuplicatesOnCustomProfileTypes() {
  const definitions = buildLanguageSnapshotResultFromSources([
    source("profiles.ai", `
define type ReleaseProfile of BoundaryElement
    constructor releaseProfile

    capability = "deployment-profile"

    required List of Deployment targets
        capability = "deployment-profile-members"
        capability = "reference-only"
`),
  ], [coreLanguageSnapshot]);
  assertNoErrors(definitions.diagnostics);
  const model = `
context application

import production from environment eu as release

releaseProfile rollout
    targets:
        production from eu
        release
`.trimStart();
  const result = linked(definitions.snapshot, model);

  assertNoErrors(result.diagnostics);
  const warnings = result.diagnostics.filter((item) => item.code === "DEPLOYMENT_PROFILE_MEMBER_DUPLICATE");
  assert.equal(warnings.length, 1);
  assert.match(warnings[0]?.message ?? "", /'production'.*'rollout'/);
  assert.equal(diagnosticText(model, warnings[0]), "release");
}

function acceptsDistinctDeploymentProfileMembers() {
  const model = `
context application

deploymentProfile archinsight_service
    appliesTo:
        production from eu
        staging from eu
`.trimStart();
  const result = linked(coreLanguageSnapshot, model, true);

  assertNoErrors(result.diagnostics);
  assert.equal(result.diagnostics.some((item) => item.code === "DEPLOYMENT_PROFILE_MEMBER_DUPLICATE"), false);
}

function linked(snapshot, model, includeStaging = false) {
  return linkProject({
    snapshot,
    sources: [
      source("eu.ai", `
environment eu
    name = EU

deployment production
${includeStaging ? "\ndeployment staging\n" : ""}`),
      source("model.ai", model),
    ],
  });
}

function diagnosticText(text, diagnostic) {
  assert(diagnostic !== undefined);
  assert.equal(diagnostic.line, diagnostic.endLine);
  assert.notEqual(diagnostic.endColumn, undefined);
  const line = text.split(/\r?\n/)[diagnostic.line - 1] ?? "";
  return line.slice(diagnostic.column - 1, diagnostic.endColumn - 1);
}

function assertNoErrors(diagnostics) {
  assert.deepEqual(diagnostics.filter((item) => item.level === undefined || item.level === "ERROR"), []);
}

function source(sourceName, sourceText) {
  return { sourceName, source: sourceText.trimStart() };
}
