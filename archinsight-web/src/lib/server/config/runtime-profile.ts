import { runtimeEnv, type EnvSource } from './local-config';

export type RuntimeProfile = 'all' | 'editor' | 'playground';

export function runtimeProfile(env?: EnvSource): RuntimeProfile {
  const value = (runtimeEnv(env).ARCHINSIGHT_RUNTIME_PROFILE ?? 'all').trim().toLowerCase();
  if (value === 'all' || value === 'editor' || value === 'playground') {
    return value;
  }
  throw new Error('ARCHINSIGHT_RUNTIME_PROFILE must be all, editor, or playground');
}

export function requireRuntimeProfile(env: EnvSource | undefined, required: Exclude<RuntimeProfile, 'all'>): void {
  const actual = runtimeProfile(env);
  if (actual !== 'all' && actual !== required) {
    throw new Response(JSON.stringify({ error: 'Not found' }), {
      status: 404,
      headers: { 'content-type': 'application/json' }
    });
  }
}
