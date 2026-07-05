import type { EnvSource } from '$lib/server/auth/auth-config';

export type RequestLimits = {
  maxFileBytes: number;
  maxOverlays: number;
  maxOverlayBytes: number;
  maxQueryChars: number;
  maxRenderCount: number;
  maxDotBytes: number;
};

const encoder = new TextEncoder();

export function requestLimits(env: EnvSource | undefined): RequestLimits {
  return {
    maxFileBytes: numberValue(env?.ARCHINSIGHT_LIMITS_MAX_FILE_BYTES, 1_048_576),
    maxOverlays: numberValue(env?.ARCHINSIGHT_LIMITS_MAX_OVERLAYS, 100),
    maxOverlayBytes: numberValue(env?.ARCHINSIGHT_LIMITS_MAX_OVERLAY_BYTES, 1_048_576),
    maxQueryChars: numberValue(env?.ARCHINSIGHT_LIMITS_MAX_QUERY_CHARS, 20_000),
    maxRenderCount: numberValue(env?.ARCHINSIGHT_LIMITS_MAX_RENDER_COUNT, 16),
    maxDotBytes: numberValue(env?.ARCHINSIGHT_LIMITS_MAX_DOT_BYTES, 1_048_576)
  };
}

export function validateFileContent(content: string | null | undefined, limits: RequestLimits): void {
  requireBytes('File content', content, limits.maxFileBytes);
}

export function validateOverlays(overlays: Record<string, string> | null | undefined, limits: RequestLimits): void {
  const entries = Object.entries(overlays ?? {});
  if (entries.length === 0) {
    return;
  }
  if (entries.length > limits.maxOverlays) {
    throw new Error(`Too many overlays: ${entries.length}`);
  }
  let totalBytes = 0;
  for (const [sourceIdentity, content] of entries) {
    totalBytes += bytes(sourceIdentity) + bytes(content);
    if (totalBytes > limits.maxOverlayBytes) {
      throw new Error('Overlay payload is too large');
    }
  }
}

export function validateQuery(query: string | null | undefined, limits: RequestLimits): void {
  if (query != null && query.length > limits.maxQueryChars) {
    throw new Error('Query is too long');
  }
}

export function validateRenderCount(count: number, limits: RequestLimits): void {
  if (count > limits.maxRenderCount) {
    throw new Error(`Too many diagrams to render: ${count}`);
  }
}

export function validateDot(dot: string | null | undefined, limits: RequestLimits): void {
  requireBytes('DOT payload', dot, limits.maxDotBytes);
}

function requireBytes(label: string, value: string | null | undefined, maxBytes: number): void {
  if (bytes(value) > maxBytes) {
    throw new Error(`${label} is too large`);
  }
}

function bytes(value: string | null | undefined): number {
  return value == null ? 0 : encoder.encode(value).byteLength;
}

function numberValue(value: string | undefined, fallback: number): number {
  if (value == null || value.trim() === '') {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}
