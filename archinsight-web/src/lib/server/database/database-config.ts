import type { EnvSource } from '$lib/server/auth/auth-config';
import { runtimeEnv } from '$lib/server/config/local-config';
import {
  booleanConfigValue,
  configValue,
  integerConfigValue,
  optionalConfigValue
} from '$lib/server/config/config-values';

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
  return parseDatabaseConfig(runtimeEnv(env));
}

export function parseDatabaseConfig(source: EnvSource): DatabaseConfig {
  return {
    enabled: booleanConfigValue(source, 'ARCHINSIGHT_DATABASE_ENABLED', false),
    connectionString: optionalConfigValue(source, 'ARCHINSIGHT_DATABASE_URL'),
    host: configValue(source, 'ARCHINSIGHT_DATABASE_HOST', 'localhost'),
    port: integerConfigValue(source, 'ARCHINSIGHT_DATABASE_PORT', 5432, { min: 1, max: 65_535 }),
    database: optionalConfigValue(source, 'ARCHINSIGHT_DATABASE_NAME'),
    user: optionalConfigValue(source, 'ARCHINSIGHT_DATABASE_USER'),
    password: optionalConfigValue(source, 'ARCHINSIGHT_DATABASE_PASSWORD', { preserveWhitespace: true }),
    ssl: booleanConfigValue(source, 'ARCHINSIGHT_DATABASE_SSL', false),
    maxConnections: integerConfigValue(source, 'ARCHINSIGHT_DATABASE_MAX_CONNECTIONS', 10, { min: 1 }),
    migrationsEnabled: booleanConfigValue(source, 'ARCHINSIGHT_DATABASE_MIGRATIONS_ENABLED', true)
  };
}
