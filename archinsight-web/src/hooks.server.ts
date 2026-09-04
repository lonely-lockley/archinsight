import type { Handle, ServerInit } from '@sveltejs/kit';
import { building } from '$app/environment';
import {
  applicationServices,
  disposeApplicationServices,
  initializeApplicationServices
} from '$lib/server/config/application-lifecycle';

export const init: ServerInit = () => {
  if (!building) {
    initializeApplicationServices();
    process.once('sveltekit:shutdown', () => {
      void disposeApplicationServices();
    });
  }
};

export const handle: Handle = ({ event, resolve }) => {
  event.locals.services = applicationServices();
  return resolve(event);
};
