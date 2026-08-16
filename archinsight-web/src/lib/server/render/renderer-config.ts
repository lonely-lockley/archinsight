import { runtimeEnv, type EnvSource } from '$lib/server/config/local-config';

export type RendererConfig = {
  enabled: boolean;
  baseUrl: string | null;
  token: string | null;
  timeoutMs: number;
  maxResponseBytes: number;
  maxSvgBytes: number;
  maxTotalSvgBytes: number;
};

export function getRendererConfig(env?: EnvSource): RendererConfig {
  const source = runtimeEnv(env);
  const enabled = booleanValue(source.ARCHINSIGHT_RENDERER_ENABLED, false);
  const baseUrl = optionalValue(source.ARCHINSIGHT_RENDERER_URL);
  const token = optionalValue(source.ARCHINSIGHT_RENDERER_TOKEN);

  if (!enabled) {
    return {
      enabled: false,
      baseUrl: null,
      token: null,
      timeoutMs: 7_000,
      maxResponseBytes: 16 * 1024 * 1024,
      maxSvgBytes: 2 * 1024 * 1024,
      maxTotalSvgBytes: 8 * 1024 * 1024
    };
  }

  if (!baseUrl) {
    throw new Error('ARCHINSIGHT_RENDERER_URL must be configured when the external renderer is enabled');
  }
  if (!token) {
    throw new Error('ARCHINSIGHT_RENDERER_TOKEN must be configured when the external renderer is enabled');
  }
  if (token.length < 16) {
    throw new Error('ARCHINSIGHT_RENDERER_TOKEN must contain at least 16 characters');
  }
  if (baseUrl) {
    const parsed = new URL(baseUrl);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error('ARCHINSIGHT_RENDERER_URL must use http or https');
    }
    if (parsed.username || parsed.password) {
      throw new Error('ARCHINSIGHT_RENDERER_URL must not contain credentials');
    }
  }

  return {
    enabled,
    baseUrl,
    token,
    timeoutMs: positiveInteger(source.ARCHINSIGHT_RENDERER_TIMEOUT_MS, 7_000),
    maxResponseBytes: positiveInteger(source.ARCHINSIGHT_RENDERER_MAX_RESPONSE_BYTES, 16 * 1024 * 1024),
    maxSvgBytes: positiveInteger(source.ARCHINSIGHT_RENDERER_MAX_SVG_BYTES, 2 * 1024 * 1024),
    maxTotalSvgBytes: positiveInteger(source.ARCHINSIGHT_RENDERER_MAX_TOTAL_SVG_BYTES, 8 * 1024 * 1024)
  };
}

export function rendererSvgUrl(config: RendererConfig): string {
  if (!config.baseUrl) {
    throw new Error('External renderer URL is not configured');
  }
  return new URL('render/svg', `${config.baseUrl.replace(/\/+$/u, '')}/`).toString();
}

function optionalValue(value: string | undefined): string | null {
  if (!value || value.trim() === '' || value === '__unset__') {
    return null;
  }
  return value.trim();
}

function booleanValue(value: string | undefined, fallback: boolean): boolean {
  if (value == null || value.trim() === '') {
    return fallback;
  }
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) {
    return true;
  }
  if (['0', 'false', 'no', 'off'].includes(normalized)) {
    return false;
  }
  throw new Error('ARCHINSIGHT_RENDERER_ENABLED must be a boolean');
}

function positiveInteger(value: string | undefined, fallback: number): number {
  if (value == null || value.trim() === '') {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error('Renderer limits and timeouts must be positive integers');
  }
  return parsed;
}
