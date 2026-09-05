import {
  createApplicationServices,
  type ApplicationServiceOverrides,
  type ApplicationServices
} from './application-services';
import type { EnvSource } from './local-config';

let activeServices: ApplicationServices | undefined;
let shutdownPromise: Promise<void> | undefined;

export function initializeApplicationServices(
  env?: EnvSource,
  overrides: ApplicationServiceOverrides = {}
): ApplicationServices {
  activeServices ??= createApplicationServices(env, overrides);
  return activeServices;
}

export function applicationServices(): ApplicationServices {
  if (!activeServices) {
    throw new Error('Application services have not been initialized');
  }
  return activeServices;
}

export function disposeApplicationServices(): Promise<void> {
  if (shutdownPromise) return shutdownPromise;
  const services = activeServices;
  activeServices = undefined;
  shutdownPromise = services?.dispose() ?? Promise.resolve();
  return shutdownPromise.finally(() => {
    shutdownPromise = undefined;
  });
}
