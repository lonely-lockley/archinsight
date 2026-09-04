import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  applicationServices,
  disposeApplicationServices,
  initializeApplicationServices
} from './application-lifecycle';
import type { ApplicationDatabase } from './application-services';

const testEnv = {
  NODE_ENV: 'test',
  ARCHINSIGHT_DATABASE_ENABLED: 'false',
  ARCHINSIGHT_REPOSITORY_BACKEND: 'memory'
};

afterEach(async () => {
  await disposeApplicationServices();
});

describe('application service lifecycle', () => {
  it('publishes exactly one initialized composition root', () => {
    const initialized = initializeApplicationServices(testEnv);

    expect(initializeApplicationServices(testEnv)).toBe(initialized);
    expect(applicationServices()).toBe(initialized);
  });

  it('disposes the active root and permits a clean next lifecycle', async () => {
    const database = fakeDatabase();
    const first = initializeApplicationServices(testEnv, { database });

    await disposeApplicationServices();

    expect(database.dispose).toHaveBeenCalledOnce();
    expect(() => applicationServices()).toThrow('Application services have not been initialized');
    expect(initializeApplicationServices(testEnv)).not.toBe(first);
  });
});

function fakeDatabase(): ApplicationDatabase & { dispose: ReturnType<typeof vi.fn> } {
  return {
    get: vi.fn(),
    dispose: vi.fn().mockResolvedValue(undefined)
  };
}
