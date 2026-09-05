export type RenderIdentityKind = "node" | "edge" | "cluster" | "cluster-anchor" | "note";

export interface RenderIdentity {
  readonly kind: RenderIdentityKind;
  readonly provenance: readonly string[];
}

const RENDER_IDENTITY_PREFIX = "insight_";
const RENDER_IDENTITY_KINDS: readonly RenderIdentityKind[] = [
  "cluster-anchor",
  "cluster",
  "node",
  "edge",
  "note",
];

export function renderIdentity(
  kind: RenderIdentityKind,
  provenance: readonly (string | number | boolean)[],
): string {
  return `${RENDER_IDENTITY_PREFIX}${kind}_${encodeUtf8Hex(JSON.stringify(provenance.map(String)))}`;
}

export function parseRenderIdentity(value: string): RenderIdentity | undefined {
  const normalized = value.startsWith("cluster_") ? value.slice("cluster_".length) : value;
  const kind = RENDER_IDENTITY_KINDS.find((candidate) =>
    normalized.startsWith(`${RENDER_IDENTITY_PREFIX}${candidate}_`)
  );
  if (kind === undefined) {
    return undefined;
  }
  const encoded = normalized.slice(`${RENDER_IDENTITY_PREFIX}${kind}_`.length);
  try {
    const parsed = JSON.parse(decodeUtf8Hex(encoded));
    if (!Array.isArray(parsed) || !parsed.every((item: unknown) => typeof item === "string")) {
      return undefined;
    }
    return { kind, provenance: parsed };
  } catch {
    return undefined;
  }
}

function encodeUtf8Hex(value: string): string {
  return [...new TextEncoder().encode(value)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function decodeUtf8Hex(value: string): string {
  if (value.length === 0 || value.length % 2 !== 0 || /[^0-9a-f]/.test(value)) {
    throw new Error("Invalid render identity encoding");
  }
  const bytes = new Uint8Array(value.length / 2);
  for (let index = 0; index < value.length; index += 2) {
    bytes[index / 2] = Number.parseInt(value.slice(index, index + 2), 16);
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}
