import type { EnvSource } from './local-config';

export class ConfigurationError extends Error {
  readonly name = 'ConfigurationError';

  constructor(readonly key: string, requirement: string) {
    super(`${key} ${requirement}`);
  }
}

export type StringOptions = {
  preserveWhitespace?: boolean;
};

export type IntegerOptions = {
  min?: number;
  max?: number;
};

export type UrlOptions = {
  protocols?: readonly string[];
  allowCredentials?: boolean;
};

export function optionalConfigValue(
  env: EnvSource,
  key: string,
  options: StringOptions = {}
): string | null {
  const value = env[key];
  if (value == null || value.trim() === '' || value.trim() === '__unset__') return null;
  return options.preserveWhitespace ? value : value.trim();
}

export function configValue(
  env: EnvSource,
  key: string,
  fallback: string,
  options: StringOptions = {}
): string {
  return optionalConfigValue(env, key, options) ?? fallback;
}

export function requiredConfigValue(
  env: EnvSource,
  key: string,
  fallback?: string | null,
  options: StringOptions = {}
): string {
  const value = optionalConfigValue({ [key]: env[key] ?? fallback ?? undefined }, key, options);
  if (value == null) throw new ConfigurationError(key, 'must be configured');
  return value;
}

export function booleanConfigValue(env: EnvSource, key: string, fallback: boolean): boolean {
  const value = optionalConfigValue(env, key);
  if (value == null) return fallback;
  const normalized = value.toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  throw new ConfigurationError(key, 'must be a boolean');
}

export function integerConfigValue(
  env: EnvSource,
  key: string,
  fallback: number,
  options: IntegerOptions = {}
): number {
  const value = optionalConfigValue(env, key);
  if (value == null) return fallback;
  const parsed = Number(value);
  const min = options.min ?? Number.MIN_SAFE_INTEGER;
  const max = options.max ?? Number.MAX_SAFE_INTEGER;
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
    const range = min === max ? `${min}` : `${min}..${max}`;
    throw new ConfigurationError(key, `must be a safe integer in range ${range}`);
  }
  return parsed;
}

export function enumConfigValue<const T extends string>(
  env: EnvSource,
  key: string,
  values: readonly T[],
  fallback: T
): T {
  const value = optionalConfigValue(env, key)?.toLowerCase();
  if (value == null) return fallback;
  if ((values as readonly string[]).includes(value)) return value as T;
  throw new ConfigurationError(key, `must be one of: ${values.join(', ')}`);
}

export function optionalUrlConfigValue(env: EnvSource, key: string, options: UrlOptions = {}): string | null {
  const value = optionalConfigValue(env, key);
  if (value == null) return null;
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new ConfigurationError(key, 'must be a valid URL');
  }
  if (options.protocols && !options.protocols.includes(parsed.protocol)) {
    throw new ConfigurationError(key, `must use ${options.protocols.map((protocol) => protocol.replace(/:$/u, '')).join(' or ')}`);
  }
  if (options.allowCredentials === false && (parsed.username || parsed.password)) {
    throw new ConfigurationError(key, 'must not contain credentials');
  }
  return value;
}

export function requiredUrlConfigValue(
  env: EnvSource,
  key: string,
  options: UrlOptions = {},
  fallback?: string | null
): string {
  const value = optionalUrlConfigValue({ ...env, [key]: env[key] ?? fallback ?? undefined }, key, options);
  if (value == null) throw new ConfigurationError(key, 'must be configured');
  return value;
}

export function urlConfigValue(
  env: EnvSource,
  key: string,
  fallback: string,
  options: UrlOptions = {}
): string {
  return optionalUrlConfigValue({ ...env, [key]: env[key] ?? fallback }, key, options) as string;
}

export function csvConfigValue(env: EnvSource, key: string): string[] {
  return (optionalConfigValue(env, key) ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter((item, index, items) => item !== '' && items.indexOf(item) === index);
}
