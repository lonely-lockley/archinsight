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

    @planned(replace the temporary consumer)
    service consumer
        name = Event consumer
        links:
            @deprecated(move to orders.v2)
            ~> producer
                via = orders.created

    service kafka_consumer
        name = Kafka consumer
        links:
            ~> producer
                technology = Kafka
                via = orders.paid

    service caller
        name = API caller
        links:
            -> producer
                technology = HTTPS

            -> report_api

            -> reporting

system reporting
    name = Reporting

    service report_api
        name = Reporting API
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

  const authoredGraph = query(project, skill, "direct-authored-dependencies.aiq");
  assert(authoredGraph.edges.some((item) =>
    item.edge.source === "shop/caller"
      && item.edge.target === "shop/reporting"
      && item.edge.type === "SyncWire"
  ), "the broad authored query must retain a service-to-system dependency");
  assert.equal(directGraph.edges.some((item) =>
    item.edge.source === "shop/caller" && item.edge.target === "shop/reporting"
  ), false, "the service-level recipe must not pretend to cover cross-level endpoints");

  const asyncGraph = query(project, skill, "async-topic-dependencies.aiq");
  assert.equal(asyncGraph.edges.length, 2);
  assert(asyncGraph.edges.some((item) =>
    item.edge.source === "shop/consumer"
      && item.edge.target === "shop/producer"
      && item.edge.attributes.technology === undefined
  ), "the generic async query must not require technology metadata");

  const kafkaGraph = query(project, skill, "kafka-service-dependencies.aiq");
  assert.equal(kafkaGraph.edges.length, 1);
  assert.equal(kafkaGraph.edges[0].edge.source, "shop/kafka_consumer");
  assert.equal(kafkaGraph.edges[0].edge.target, "shop/producer");
  assert.deepEqual(kafkaGraph.edges[0].edge.attributes.via, ["orders.paid"]);
  assert.deepEqual(kafkaGraph.edges[0].edge.attributes.technology, ["Kafka"]);

  const comparisonQuery = path.join(project, "cross-boundary.aiq");
  writeFileSync(comparisonQuery, `MATCH (source:Service)-[dependency:REFERENCES]->(target:Service)
WHERE source.context = $context
  AND source.parent <> target.parent
RETURN source, dependency, target
`);
  const comparisonGraph = JSON.parse(runCli([
    "query",
    project,
    "--context",
    "shop",
    "--query",
    comparisonQuery,
    "--format",
    "json",
  ]));
  assert.equal(comparisonGraph.edges.length, 1);
  assert.equal(comparisonGraph.edges[0].edge.source, "shop/caller");
  assert.equal(comparisonGraph.edges[0].edge.target, "shop/report_api");

  const annotatedGraph = builtInQuery(project, "no-filter");
  const annotatedElement = annotatedGraph.elements["shop/consumer"];
  assert.deepEqual(annotatedElement.annotations.map((annotation) => [annotation.name, annotation.value]), [
    ["planned", "replace the temporary consumer"],
  ]);
  const annotatedEdge = annotatedGraph.edges.find((item) =>
    item.edge.source === "shop/consumer" && item.edge.target === "shop/producer"
  );
  assert(annotatedEdge);
  assert.deepEqual(annotatedEdge.edge.annotations.map((annotation) => [annotation.name, annotation.value]), [
    ["deprecated", "move to orders.v2"],
  ]);
  assert.equal(typeof annotatedElement.annotations[0].source.line, "number");
  assert.equal(typeof annotatedEdge.edge.annotations[0].source.line, "number");

  const analysis = readFileSync(path.join(skill, "references", "analysis.md"), "utf8");
  assert(analysis.includes("examples/queries/direct-service-dependencies.aiq"));
  assert(analysis.includes("examples/queries/direct-authored-dependencies.aiq"));
  assert(analysis.includes("examples/queries/async-topic-dependencies.aiq"));
  assert(analysis.includes("examples/queries/kafka-service-dependencies.aiq"));
  assert(analysis.includes("Insight eventing is consumer-owned"));
  assert(analysis.includes(".edge.attributes.via"));
  assert(analysis.includes("source.runsOn <> target.runsOn"));
  assert.match(analysis, /current query language has no\s+annotation predicate/);

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

function builtInQuery(project, view) {
  return JSON.parse(runCli([
    "query",
    project,
    "--context",
    "shop",
    "--view",
    view,
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
