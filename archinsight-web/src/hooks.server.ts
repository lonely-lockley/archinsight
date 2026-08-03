import type { ServerInit } from '@sveltejs/kit';
import { building } from '$app/environment';
import { getAuthConfig } from '$lib/server/auth/auth-config';

export const init: ServerInit = () => {
  if (!building) {
    getAuthConfig();
  }
};
