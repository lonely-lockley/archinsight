import { parseAuthConfig, type AuthConfig } from '$lib/server/auth/auth-config';
import { parseDatabaseConfig, type DatabaseConfig } from '$lib/server/database/database-config';
import { parseRendererConfig, type RendererConfig } from '$lib/server/render/renderer-config';
import { parseRequestLimits, type RequestLimits } from '$lib/server/security/request-limits';
import { parseAnalysisCacheConfig, type AnalysisCacheConfig } from './analysis-cache-config';
import { enumConfigValue } from './config-values';
import { runtimeEnv, type EnvSource } from './local-config';
import { parseRuntimeProfile, type RuntimeProfile } from './runtime-profile';

export type RepositoryBackend = 'memory' | 'postgres';

export type ApplicationConfig = Readonly<{
  runtimeProfile: RuntimeProfile;
  repositoryBackend: RepositoryBackend;
  auth: AuthConfig;
  database: DatabaseConfig;
  renderer: RendererConfig;
  requestLimits: RequestLimits;
  analysisCache: AnalysisCacheConfig;
}>;

export function getApplicationConfig(env?: EnvSource): ApplicationConfig {
  return parseApplicationConfig(runtimeEnv(env));
}

export function parseApplicationConfig(env: EnvSource): ApplicationConfig {
  return deepFreeze({
    runtimeProfile: parseRuntimeProfile(env),
    repositoryBackend: parseRepositoryBackend(env),
    auth: parseAuthConfig(env),
    database: parseDatabaseConfig(env),
    renderer: parseRendererConfig(env),
    requestLimits: parseRequestLimits(env),
    analysisCache: parseAnalysisCacheConfig(env)
  });
}

export function repositoryBackend(env?: EnvSource): RepositoryBackend {
  return parseRepositoryBackend(runtimeEnv(env));
}

export function parseRepositoryBackend(env: EnvSource): RepositoryBackend {
  return enumConfigValue(env, 'ARCHINSIGHT_REPOSITORY_BACKEND', ['memory', 'postgres'], 'memory');
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== 'object' || value == null || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}
