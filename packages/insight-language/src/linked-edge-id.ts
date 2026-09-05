import type { LinkedEdgeId } from "./contracts.js";

const HASH_SEEDS = [
  0x811c9dc5,
  0x9e3779b9,
  0x85ebca6b,
  0xc2b2ae35,
] as const;

export function linkedEdgeId(parts: readonly unknown[]): LinkedEdgeId {
  const identity = parts.map(identityPart).join("|");
  return `edge-${HASH_SEEDS.map((seed) => hash(identity, seed)).join("")}`;
}

function identityPart(value: unknown): string {
  const text = value === undefined ? "" : String(value);
  return `${text.length}:${text}`;
}

function hash(value: string, seed: number): string {
  let result = seed;
  for (let index = 0; index < value.length; index++) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 0x01000193);
  }
  return (result >>> 0).toString(16).padStart(8, "0");
}
