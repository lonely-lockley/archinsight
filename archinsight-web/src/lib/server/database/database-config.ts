import type { EnvSource } from '$lib/server/auth/auth-config';
import { runtimeEnv } from '$lib/server/config/local-config';

export type DatabaseConfig = {
  enabled: boolean;
  connectionString: string | null;
  host: string;
  port: number;
  database: string | null;
  user: string | null;
  password: string | null;
  ssl: boolean;
  maxConnections: number;
  migrationsEnabled: boolean;
};

export function getDatabaseConfig(env?: EnvSource): DatabaseConfig {
  const source = runtimeEnv(env);
  return {
    enabled: booleanValue(source.ARCHINSIGHT_DATABASE_ENABLED, false),
    connectionString: optionalValue(source.ARCHINSIGHT_DATABASE_URL),
    host: source.ARCHINSIGHT_DATABASE_HOST ?? 'localhost',
    port: numberValue(source.ARCHINSIGHT_DATABASE_PORT, 5432),
    database: optionalValue(source.ARCHINSIGHT_DATABASE_NAME),
    user: optionalValue(source.ARCHINSIGHT_DATABASE_USER),
    password: optionalValue(source.ARCHINSIGHT_DATABASE_PASSWORD),
    ssl: booleanValue(source.ARCHINSIGHT_DATABASE_SSL, false),
    maxConnections: numberValue(source.ARCHINSIGHT_DATABASE_MAX_CONNECTIONS, 10),
    migrationsEnabled: booleanValue(source.ARCHINSIGHT_DATABASE_MIGRATIONS_ENABLED, true)
  };
}

function optionalValue(value: string | undefined): string | null {
  if (!value || value.trim() === '' || value === '__unset__') {
    return null;
  }
  return value;
}

function booleanValue(value: string | undefined, fallback: boolean): boolean {
  if (value == null || value.trim() === '') {
    return fallback;
  }
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

function numberValue(value: string | undefined, fallback: number): number {
  if (value == null || value.trim() === '') {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}
