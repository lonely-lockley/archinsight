import { parentPort } from "node:worker_threads";
import { parseInsightSource, portableParsedSource } from "./parser-facade.js";

if (parentPort === null) throw new Error("Parallel parser worker requires a parent port");
const port = parentPort;

port.on("message", ({ sources }) => {
  try {
    port.postMessage({
      parsed: sources.map(({ index, sourceName, source }: {
        readonly index: number;
        readonly sourceName: string;
        readonly source: string;
      }) => ({
        index,
        parsed: portableParsedSource(parseInsightSource({ sourceName, source })),
      })),
    });
  } catch (cause) {
    port.postMessage({ error: cause instanceof Error ? cause.message : String(cause) });
  }
});
