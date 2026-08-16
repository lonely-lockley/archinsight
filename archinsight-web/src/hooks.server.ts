import type { ServerInit } from '@sveltejs/kit';
import { building } from '$app/environment';
import { getAuthConfig } from '$lib/server/auth/auth-config';
import { getRendererConfig } from '$lib/server/render/renderer-config';

export const init: ServerInit = () => {
  if (!building) {
    getAuthConfig();
    getRendererConfig();
  }
};
