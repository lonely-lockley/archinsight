import { runtimeEnv, type EnvSource } from '$lib/server/config/local-config';
import {
  booleanConfigValue,
  integerConfigValue,
  requiredConfigValue,
  requiredUrlConfigValue
} from '$lib/server/config/config-values';

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
  return parseRendererConfig(runtimeEnv(env));
}

export function parseRendererConfig(source: EnvSource): RendererConfig {
  const enabled = booleanConfigValue(source, 'ARCHINSIGHT_RENDERER_ENABLED', false);

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

  const baseUrl = requiredUrlConfigValue(source, 'ARCHINSIGHT_RENDERER_URL', {
    protocols: ['http:', 'https:'], allowCredentials: false
  });
  const token = requiredConfigValue(source, 'ARCHINSIGHT_RENDERER_TOKEN');
  if (token.length < 16) {
    throw new Error('ARCHINSIGHT_RENDERER_TOKEN must contain at least 16 characters');
  }

  return {
    enabled,
    baseUrl,
    token,
    timeoutMs: integerConfigValue(source, 'ARCHINSIGHT_RENDERER_TIMEOUT_MS', 7_000, { min: 1 }),
    maxResponseBytes: integerConfigValue(source, 'ARCHINSIGHT_RENDERER_MAX_RESPONSE_BYTES', 16 * 1024 * 1024, { min: 1 }),
    maxSvgBytes: integerConfigValue(source, 'ARCHINSIGHT_RENDERER_MAX_SVG_BYTES', 2 * 1024 * 1024, { min: 1 }),
    maxTotalSvgBytes: integerConfigValue(source, 'ARCHINSIGHT_RENDERER_MAX_TOTAL_SVG_BYTES', 8 * 1024 * 1024, { min: 1 })
  };
}

export function rendererSvgUrl(config: RendererConfig): string {
  if (!config.baseUrl) {
    throw new Error('External renderer URL is not configured');
  }
  return new URL('render/svg', `${config.baseUrl.replace(/\/+$/u, '')}/`).toString();
}
