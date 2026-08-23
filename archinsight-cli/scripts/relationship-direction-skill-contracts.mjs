import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const cliRoot = path.resolve(scriptDirectory, "..");
const repositoryRoot = path.resolve(cliRoot, "..");
const cliEntrypoint = path.join(cliRoot, "build", "index.js");
const temporaryRoot = mkdtempSync(path.join(os.tmpdir(), "archinsight-relationship-direction-skill-contracts-"));

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
  ], {
    cwd: repositoryRoot,
    encoding: "utf8",
  });
  assert.equal(generated.status, 0, generated.stderr);

  const queries = readFileSync(path.join(output, "references", "queries.md"), "utf8");
  assert(queries.includes("(service)-[link:REFERENCES]-(related:Element)"));
  assert(queries.includes("(service:Service {id: 'checkout_api'})<-[link:REFERENCES]-(caller:Element)"));
  assert(queries.includes("`->` for outgoing-only questions"));
  assert(queries.includes("`<-` for incoming-only questions"));
  assert.match(queries, /without reversing the stored\s+edge/);
  assert(queries.includes("`{withDerived}`"));
  assert(queries.includes("`{withProjected}`"));
  assert(queries.includes("outer `derived` and `projected`"));

  const c1 = readFileSync(path.join(output, "examples", "builtin-views", "c1.aiq"), "utf8");
  assert(c1.includes("[link:REFERENCES {withDerived}]-(related:SystemElement)"));
  assert.equal(c1.includes("realInboundLink"), false);
  assert.equal(c1.includes("rollupOutboundLink"), false);

  const c2 = readFileSync(path.join(output, "examples", "builtin-views", "c2.aiq"), "utf8");
  assert(c2.includes("[containerLink:REFERENCES {withDerived}]-(relatedContainer:ContainerElement)"));
  assert(c2.includes("[externalLink:REFERENCES {withDerived}]-(externalSystem:SystemElement)"));

  const c3 = readFileSync(path.join(output, "examples", "builtin-views", "c3.aiq"), "utf8");
  assert(c3.includes("[componentLink:REFERENCES {withDerived}]-(relatedComponent:ComponentElement)"));
  assert(c3.includes("[externalLink:REFERENCES {withDerived}]-(externalSystem:SystemElement)"));

  const c4 = readFileSync(path.join(output, "examples", "builtin-views", "c4.aiq"), "utf8");
  assert(c4.includes("[link:REFERENCES]-(relatedCode:CodeElement)"));

  const deployment = readFileSync(path.join(output, "examples", "builtin-views", "deployment.aiq"), "utf8");
  assert(deployment.includes("[projectedLink:REFERENCES {projected}]-(projectedPeer:Element)"));
  assert(deployment.includes("[directDeploymentLink:REFERENCES]-(directDeploymentTarget:Element)"));
  assert.equal(deployment.includes("incomingProjectedLink"), false);

  const noFilter = readFileSync(path.join(output, "examples", "builtin-views", "no-filter.aiq"), "utf8");
  assert(noFilter.includes("[link:REFERENCES]-(relatedElement)"));

  console.log("relationship direction skill contracts passed");
} finally {
  rmSync(temporaryRoot, { recursive: true, force: true });
}
