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
const temporaryRoot = mkdtempSync(path.join(os.tmpdir(), "archinsight-analysis-skill-contracts-"));

try {
  const skill = path.join(temporaryRoot, "skill");
  runCli(["skill", "init", repositoryRoot, "--target", "codex", "--out", skill]);

  const project = path.join(temporaryRoot, "project");
  mkdirSync(project);
  writeFileSync(path.join(project, "model.ai"), `context shop
    name = Shop

system commerce
    name = Commerce

    service producer
        name = Event producer

    service consumer
        name = Event consumer
        links:
            ~> producer
                technology = Kafka
                via = orders.created

    service caller
        name = API caller
        links:
            -> producer
                technology = HTTPS
`);

  const directGraph = query(project, skill, "direct-service-dependencies.aiq");
  assert(directGraph.edges.some((item) =>
    item.edge.source === "shop/consumer"
      && item.edge.target === "shop/producer"
      && item.edge.type === "AsyncWire"
  ));
  assert(directGraph.edges.some((item) =>
    item.edge.source === "shop/caller"
      && item.edge.target === "shop/producer"
      && item.edge.type === "SyncWire"
  ));

  const kafkaGraph = query(project, skill, "kafka-service-dependencies.aiq");
  assert.equal(kafkaGraph.edges.length, 1);
  assert.equal(kafkaGraph.edges[0].edge.source, "shop/consumer");
  assert.equal(kafkaGraph.edges[0].edge.target, "shop/producer");
  assert.deepEqual(kafkaGraph.edges[0].edge.attributes.via, ["orders.created"]);
  assert.deepEqual(kafkaGraph.edges[0].edge.attributes.technology, ["Kafka"]);

  const analysis = readFileSync(path.join(skill, "references", "analysis.md"), "utf8");
  assert(analysis.includes("examples/queries/direct-service-dependencies.aiq"));
  assert(analysis.includes("examples/queries/kafka-service-dependencies.aiq"));
  assert(analysis.includes("Insight eventing is consumer-owned"));
  assert(analysis.includes(".edge.attributes.via"));

  console.log("analysis skill contracts passed");
} finally {
  rmSync(temporaryRoot, { recursive: true, force: true });
}

function query(project, skill, queryName) {
  return JSON.parse(runCli([
    "query",
    project,
    "--context",
    "shop",
    "--query",
    path.join(skill, "examples", "queries", queryName),
    "--format",
    "json",
  ]));
}

function runCli(args) {
  const result = spawnSync(process.execPath, [cliEntrypoint, ...args], {
    cwd: repositoryRoot,
    encoding: "utf8",
  });
  assert.equal(
    result.status,
    0,
    `archinsight ${args.join(" ")} failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
  );
  return result.stdout;
}
