#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { ProjectAnalysisSession } from "../../packages/insight-language/build/runtime/index.js";
import { createNodeParallelSourceParser } from "../../packages/insight-language/build/runtime/node-parallel-parser.js";

const [repositoryArgument, countArgument, modeArgument] = process.argv.slice(2);
if (repositoryArgument === undefined || countArgument === undefined) {
  throw new Error("Usage: benchmark-worker.mjs <repository> <service-count>");
}

const repository = path.resolve(repositoryArgument);
const serviceCount = Number(countArgument);
const manifest = JSON.parse(await readFile(path.join(repository, "manifest.json"), "utf8"));
const selectedFiles = manifest.files.filter(
  (file) => file.serviceIndex === null || file.serviceIndex <= serviceCount,
);
const sources = await Promise.all(selectedFiles.map(async (file) => ({
  sourceName: file.path.replaceAll(path.sep, "/"),
  source: await readFile(path.join(repository, file.path), "utf8"),
})));

global.gc?.();
const rssBeforeBytes = process.memoryUsage().rss;
const heapUsedBeforeBytes = process.memoryUsage().heapUsed;
const started = process.hrtime.bigint();
const session = modeArgument === "parallel"
  ? await ProjectAnalysisSession.createAsync(sources, createNodeParallelSourceParser({
    workerUrl: new URL("../../packages/insight-language/build/runtime/node-parallel-parser-worker.js", import.meta.url),
  }))
  : ProjectAnalysisSession.create(sources);
const analysis = session.analysis();
const elapsedNanoseconds = process.hrtime.bigint() - started;
const incrementalTarget = selectedFiles.find(
  (file) => file.serviceIndex === serviceCount && file.path.endsWith("/components/worker.ai"),
);
if (incrementalTarget === undefined) {
  throw new Error(`No incremental benchmark target found for ${serviceCount} services`);
}
const incrementalSources = sources.map((source) => source.sourceName === incrementalTarget.path
  ? {
      ...source,
      source: source.source.replace(
        /name = Worker component 01 for \d+/,
        (name) => `${name} edited`,
      ),
    }
  : source);
const incrementalStarted = process.hrtime.bigint();
const incrementalAnalysis = session.update(incrementalSources);
const incrementalNanoseconds = process.hrtime.bigint() - incrementalStarted;
const memoryAfter = process.memoryUsage();
const peakRssBytes = process.resourceUsage().maxRSS * 1024;
const errors = analysis.diagnostics.filter(
  (diagnostic) => diagnostic.level === undefined || diagnostic.level === "ERROR",
);
const incrementalErrors = incrementalAnalysis.diagnostics.filter(
  (diagnostic) => diagnostic.level === undefined || diagnostic.level === "ERROR",
);

if (errors.length > 0) {
  for (const diagnostic of errors.slice(0, 20)) {
    console.error(`${diagnostic.sourceName}:${diagnostic.line}:${diagnostic.column} ${diagnostic.code}: ${diagnostic.message}`);
  }
  throw new Error(`Linking ${serviceCount} services produced ${errors.length} error diagnostics`);
}
if (incrementalAnalysis.mode !== "incremental" || incrementalErrors.length > 0) {
  throw new Error(
    `Incremental linking ${serviceCount} services returned mode ${incrementalAnalysis.mode} and ${incrementalErrors.length} error diagnostics`,
  );
}
if (incrementalAnalysis.result.elements.length !== analysis.result.elements.length
  || incrementalAnalysis.result.edges.length !== analysis.result.edges.length) {
  throw new Error(`Incremental linking ${serviceCount} services changed project cardinality`);
}

console.log(JSON.stringify({
  serviceCount,
  parseMode: modeArgument === "parallel" ? "parallel" : "sequential",
  sourceCount: sources.length,
  sourceLines: selectedFiles.reduce((sum, file) => sum + file.lines, 0),
  sourceBytes: selectedFiles.reduce((sum, file) => sum + file.bytes, 0),
  elapsedMs: Number(elapsedNanoseconds) / 1_000_000,
  incrementalMs: Number(incrementalNanoseconds) / 1_000_000,
  incrementalChangedSources: incrementalAnalysis.changedSources.size,
  incrementalReparsedSources: incrementalAnalysis.reparsedSourceCount,
  incrementalRelinkedSources: incrementalAnalysis.relinkedSourceCount,
  incrementalSupportSources: incrementalAnalysis.supportSources.size,
  rssBeforeBytes,
  rssAfterBytes: memoryAfter.rss,
  peakRssBytes,
  heapUsedBeforeBytes,
  heapUsedAfterBytes: memoryAfter.heapUsed,
  elements: analysis.result.elements.length,
  edges: analysis.result.edges.length,
  incrementalElements: incrementalAnalysis.result.elements.length,
  incrementalEdges: incrementalAnalysis.result.edges.length,
  contexts: manifest.contexts.filter((context) => context.services.some(
    (service) => Number(service.slice("service_".length)) <= serviceCount,
  )).length,
  diagnostics: analysis.diagnostics.length,
  diagnosticCodes: Object.fromEntries([...new Set(analysis.diagnostics.map((diagnostic) => diagnostic.code))]
    .sort()
    .map((code) => [code, analysis.diagnostics.filter((diagnostic) => diagnostic.code === code).length])),
  warnings: analysis.diagnostics.filter((diagnostic) => diagnostic.level === "WARNING").length,
  notes: analysis.diagnostics.filter((diagnostic) => diagnostic.level === "NOTE").length,
}));
