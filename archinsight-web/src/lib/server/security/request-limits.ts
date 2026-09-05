import type { EnvSource } from '$lib/server/auth/auth-config';
import { payloadTooLarge } from '$lib/server/errors/application-error';
import { integerConfigValue } from '$lib/server/config/config-values';
import { runtimeEnv } from '$lib/server/config/local-config';

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
  return parseRequestLimits(runtimeEnv(env));
}

export function parseRequestLimits(env: EnvSource): RequestLimits {
  return {
    maxFileBytes: integerConfigValue(env, 'ARCHINSIGHT_LIMITS_MAX_FILE_BYTES', 1_048_576, { min: 0 }),
    maxOverlays: integerConfigValue(env, 'ARCHINSIGHT_LIMITS_MAX_OVERLAYS', 100, { min: 0 }),
    maxOverlayBytes: integerConfigValue(env, 'ARCHINSIGHT_LIMITS_MAX_OVERLAY_BYTES', 1_048_576, { min: 0 }),
    maxQueryChars: integerConfigValue(env, 'ARCHINSIGHT_LIMITS_MAX_QUERY_CHARS', 20_000, { min: 0 }),
    maxRenderCount: integerConfigValue(env, 'ARCHINSIGHT_LIMITS_MAX_RENDER_COUNT', 16, { min: 0 }),
    maxDotBytes: integerConfigValue(env, 'ARCHINSIGHT_LIMITS_MAX_DOT_BYTES', 1_048_576, { min: 0 })
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
    throw payloadTooLarge(`Too many overlays: ${entries.length}`);
  }
  let totalBytes = 0;
  for (const [sourceIdentity, content] of entries) {
    totalBytes += bytes(sourceIdentity) + bytes(content);
    if (totalBytes > limits.maxOverlayBytes) {
      throw payloadTooLarge('Overlay payload is too large');
    }
  }
}

export function validateQuery(query: string | null | undefined, limits: RequestLimits): void {
  if (query != null && query.length > limits.maxQueryChars) {
    throw payloadTooLarge('Query is too long');
  }
}

export function validateRenderCount(count: number, limits: RequestLimits): void {
  if (count > limits.maxRenderCount) {
    throw payloadTooLarge(`Too many diagrams to render: ${count}`);
  }
}

export function validateDot(dot: string | null | undefined, limits: RequestLimits): void {
  requireBytes('DOT payload', dot, limits.maxDotBytes);
}

function requireBytes(label: string, value: string | null | undefined, maxBytes: number): void {
  if (bytes(value) > maxBytes) {
    throw payloadTooLarge(`${label} is too large`);
  }
}

function bytes(value: string | null | undefined): number {
  return value == null ? 0 : encoder.encode(value).byteLength;
}
