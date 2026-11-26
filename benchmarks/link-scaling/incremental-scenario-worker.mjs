#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { performance } from "node:perf_hooks";
import { ProjectAnalysisSession } from "../../packages/insight-language/build/runtime/index.js";

const [repositoryArgument] = process.argv.slice(2);
if (repositoryArgument === undefined) {
  throw new Error("Usage: incremental-scenario-worker.mjs <repository>");
}

const repository = path.resolve(repositoryArgument);
const manifest = JSON.parse(await readFile(path.join(repository, "manifest.json"), "utf8"));
const sources = await Promise.all(manifest.files.map(async (file) => ({
  sourceName: file.path.replaceAll(path.sep, "/"),
  source: await readFile(path.join(repository, file.path), "utf8"),
})));
const phases = new Map();
const profiler = {
  measure(phase, operation) {
    const started = performance.now();
    try {
      return operation();
    } finally {
      const previous = phases.get(phase) ?? { calls: 0, elapsedMs: 0 };
      phases.set(phase, {
        calls: previous.calls + 1,
        elapsedMs: previous.elapsedMs + performance.now() - started,
      });
    }
  },
};

const session = ProjectAnalysisSession.create(sources, undefined, profiler);
const baseline = session.analysis();
const scenarios = [
  scenario(
    "relationship-topology",
    "contexts/context_039/service-250/model.ai",
    /-> api_249/,
    "-> api_248",
  ),
  scenario(
    "environment-attribute",
    "environments/env-15.ai",
    /region = region-15/,
    "region = region-15-edited",
  ),
  scenario(
    "environment-projection",
    "environments/env-15.ai",
    /            route:\n                \$from originalLink \$this\n/,
    "",
  ),
];

const measurements = [];
for (const item of scenarios) {
  phases.clear();
  const editedSources = sources.map((source) => source.sourceName === item.sourceName
    ? { ...source, source: source.source.replace(item.pattern, item.replacement) }
    : source);
  if (editedSources.find((source) => source.sourceName === item.sourceName)?.source
      === sources.find((source) => source.sourceName === item.sourceName)?.source) {
    throw new Error(`Scenario '${item.name}' did not change ${item.sourceName}`);
  }
  const fork = session.fork();
  const started = performance.now();
  const analysis = fork.update(editedSources);
  const elapsedMs = performance.now() - started;
  const errors = analysis.diagnostics.filter(
    (diagnostic) => diagnostic.level === undefined || diagnostic.level === "ERROR",
  );
  if (analysis.mode !== "incremental" || analysis.reparsedSourceCount !== 1 || errors.length > 0) {
    throw new Error(
      `Scenario '${item.name}' returned mode ${analysis.mode}, reparsed ${analysis.reparsedSourceCount}, errors ${errors.length}`,
    );
  }
  measurements.push({
    name: item.name,
    sourceName: item.sourceName,
    elapsedMs,
    changedSources: analysis.changedSources.size,
    reparsedSources: analysis.reparsedSourceCount,
    relinkedSources: analysis.relinkedSourceCount,
    supportSources: analysis.supportSourceCount,
    elements: analysis.result.elements.length,
    edges: analysis.result.edges.length,
    projectedEdges: projectedEdgeCount(analysis.result),
    graphDelta: graphDelta(baseline.result, analysis.result),
    phases: Object.fromEntries([...phases.entries()].sort(([left], [right]) => left.localeCompare(right))),
  });
}

console.log(JSON.stringify({
  sourceCount: sources.length,
  baselineElements: baseline.result.elements.length,
  baselineEdges: baseline.result.edges.length,
  baselineProjectedEdges: projectedEdgeCount(baseline.result),
  scenarios: measurements,
}));

function scenario(name, sourceName, pattern, replacement) {
  return { name, sourceName, pattern, replacement };
}

function projectedEdgeCount(result) {
  return result.edges.filter((edge) => edge.projected === true).length;
}

function graphDelta(previous, next) {
  return {
    nodes: collectionDelta([...previous.graph.nodes()], [...next.graph.nodes()], (item) => item.id),
    relations: collectionDelta([...previous.graph.relations()], [...next.graph.relations()], (item) => item.id),
    elements: collectionDelta(previous.elements, next.elements, (item) => item.id),
    edges: collectionDelta(previous.edges, next.edges, (item) => item.id),
  };
}

function collectionDelta(previous, next, key) {
  const before = new Map(previous.map((item) => [key(item), JSON.stringify(item)]));
  const after = new Map(next.map((item) => [key(item), JSON.stringify(item)]));
  return {
    added: [...after.keys()].filter((item) => !before.has(item)).length,
    removed: [...before.keys()].filter((item) => !after.has(item)).length,
    changed: [...after].filter(([item, value]) => before.has(item) && before.get(item) !== value).length,
  };
}
