import { integerConfigValue } from './config-values';
import { runtimeEnv, type EnvSource } from './local-config';

export type AnalysisCacheConfig = {
  maxEntries: number;
  ttlMs: number;
  maxEntrySourceBytes: number;
  maxTotalSourceBytes: number;
};

export function getAnalysisCacheConfig(env?: EnvSource): AnalysisCacheConfig {
  return parseAnalysisCacheConfig(runtimeEnv(env));
}

export function parseAnalysisCacheConfig(env: EnvSource): AnalysisCacheConfig {
  return {
    maxEntries: integerConfigValue(env, 'ARCHINSIGHT_ANALYSIS_CACHE_MAX_ENTRIES', 32, { min: 0 }),
    ttlMs: integerConfigValue(env, 'ARCHINSIGHT_ANALYSIS_CACHE_TTL_SECONDS', 900, {
      min: 0,
      max: Math.floor(Number.MAX_SAFE_INTEGER / 1_000)
    }) * 1_000,
    maxEntrySourceBytes: integerConfigValue(env, 'ARCHINSIGHT_ANALYSIS_CACHE_MAX_ENTRY_SOURCE_BYTES', 16_777_216, { min: 0 }),
    maxTotalSourceBytes: integerConfigValue(env, 'ARCHINSIGHT_ANALYSIS_CACHE_MAX_TOTAL_SOURCE_BYTES', 67_108_864, { min: 0 })
  };
}
