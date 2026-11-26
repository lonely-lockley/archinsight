import type { ProjectionOrigin } from "./contracts.js";

export function uniqueProjectionOrigins(origins: readonly ProjectionOrigin[]): readonly ProjectionOrigin[] {
  const seen = new Set<string>();
  const result: ProjectionOrigin[] = [];
  for (const origin of origins) {
    const key = projectionOriginKey(origin);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(origin);
  }
  return result;
}

export function projectionOriginKey(origin: ProjectionOrigin): string {
  const declaration = origin.declaration;
  return [
    origin.source,
    origin.target,
    origin.sourceIdentity ?? "",
    declaration?.sourceName ?? "",
    declaration?.line ?? "",
    declaration?.column ?? "",
    declaration?.endLine ?? "",
    declaration?.endColumn ?? "",
  ].join("\0");
}
