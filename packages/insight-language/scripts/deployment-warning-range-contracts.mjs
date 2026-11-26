import assert from "node:assert/strict";
import {
  buildLanguageSnapshotResultFromSources,
  coreLanguageSnapshot,
  linkProject,
} from "../build/runtime/index.js";

const definitions = buildLanguageSnapshotResultFromSources([
  source("framework.ai", `
define type TestEnvironment of Environment
    Compute compute
    NetworkConnection network
`),
], [coreLanguageSnapshot]);
assert.deepEqual(definitions.diagnostics, []);

const appSource = `
context app

import internal_network from environment eu

deploymentProfile regional
    appliesTo:
        production from eu
    runsOn compute

system frontend
    name = Application

    service frontend_service
        name = Frontend
        deployment:
            uses regional
        links:
            -> backend_service
                deployment:
                    route clusterLocal
            -> remote from external
                technology = HTTPS
                description = Calls an external system

    service backend_service
        name = Backend
        deployment:
            uses regional
`.trimStart();

const result = linkProject({
  snapshot: definitions.snapshot,
  sources: [
    source("eu.ai", `
environment eu
    name = EU

deployment production
    compute:
        compute compute
            name = Compute
    network:
        networkConnection internal_network
            name = Internal network

route clusterLocal
    outbound:
        $from originalLink $to
`),
    source("external.ai", `
context external

external system remote
    name = Remote
`),
    source("app.ai", appSource),
  ],
});

assert.equal(
  result.diagnostics.some((diagnostic) => diagnostic.level === undefined || diagnostic.level === "ERROR"),
  false,
  JSON.stringify(result.diagnostics, null, 2),
);
const warning = result.diagnostics.find((diagnostic) =>
  diagnostic.code === "WIRE_MISSING_DEPLOYMENT"
  && diagnostic.message.includes("'frontend_service' to 'remote'")
);
assert(warning, JSON.stringify(result.diagnostics, null, 2));
assert.equal(diagnosticText(appSource, warning), "-> remote from external");

console.log("deployment warning range contracts passed");

function diagnosticText(text, diagnostic) {
  assert.equal(diagnostic.line, diagnostic.endLine, "wire warning must stay on its declaration line");
  assert.notEqual(diagnostic.endColumn, undefined);
  const line = text.split(/\r?\n/)[diagnostic.line - 1] ?? "";
  return line.slice(diagnostic.column - 1, diagnostic.endColumn - 1);
}

function source(sourceName, sourceText) {
  return { sourceName, source: sourceText.trimStart() };
}
