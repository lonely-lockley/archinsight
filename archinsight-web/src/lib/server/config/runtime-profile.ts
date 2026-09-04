import { runtimeEnv, type EnvSource } from './local-config';
import { enumConfigValue } from './config-values';
import { notFound } from '$lib/server/errors/application-error';

export type RuntimeProfile = 'all' | 'editor' | 'playground';

export function runtimeProfile(env?: EnvSource): RuntimeProfile {
  return parseRuntimeProfile(runtimeEnv(env));
}

export function parseRuntimeProfile(env: EnvSource): RuntimeProfile {
  return enumConfigValue(env, 'ARCHINSIGHT_RUNTIME_PROFILE', ['all', 'editor', 'playground'], 'all');
}

export function requireRuntimeProfile(actual: RuntimeProfile, required: Exclude<RuntimeProfile, 'all'>): void {
  if (actual !== 'all' && actual !== required) {
    throw notFound('Not found');
  }
}
