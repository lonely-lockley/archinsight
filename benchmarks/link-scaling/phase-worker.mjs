#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { performance } from "node:perf_hooks";
import { ProjectAnalysisSession } from "../../packages/insight-language/build/runtime/index.js";
import { createNodeParallelSourceParser } from "../../packages/insight-language/build/runtime/node-parallel-parser.js";

const [repositoryArgument, countArgument, modeArgument] = process.argv.slice(2);
if (repositoryArgument === undefined || countArgument === undefined) {
  throw new Error("Usage: phase-worker.mjs <repository> <service-count>");
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

global.gc?.();
const started = performance.now();
const parser = createNodeParallelSourceParser({
  workerUrl: new URL("../../packages/insight-language/build/runtime/node-parallel-parser-worker.js", import.meta.url),
});
const session = modeArgument === "parallel"
  ? await ProjectAnalysisSession.createAsync(sources, async (input) => {
    const parseStarted = performance.now();
    try {
      return await parser(input);
    } finally {
      phases.set("session.parse-sources-parallel", {
        calls: 1,
        elapsedMs: performance.now() - parseStarted,
      });
    }
  }, undefined, profiler)
  : ProjectAnalysisSession.create(sources, undefined, profiler);
const analysis = session.analysis();
const elapsedMs = performance.now() - started;
const errors = analysis.diagnostics.filter(
  (diagnostic) => diagnostic.level === undefined || diagnostic.level === "ERROR",
);
if (errors.length > 0) {
  for (const diagnostic of errors.slice(0, 20)) {
    console.error(`${diagnostic.sourceName}:${diagnostic.line}:${diagnostic.column} ${diagnostic.code}: ${diagnostic.message}`);
  }
  throw new Error(`Linking ${serviceCount} services produced ${errors.length} error diagnostics`);
}

console.log(JSON.stringify({
  serviceCount,
  parseMode: modeArgument === "parallel" ? "parallel" : "sequential",
  sourceCount: sources.length,
  sourceLines: selectedFiles.reduce((sum, file) => sum + file.lines, 0),
  elapsedMs,
  elements: analysis.result.elements.length,
  edges: analysis.result.edges.length,
  diagnostics: analysis.diagnostics.length,
  phases: Object.fromEntries([...phases.entries()].sort(([left], [right]) => left.localeCompare(right))),
}));
