import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = mkdtempSync(path.join(tmpdir(), "archinsight-cli-analytics-"));
const cli = path.resolve("build/index.js");

try {
  write("model.ai", `
context shop

system application
    name = Shop

    service checkout
        name = Checkout
        links:
            -> catalog
            ~> catalog
                via = orders.created

    service catalog
        name = Catalog
        links:
            -> checkout

    container batch
        name = Batch

system reporting
    name = Reporting

    service reporting_worker
        name = Reporting worker
        links:
            ~> catalog
                via = orders.paid
                technology = Kafka
`);
  write("inventory.aiq", `
MATCH (service:Service)
WHERE service.context = $context
RETURN TABLE elementId(service) AS service, service.name AS name
ORDER BY service
`);
  write("one.aiq", `
MATCH (service:Service)
WHERE elementId(service) = $element
RETURN TABLE elementId(service) AS service
`);

  const json = run("query", root, "-c", "shop", "-q", "inventory.aiq", "--format", "json");
  assert.equal(json.status, 0, json.stderr);
  const table = JSON.parse(json.stdout);
  assert.equal(table.schemaVersion, "aiq-table.v1");
  assert.deepEqual(table.rows, [
    ["shop/catalog", "Catalog"],
    ["shop/checkout", "Checkout"],
    ["shop/reporting_worker", "Reporting worker"],
  ]);

  const csv = run("query", root, "-c", "shop", "-q", "inventory.aiq", "--format", "csv");
  assert.equal(csv.status, 0, csv.stderr);
  assert.equal(csv.stdout, "service,name\r\nshop/catalog,Catalog\r\nshop/checkout,Checkout\r\nshop/reporting_worker,Reporting worker\r\n");

  const text = run("query", root, "-c", "shop", "-q", "inventory.aiq", "--format", "text");
  assert.equal(text.status, 0, text.stderr);
  assert.match(text.stdout, /shop\/catalog/);
  assert.match(text.stdout, /3 rows/);

  const parameter = run("query", root, "-q", "one.aiq", "--param", 'element="shop/checkout"');
  assert.equal(parameter.status, 0, parameter.stderr);
  assert.deepEqual(JSON.parse(parameter.stdout).rows, [["shop/checkout"]]);

  const parametersFile = path.join(root, "params.json");
  writeFileSync(parametersFile, JSON.stringify({ element: "shop/catalog" }));
  const fromFile = run("query", root, "-q", "one.aiq", "--params", parametersFile);
  assert.equal(fromFile.status, 0, fromFile.stderr);
  assert.deepEqual(JSON.parse(fromFile.stdout).rows, [["shop/catalog"]]);
  assert.match(run("query", root, "-q", "one.aiq", "--params", parametersFile, "--param", 'element="shop/checkout"').stderr, /supplied more than once/);

  assert.match(run("query", root, "-q", "one.aiq").stderr, /Missing query parameter.*\$element/);
  assert.match(run("query", root, "-q", "one.aiq", "--param", 'unused="x"').stderr, /Missing query parameter|Unused query parameter/);
  assert.match(run("query", root, "-v", "c1", "--format", "csv").stderr, /CSV output is supported only/);
  assert.match(run("query", root, "-q", "one.aiq", "--param", 'element="a"', "--param", 'element="b"').stderr, /supplied more than once/);
  assert.match(run("query", root, "-q", "one.aiq", "--param", 'context="shop"').stderr, /reserved/);
  assert.match(run("query", root, "-q", "one.aiq", "--param", 'element={"nested":true}').stderr, /must be null, boolean/);
  assert.match(run("query", root, "-c", "shop", "-q", "inventory.aiq", "--max-rows", "1").stderr, /AIQ_BUDGET_EXCEEDED/);
  assert.match(run("query", root, "-c", "shop", "-q", "inventory.aiq", "--max-rows", "0").stderr, /positive integer/);
  assert.match(run("render", root, "-c", "shop", "-q", "inventory.aiq", "--format", "svg").stderr, /RETURN TABLE/i);
  write("invalid.aiq", "MATCH (service:Service) RETURN TABLE typo(service) AS value\n");
  const invalid = run("query", root, "-q", "invalid.aiq");
  assert.equal(invalid.status, 1);
  assert.match(invalid.stderr, /^ERROR\tAIQ_UNKNOWN_FUNCTION\tinvalid\.aiq\t1\t/m);
  const preserved = path.join(root, "preserved.json");
  writeFileSync(preserved, "keep me");
  const failedOutput = run("query", root, "-c", "shop", "-q", "inventory.aiq", "--max-rows", "1", "--out", preserved);
  assert.equal(failedOutput.status, 1);
  assert.equal(readFileSync(preserved, "utf8"), "keep me");

  const examples = path.resolve("src/skill/resources/shared/examples/queries");
  const bundled = (name, ...args) => run("query", root, "-q", path.join(examples, name), ...args);
  const inventoryExample = bundled("inventory.aiq");
  assert.equal(inventoryExample.status, 0, inventoryExample.stderr);
  assert.equal(JSON.parse(inventoryExample.stdout).metadata.rowCount, 6);
  const impact = bundled("impact.aiq", "--param", 'element="shop/catalog"');
  assert.equal(impact.status, 0, impact.stderr);
  assert.deepEqual(JSON.parse(impact.stdout).rows.map((row) => row.slice(0, 2)), [
    ["shop/checkout", 1],
    ["shop/reporting_worker", 1],
  ]);
  const unknownImpactAnchor = bundled("impact.aiq", "--param", 'element="shop/typo"');
  assert.equal(unknownImpactAnchor.status, 0, unknownImpactAnchor.stderr);
  assert.deepEqual(JSON.parse(unknownImpactAnchor.stdout).rows, [],
    "an unknown anchor remains an empty result, so callers must validate qualified ids first");
  const syncImpact = bundled("sync-impact.aiq", "--param", 'element="shop/catalog"');
  assert.equal(syncImpact.status, 0, syncImpact.stderr);
  assert.deepEqual(JSON.parse(syncImpact.stdout).rows, [["shop/checkout", 1]]);
  const shortest = bundled("shortest-path.aiq", "--param", 'from="shop/checkout"', "--param", 'to="shop/catalog"');
  assert.equal(shortest.status, 0, shortest.stderr);
  assert.equal(JSON.parse(shortest.stdout).rows[0][2], 1);
  assert.deepEqual(JSON.parse(shortest.stdout).rows[0].slice(3, 6), [0, "shop/checkout", "shop/catalog"]);
  const topics = bundled("async-topics.aiq");
  assert.equal(topics.status, 0, topics.stderr);
  assert.deepEqual(JSON.parse(topics.stdout).rows, [
    ["orders.created", "shop/catalog", "shop/checkout"],
    ["orders.paid", "shop/catalog", "shop/reporting_worker"],
  ], "the generic topic inventory must include an async wire without technology or deployment metadata");
  const kafkaTopics = bundled("kafka-topics.aiq", "--param", 'technology="Kafka"');
  assert.equal(kafkaTopics.status, 0, kafkaTopics.stderr);
  assert.deepEqual(JSON.parse(kafkaTopics.stdout).rows, [["orders.paid", "shop/catalog", "shop/reporting_worker"]]);
  const systemConsumers = bundled("system-async-consumers.aiq", "--param", 'system="shop/application"');
  assert.equal(systemConsumers.status, 0, systemConsumers.stderr);
  assert.deepEqual(JSON.parse(systemConsumers.stdout).rows, [
    ["orders.created", "shop/checkout"],
    ["orders.paid", "shop/reporting_worker"],
  ]);
  const noIncoming = bundled("no-incoming-dependencies.aiq");
  assert.equal(noIncoming.status, 0, noIncoming.stderr);
  assert.deepEqual(JSON.parse(noIncoming.stdout).rows, [["shop/batch"], ["shop/reporting_worker"]]);
  for (const name of ["type-summary.aiq"]) {
    const result = bundled(name);
    assert.equal(result.status, 0, `${name}: ${result.stderr}`);
    assert.equal(JSON.parse(result.stdout).kind, "table");
  }

  for (const name of ["inventory.aiq", "impact.aiq", "sync-impact.aiq", "shortest-path.aiq", "async-topics.aiq", "kafka-topics.aiq", "system-async-consumers.aiq", "no-incoming-dependencies.aiq", "type-summary.aiq"]) {
    assert(readFileSync(path.join(examples, name), "utf8").includes("RETURN TABLE"));
  }

  console.log("CLI analytics query contracts passed");
} finally {
  rmSync(root, { recursive: true, force: true });
}

function write(name, content) {
  writeFileSync(path.join(root, name), content.trimStart());
}

function run(...args) {
  return spawnSync(process.execPath, [cli, ...args], { cwd: path.resolve(".."), encoding: "utf8" });
}
