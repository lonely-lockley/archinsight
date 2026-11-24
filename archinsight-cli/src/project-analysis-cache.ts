import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import {
  mkdir,
  open,
  readFile,
  readdir,
  rename,
  stat,
  unlink,
} from "node:fs/promises";
import path from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";
import type {
  PortableParsedSource,
  PortableProjectAnalysisSession,
  PortableProjectAnalysisState,
  ProjectSource,
} from "@insight/language";
import { decodeBinaryCacheValue, encodeBinaryCacheValue } from "./binary-cache-codec.js";

const ENVELOPE_MAGIC = Buffer.from("AICACHE\0", "ascii");
const ENVELOPE_VERSION = 1;
const PAYLOAD_SCHEMA_VERSION = 3;
const CODEC_GZIP = 1;
const HEADER_BYTES = 112;
const DIGEST_BYTES = 32;
const MAX_COMPRESSED_BYTES = 512 * 1024 * 1024;
const MAX_UNCOMPRESSED_BYTES = 512 * 1024 * 1024;
const CACHE_FILE_PREFIX = "analysis-";
const CACHE_FILE_SUFFIX = ".aic";
const CACHE_GENERATIONS_TO_KEEP = 2;

interface SourceDigest {
  readonly sourceName: string;
  readonly bytes: number;
  readonly sha256: string;
}

interface ProjectAnalysisCacheStateDocument {
  readonly projectFingerprint: string;
  readonly sources: readonly SourceDigest[];
  readonly analysis: PortableProjectAnalysisState;
}

export interface RestoredProjectAnalysisCache {
  readonly analysis: PortableProjectAnalysisState;
  readonly exactSources: boolean;
  readonly timings: Readonly<Record<string, number>>;
  loadSession(): {
    readonly analysis: PortableProjectAnalysisSession;
    readonly timings: Readonly<Record<string, number>>;
  };
}

export function configuredAnalysisCacheDirectory(
  projectRoot: string,
  projectDirectory: string,
  options: { readonly disabled?: boolean; readonly directory?: string } = {},
): string | undefined {
  if (options.disabled === true) return undefined;
  const configured = options.directory?.trim();
  const base = configured === undefined || configured === ""
    ? path.join(projectDirectory, ".archinsight", "cache")
    : path.resolve(configured);
  const projectKey = sha256(Buffer.from(path.resolve(projectRoot), "utf8")).toString("hex");
  return path.join(base, "projects", projectKey);
}

export async function restoreProjectAnalysisCache(
  directory: string,
  projectRoot: string,
  cliVersion: string,
  currentSources: readonly ProjectSource[],
): Promise<RestoredProjectAnalysisCache | undefined> {
  const files = await cacheGenerationFiles(directory);
  const expectedRootHash = sha256(Buffer.from(path.resolve(projectRoot), "utf8"));
  const expectedAbi = analysisAbi(cliVersion);
  for (const file of files) {
    try {
      const generation = await readGeneration(path.join(directory, file), expectedRootHash, expectedAbi);
      const manifestStarted = performance.now();
      const current = sourceManifest(currentSources);
      return {
        analysis: generation.document.analysis,
        exactSources: generation.document.projectFingerprint === current.projectFingerprint
          && sameSourceManifest(generation.document.sources, current.sources)
          && sameProjectSources(generation.document.analysis.sources, currentSources),
        timings: {
          ...generation.timings,
          "source-hashes": performance.now() - manifestStarted,
        },
        loadSession: generation.loadSession,
      };
    } catch {
      // A cache is expendable. Try an older complete generation, then fall
      // back to a cold analysis without changing command behavior.
    }
  }
  return undefined;
}

export async function storeProjectAnalysisCache(
  directory: string,
  projectRoot: string,
  cliVersion: string,
  sources: readonly ProjectSource[],
  analysis: PortableProjectAnalysisSession,
): Promise<void> {
  const manifest = sourceManifest(sources);
  const { parsedSources, ...analysisState } = analysis;
  const document: ProjectAnalysisCacheStateDocument = {
    projectFingerprint: manifest.projectFingerprint,
    sources: manifest.sources,
    analysis: analysisState,
  };
  const statePayload = encodeBinaryCacheValue(document);
  const astPayload = encodeBinaryCacheValue(parsedSources);
  if (statePayload.length > MAX_UNCOMPRESSED_BYTES || astPayload.length > MAX_UNCOMPRESSED_BYTES) {
    throw new Error("Analysis cache payload is too large");
  }
  const compressedState = gzipSync(statePayload, { level: 1 });
  const compressedAst = gzipSync(astPayload, { level: 1 });
  if (compressedState.length > MAX_COMPRESSED_BYTES || compressedAst.length > MAX_COMPRESSED_BYTES) {
    throw new Error("Compressed analysis cache is too large");
  }
  const rootHash = sha256(Buffer.from(path.resolve(projectRoot), "utf8"));
  const header = cacheHeader(
    statePayload.length,
    compressedState.length,
    astPayload.length,
    compressedAst.length,
    analysisAbi(cliVersion),
    rootHash,
  );
  const contents = Buffer.concat([header, compressedState, compressedAst]);
  const digest = sha256(contents);
  const file = Buffer.concat([contents, digest]);

  await mkdir(directory, { recursive: true, mode: 0o700 });
  const generation = `${CACHE_FILE_PREFIX}${Date.now().toString().padStart(13, "0")}-${randomBytes(8).toString("hex")}${CACHE_FILE_SUFFIX}`;
  const temporary = path.join(directory, `.tmp-${randomBytes(12).toString("hex")}`);
  const destination = path.join(directory, generation);
  let handle;
  try {
    handle = await open(temporary, "wx", 0o600);
    await handle.writeFile(file);
    await handle.sync();
    await handle.close();
    handle = undefined;
    await rename(temporary, destination);
    await syncDirectory(directory);
  } catch (error) {
    await handle?.close().catch(() => undefined);
    await unlink(temporary).catch(() => undefined);
    throw error;
  }
  await pruneOldGenerations(directory);
}

async function readGeneration(
  file: string,
  expectedRootHash: Buffer,
  expectedAbi: Buffer,
): Promise<{
  readonly document: ProjectAnalysisCacheStateDocument;
  readonly timings: Readonly<Record<string, number>>;
  loadSession(): {
    readonly analysis: PortableProjectAnalysisSession;
    readonly timings: Readonly<Record<string, number>>;
  };
}> {
  const readStarted = performance.now();
  const info = await stat(file);
  const maximumFileBytes = HEADER_BYTES + MAX_COMPRESSED_BYTES * 2 + DIGEST_BYTES;
  if (!info.isFile() || info.size < HEADER_BYTES + DIGEST_BYTES || info.size > maximumFileBytes) {
    throw new Error("Invalid analysis cache file size");
  }
  const fileBytes = await readFile(file);
  const readFinished = performance.now();
  if (!fileBytes.subarray(0, ENVELOPE_MAGIC.length).equals(ENVELOPE_MAGIC)) {
    throw new Error("Invalid analysis cache magic");
  }
  if (fileBytes.readUInt16LE(8) !== ENVELOPE_VERSION) throw new Error("Unsupported analysis cache envelope");
  if (fileBytes.readUInt16LE(10) !== PAYLOAD_SCHEMA_VERSION) throw new Error("Unsupported analysis cache schema");
  if (fileBytes[12] !== CODEC_GZIP || fileBytes[13] !== CODEC_GZIP || fileBytes[14] !== 0 || fileBytes[15] !== 0) {
    throw new Error("Unsupported analysis cache codec");
  }
  if (!timingSafeEqual(fileBytes.subarray(16, 48), expectedAbi)) throw new Error("Analysis cache ABI mismatch");
  if (!timingSafeEqual(fileBytes.subarray(80, 112), expectedRootHash)) throw new Error("Analysis cache project mismatch");
  const stateUncompressedLength = safeLength(fileBytes.readBigUInt64LE(48), MAX_UNCOMPRESSED_BYTES);
  const stateCompressedLength = safeLength(fileBytes.readBigUInt64LE(56), MAX_COMPRESSED_BYTES);
  const astUncompressedLength = safeLength(fileBytes.readBigUInt64LE(64), MAX_UNCOMPRESSED_BYTES);
  const astCompressedLength = safeLength(fileBytes.readBigUInt64LE(72), MAX_COMPRESSED_BYTES);
  const expectedLength = HEADER_BYTES + stateCompressedLength + astCompressedLength + DIGEST_BYTES;
  if (fileBytes.length !== expectedLength) throw new Error("Analysis cache file is truncated or has trailing data");
  const stateEnd = HEADER_BYTES + stateCompressedLength;
  const payloadEnd = stateEnd + astCompressedLength;
  const expectedDigest = fileBytes.subarray(payloadEnd);
  const digestStarted = performance.now();
  const actualDigest = sha256(fileBytes.subarray(0, payloadEnd));
  if (!timingSafeEqual(expectedDigest, actualDigest)) throw new Error("Analysis cache digest mismatch");
  const unpackStarted = performance.now();
  const statePayload = gunzipSync(fileBytes.subarray(HEADER_BYTES, stateEnd), {
    maxOutputLength: MAX_UNCOMPRESSED_BYTES,
  });
  if (statePayload.length !== stateUncompressedLength) throw new Error("Analysis cache unpacked state length mismatch");
  const decodeStarted = performance.now();
  const decoded = decodeBinaryCacheValue(statePayload);
  const validateStarted = performance.now();
  const document = validateCacheStateDocument(decoded);
  const finished = performance.now();
  const compressedAst = fileBytes.subarray(stateEnd, payloadEnd);
  return {
    document,
    timings: {
      "cache-read": readFinished - readStarted,
      "cache-digest": unpackStarted - digestStarted,
      "cache-gunzip": decodeStarted - unpackStarted,
      "cache-decode": validateStarted - decodeStarted,
      "cache-validate": finished - validateStarted,
    },
    loadSession() {
      const unpackStarted = performance.now();
      const astPayload = gunzipSync(compressedAst, { maxOutputLength: MAX_UNCOMPRESSED_BYTES });
      if (astPayload.length !== astUncompressedLength) throw new Error("Analysis cache unpacked AST length mismatch");
      const decodeStarted = performance.now();
      const parsedSources = validateParsedSources(decodeBinaryCacheValue(astPayload), document.sources.length);
      const finished = performance.now();
      return {
        analysis: { ...document.analysis, parsedSources },
        timings: {
          "ast-gunzip": decodeStarted - unpackStarted,
          "ast-decode": finished - decodeStarted,
        },
      };
    },
  };
}

function cacheHeader(
  stateUncompressedLength: number,
  stateCompressedLength: number,
  astUncompressedLength: number,
  astCompressedLength: number,
  abi: Buffer,
  rootHash: Buffer,
): Buffer {
  const header = Buffer.alloc(HEADER_BYTES);
  ENVELOPE_MAGIC.copy(header, 0);
  header.writeUInt16LE(ENVELOPE_VERSION, 8);
  header.writeUInt16LE(PAYLOAD_SCHEMA_VERSION, 10);
  header[12] = CODEC_GZIP;
  header[13] = CODEC_GZIP;
  abi.copy(header, 16);
  header.writeBigUInt64LE(BigInt(stateUncompressedLength), 48);
  header.writeBigUInt64LE(BigInt(stateCompressedLength), 56);
  header.writeBigUInt64LE(BigInt(astUncompressedLength), 64);
  header.writeBigUInt64LE(BigInt(astCompressedLength), 72);
  rootHash.copy(header, 80);
  return header;
}

function validateCacheStateDocument(value: unknown): ProjectAnalysisCacheStateDocument {
  const document = record(value, "analysis cache document");
  const projectFingerprint = hexDigest(document.projectFingerprint, "project fingerprint");
  if (!Array.isArray(document.sources) || document.sources.length > 1_000_000) {
    throw new Error("Invalid analysis cache source manifest");
  }
  const names = new Set<string>();
  const sources = document.sources.map((value, index): SourceDigest => {
    const source = record(value, `source manifest entry ${index}`);
    if (typeof source.sourceName !== "string" || source.sourceName === "" || names.has(source.sourceName)) {
      throw new Error("Invalid or duplicate cached source name");
    }
    names.add(source.sourceName);
    if (!Number.isSafeInteger(source.bytes) || (source.bytes as number) < 0) {
      throw new Error("Invalid cached source byte length");
    }
    return {
      sourceName: source.sourceName,
      bytes: source.bytes as number,
      sha256: hexDigest(source.sha256, "source digest"),
    };
  });
  const analysis = record(document.analysis, "portable analysis");
  if (!Array.isArray(analysis.sources)
      || !Array.isArray(analysis.snapshotSourceNames)
      || typeof analysis.snapshotBuild !== "object" || analysis.snapshotBuild === null
      || typeof analysis.result !== "object" || analysis.result === null) {
    throw new Error("Invalid portable analysis cache structure");
  }
  if (analysis.sources.length !== sources.length) {
    throw new Error("Analysis cache source manifest does not match parsed sources");
  }
  return {
    projectFingerprint,
    sources,
    analysis: document.analysis as PortableProjectAnalysisState,
  };
}

function validateParsedSources(value: unknown, expectedLength: number): readonly PortableParsedSource[] {
  if (!Array.isArray(value) || value.length !== expectedLength) {
    throw new Error("Analysis cache AST section does not match its source manifest");
  }
  return value as readonly PortableParsedSource[];
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`Invalid ${label}`);
  }
  return value as Record<string, unknown>;
}

function hexDigest(value: unknown, label: string): string {
  if (typeof value !== "string" || !/^[0-9a-f]{64}$/u.test(value)) throw new Error(`Invalid ${label}`);
  return value;
}

function sourceManifest(sources: readonly ProjectSource[]): {
  readonly projectFingerprint: string;
  readonly sources: readonly SourceDigest[];
} {
  const entries = [...sources]
    .sort((left, right) => left.sourceName.localeCompare(right.sourceName))
    .map((source): SourceDigest => {
      const bytes = Buffer.from(source.source, "utf8");
      return {
        sourceName: source.sourceName,
        bytes: bytes.length,
        sha256: sha256(bytes).toString("hex"),
      };
    });
  const hash = createHash("sha256");
  hash.update("archinsight-project-sources\0", "utf8");
  for (const entry of entries) {
    const name = Buffer.from(entry.sourceName, "utf8");
    const length = Buffer.alloc(8);
    length.writeBigUInt64LE(BigInt(entry.bytes));
    const nameLength = Buffer.alloc(4);
    nameLength.writeUInt32LE(name.length);
    hash.update(nameLength);
    hash.update(name);
    hash.update(length);
    hash.update(Buffer.from(entry.sha256, "hex"));
  }
  return { projectFingerprint: hash.digest("hex"), sources: entries };
}

function sameSourceManifest(left: readonly SourceDigest[], right: readonly SourceDigest[]): boolean {
  return left.length === right.length && left.every((item, index) => {
    const candidate = right[index];
    return candidate !== undefined
      && item.sourceName === candidate.sourceName
      && item.bytes === candidate.bytes
      && item.sha256 === candidate.sha256;
  });
}

function sameProjectSources(left: readonly ProjectSource[], right: readonly ProjectSource[]): boolean {
  return left.length === right.length && left.every((item, index) => {
    const candidate = right[index];
    return candidate !== undefined
      && item.sourceName === candidate.sourceName
      && item.source === candidate.source;
  });
}

function analysisAbi(cliVersion: string): Buffer {
  return sha256(Buffer.from(`archinsight-analysis-cache\0${cliVersion}\0schema=${PAYLOAD_SCHEMA_VERSION}`, "utf8"));
}

function sha256(value: Uint8Array): Buffer {
  return createHash("sha256").update(value).digest();
}

function safeLength(value: bigint, maximum: number): number {
  if (value > BigInt(maximum)) throw new Error("Analysis cache length exceeds the safety limit");
  return Number(value);
}

async function cacheGenerationFiles(directory: string): Promise<string[]> {
  try {
    return (await readdir(directory))
      .filter((name) => name.startsWith(CACHE_FILE_PREFIX) && name.endsWith(CACHE_FILE_SUFFIX))
      .sort()
      .reverse();
  } catch {
    return [];
  }
}

async function pruneOldGenerations(directory: string): Promise<void> {
  const files = await cacheGenerationFiles(directory);
  await Promise.all(files.slice(CACHE_GENERATIONS_TO_KEEP).map((name) =>
    unlink(path.join(directory, name)).catch(() => undefined)
  ));
}

async function syncDirectory(directory: string): Promise<void> {
  let handle;
  try {
    handle = await open(directory, "r");
    await handle.sync();
  } catch {
    // Some platforms do not allow fsync on directories. The file itself was
    // still fully synced and renamed from the same directory.
  } finally {
    await handle?.close().catch(() => undefined);
  }
}
