import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { ProjectAnalysisSession } from "../build/runtime/index.js";

const measurements = new Map();
const profiler = {
  measure(phase, operation) {
    const started = performance.now();
    try {
      return operation();
    } finally {
      const previous = measurements.get(phase) ?? { calls: 0, elapsedMs: 0 };
      measurements.set(phase, {
        calls: previous.calls + 1,
        elapsedMs: previous.elapsedMs + performance.now() - started,
      });
    }
  },
};

const analysis = ProjectAnalysisSession.create([{
  sourceName: "model.ai",
  source: `context demo

system source
    name = Source
    links:
        -> target

system target
    name = Target
`,
}], undefined, profiler).analysis();

assert.deepEqual(
  analysis.diagnostics.filter((diagnostic) => diagnostic.level === undefined || diagnostic.level === "ERROR"),
  [],
);
for (const phase of [
  "session.normalize-sources",
  "session.classify-sources",
  "session.build-snapshot",
  "link.workspace",
  "link.workspace.parse-documents",
  "link.deployment",
  "link.logical-relationships",
  "link.logical.materialize-edge",
  "link.projections",
  "link.complete",
  "link.complete.build-indexed-graph",
  "session.materialize-analysis",
]) {
  assert(measurements.has(phase), `missing profiler phase '${phase}'`);
  assert(measurements.get(phase).elapsedMs >= 0, `negative elapsed time for '${phase}'`);
}
assert.equal(measurements.has("link.logical.build-implementation-graph"), false,
  "operator invocations must not rebuild a partial graph");
assert.equal(measurements.get("link.logical.materialize-edge").calls, 1);

console.log("link profiler contracts passed");
