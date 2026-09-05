export interface SyntheticLinkedIdentity {
  readonly kind: string;
  readonly provenance: readonly string[];
}

const SYNTHETIC_PREFIX = "~insight~";

export function syntheticLinkedLocalId(
  kind: string,
  provenance: readonly (string | number)[],
): string {
  const identity: SyntheticLinkedIdentity = {
    kind,
    provenance: provenance.map(String),
  };
  return `${SYNTHETIC_PREFIX}${encodeURIComponent(JSON.stringify(identity))}`;
}

export function parseSyntheticLinkedLocalId(value: string): SyntheticLinkedIdentity | undefined {
  if (!value.startsWith(SYNTHETIC_PREFIX)) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(decodeURIComponent(value.slice(SYNTHETIC_PREFIX.length)));
    if (typeof parsed !== "object" || parsed === null || typeof parsed.kind !== "string"
        || !Array.isArray(parsed.provenance)
        || !parsed.provenance.every((item: unknown) => typeof item === "string")) {
      return undefined;
    }
    return { kind: parsed.kind, provenance: parsed.provenance };
  } catch {
    return undefined;
  }
}

export function isSyntheticLinkedLocalId(value: string): boolean {
  return parseSyntheticLinkedLocalId(value) !== undefined;
}
