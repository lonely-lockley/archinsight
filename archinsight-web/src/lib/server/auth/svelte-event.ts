import type { RequestEvent } from '@sveltejs/kit';
import type { EnvSource } from './auth-config';
import { runtimeEnv } from '$lib/server/config/local-config';

export function eventEnv(event: Pick<RequestEvent, 'platform'>): EnvSource {
  const platform = event.platform as { env?: EnvSource } | undefined;
  return runtimeEnv(platform?.env);
}
