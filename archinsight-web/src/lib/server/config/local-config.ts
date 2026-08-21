import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

export type EnvSource = Record<string, string | undefined>;

let cachedLocalEnv: EnvSource | undefined;

export function runtimeEnv(env?: EnvSource): EnvSource {
  if (env) {
    return { ...process.env, ...env };
  }
  return { ...loadLocalEnv(), ...process.env };
}

export function loadLocalEnv(): EnvSource {
  cachedLocalEnv ??= loadLocalEnvUncached();
  return cachedLocalEnv;
}

export function legacyYamlToEnv(text: string): EnvSource {
  return flattenedYamlToEnv(flatten(parseSimpleYaml(text)));
}

function loadLocalEnvUncached(): EnvSource {
  const configuredPath = process.env.ARCHINSIGHT_LOCAL_CONFIG ?? process.env.ARCHINSIGHT_CONFIG;
  const candidates = localConfigCandidatePaths(process.cwd(), configuredPath);

  const path = candidates.find((candidate) => existsSync(candidate));
  if (!path) {
    return {};
  }
  return legacyYamlToEnv(readFileSync(path, 'utf8'));
}

export function localConfigCandidatePaths(cwd: string, configuredPath?: string): string[] {
  const candidates: string[] = [];
  if (configuredPath && configuredPath.trim() !== '') {
    candidates.push(configuredPath);
  }
  for (const directory of ancestorDirectories(cwd)) {
    candidates.push(resolve(directory, 'local/application.yaml'));
  }
  return [...new Set(candidates)];
}

function ancestorDirectories(start: string): string[] {
  const directories: string[] = [];
  let current = resolve(start);
  while (true) {
    directories.push(current);
    const parent = dirname(current);
    if (parent === current) {
      return directories;
    }
    current = parent;
  }
}

function flattenedYamlToEnv(flattened: Record<string, string>): EnvSource {
  const env: EnvSource = {};
  map(flattened, env, 'archinsight.context-root', 'ARCHINSIGHT_CONTEXT_ROOT');
  map(flattened, env, 'archinsight.editor-path', 'ARCHINSIGHT_EDITOR_PATH');
  map(flattened, env, 'archinsight.runtime-profile', 'ARCHINSIGHT_RUNTIME_PROFILE');

  map(flattened, env, 'archinsight.renderer.enabled', 'ARCHINSIGHT_RENDERER_ENABLED');
  map(flattened, env, 'archinsight.renderer.url', 'ARCHINSIGHT_RENDERER_URL');
  map(flattened, env, 'archinsight.renderer.token', 'ARCHINSIGHT_RENDERER_TOKEN');
  map(flattened, env, 'archinsight.renderer.timeout-ms', 'ARCHINSIGHT_RENDERER_TIMEOUT_MS');
  map(flattened, env, 'archinsight.renderer.max-response-bytes', 'ARCHINSIGHT_RENDERER_MAX_RESPONSE_BYTES');
  map(flattened, env, 'archinsight.renderer.max-svg-bytes', 'ARCHINSIGHT_RENDERER_MAX_SVG_BYTES');
  map(flattened, env, 'archinsight.renderer.max-total-svg-bytes', 'ARCHINSIGHT_RENDERER_MAX_TOTAL_SVG_BYTES');

  map(flattened, env, 'archinsight.auth.mode', 'ARCHINSIGHT_AUTH_MODE');
  map(flattened, env, 'archinsight.auth.dev-user-id', 'ARCHINSIGHT_AUTH_DEV_USER_ID');
  map(flattened, env, 'archinsight.auth.dev-login.enabled', 'ARCHINSIGHT_AUTH_DEV_LOGIN_ENABLED');
  map(flattened, env, 'archinsight.auth.ghost.enabled', 'ARCHINSIGHT_AUTH_GHOST_ENABLED');
  map(flattened, env, 'archinsight.auth.ghost.admin-api-url', 'ARCHINSIGHT_AUTH_GHOST_ADMIN_API_URL');
  map(flattened, env, 'archinsight.auth.ghost.public-url', 'ARCHINSIGHT_AUTH_GHOST_PUBLIC_URL');
  map(flattened, env, 'archinsight.auth.ghost.admin-api-key', 'ARCHINSIGHT_AUTH_GHOST_ADMIN_API_KEY');
  map(flattened, env, 'archinsight.auth.ghost.sync-api-token', 'ARCHINSIGHT_AUTH_GHOST_SYNC_API_TOKEN');
  map(flattened, env, 'archinsight.auth.ghost.ssr-cookie-name', 'ARCHINSIGHT_AUTH_GHOST_SSR_COOKIE_NAME');
  map(flattened, env, 'archinsight.auth.ghost.ssr-secret-key', 'ARCHINSIGHT_AUTH_GHOST_SSR_SECRET_KEY');
  map(flattened, env, 'archinsight.auth.login-url', 'ARCHINSIGHT_AUTH_LOGIN_URL');
  map(flattened, env, 'archinsight.auth.logout-url', 'ARCHINSIGHT_AUTH_LOGOUT_URL');
  map(flattened, env, 'archinsight.auth.token.secret', 'ARCHINSIGHT_AUTH_TOKEN_SECRET');
  map(flattened, env, 'archinsight.auth.token.issuer', 'ARCHINSIGHT_AUTH_TOKEN_ISSUER');
  map(flattened, env, 'archinsight.auth.token.audience', 'ARCHINSIGHT_AUTH_TOKEN_AUDIENCE');
  map(flattened, env, 'archinsight.auth.token.cookie-name', 'ARCHINSIGHT_AUTH_TOKEN_COOKIE_NAME');
  map(flattened, env, 'archinsight.auth.token.ttl-minutes', 'ARCHINSIGHT_AUTH_TOKEN_TTL_MINUTES');
  map(flattened, env, 'archinsight.auth.cookie.secure', 'ARCHINSIGHT_AUTH_COOKIE_SECURE');
  map(flattened, env, 'archinsight.auth.standalone.sync-api-token', 'ARCHINSIGHT_AUTH_STANDALONE_SYNC_API_TOKEN');
  map(flattened, env, 'archinsight.auth.oidc.providers', 'ARCHINSIGHT_AUTH_OIDC_PROVIDERS');
  map(flattened, env, 'archinsight.auth.oidc.state-cookie-prefix', 'ARCHINSIGHT_AUTH_OIDC_STATE_COOKIE_PREFIX');
  map(flattened, env, 'archinsight.auth.oidc.state-ttl-seconds', 'ARCHINSIGHT_AUTH_OIDC_STATE_TTL_SECONDS');
  map(flattened, env, 'archinsight.auth.oidc.callback-base-url', 'ARCHINSIGHT_AUTH_OIDC_CALLBACK_BASE_URL');

  mapOidcProvider(flattened, env, 'google');

  map(flattened, env, 'archinsight.database.enabled', 'ARCHINSIGHT_DATABASE_ENABLED');
  map(flattened, env, 'archinsight.database.maximum-pool-size', 'ARCHINSIGHT_DATABASE_MAX_CONNECTIONS');
  map(flattened, env, 'archinsight.database.password', 'ARCHINSIGHT_DATABASE_PASSWORD');
  map(flattened, env, 'archinsight.database.username', 'ARCHINSIGHT_DATABASE_USER');
  mapJdbcUrl(flattened, env);
  if (env.ARCHINSIGHT_DATABASE_ENABLED === 'true') {
    env.ARCHINSIGHT_REPOSITORY_BACKEND ??= 'postgres';
  }

  map(flattened, env, 'archinsight.limits.max-file-bytes', 'ARCHINSIGHT_LIMITS_MAX_FILE_BYTES');
  map(flattened, env, 'archinsight.limits.max-overlays', 'ARCHINSIGHT_LIMITS_MAX_OVERLAYS');
  map(flattened, env, 'archinsight.limits.max-overlay-bytes', 'ARCHINSIGHT_LIMITS_MAX_OVERLAY_BYTES');
  map(flattened, env, 'archinsight.limits.max-query-chars', 'ARCHINSIGHT_LIMITS_MAX_QUERY_CHARS');
  map(flattened, env, 'archinsight.limits.max-render-count', 'ARCHINSIGHT_LIMITS_MAX_RENDER_COUNT');
  map(flattened, env, 'archinsight.limits.max-dot-bytes', 'ARCHINSIGHT_LIMITS_MAX_DOT_BYTES');

  map(flattened, env, 'archinsight.analysis-cache.max-entries', 'ARCHINSIGHT_ANALYSIS_CACHE_MAX_ENTRIES');
  map(flattened, env, 'archinsight.analysis-cache.ttl-seconds', 'ARCHINSIGHT_ANALYSIS_CACHE_TTL_SECONDS');
  map(flattened, env, 'archinsight.analysis-cache.max-entry-source-bytes', 'ARCHINSIGHT_ANALYSIS_CACHE_MAX_ENTRY_SOURCE_BYTES');
  map(flattened, env, 'archinsight.analysis-cache.max-total-source-bytes', 'ARCHINSIGHT_ANALYSIS_CACHE_MAX_TOTAL_SOURCE_BYTES');

  return stripUnset(env);
}

function map(flattened: Record<string, string>, env: EnvSource, source: string, target: string): void {
  const value = normalizedValue(flattened[source]);
  if (value != null) {
    env[target] = value;
  }
}

function mapOidcProvider(flattened: Record<string, string>, env: EnvSource, provider: string): void {
  const prefix = `ARCHINSIGHT_AUTH_OIDC_${provider.toUpperCase()}_`;
  map(flattened, env, `archinsight.auth.oidc.${provider}.client-id`, `${prefix}CLIENT_ID`);
  map(flattened, env, `archinsight.auth.oidc.${provider}.client-secret`, `${prefix}CLIENT_SECRET`);
  map(flattened, env, `archinsight.auth.oidc.${provider}.redirect-uri`, `${prefix}REDIRECT_URI`);
}

function mapJdbcUrl(flattened: Record<string, string>, env: EnvSource): void {
  const jdbcUrl = normalizedValue(flattened['archinsight.database.jdbc-url']);
  if (!jdbcUrl) {
    return;
  }
  const match = /^jdbc:postgresql:\/\/([^/:]+)(?::(\d+))?\/([^?]+)(?:\?.*)?$/u.exec(jdbcUrl);
  if (!match) {
    env.ARCHINSIGHT_DATABASE_URL = jdbcUrl;
    return;
  }
  env.ARCHINSIGHT_DATABASE_HOST = match[1];
  env.ARCHINSIGHT_DATABASE_PORT = match[2] ?? '5432';
  env.ARCHINSIGHT_DATABASE_NAME = decodeURIComponent(match[3]);
}

function stripUnset(env: EnvSource): EnvSource {
  return Object.fromEntries(Object.entries(env).filter(([, value]) => normalizedValue(value) != null));
}

function normalizedValue(value: string | undefined): string | null {
  if (value == null || value.trim() === '' || value === '__unset__') {
    return null;
  }
  return value.trim();
}

function flatten(value: unknown, prefix = ''): Record<string, string> {
  if (!isRecord(value)) {
    return prefix ? { [prefix]: String(value) } : {};
  }
  const result: Record<string, string> = {};
  for (const [key, child] of Object.entries(value)) {
    Object.assign(result, flatten(child, prefix ? `${prefix}.${key}` : key));
  }
  return result;
}

function parseSimpleYaml(text: string): Record<string, unknown> {
  const root: Record<string, unknown> = {};
  const stack: Array<{ indent: number; value: Record<string, unknown> }> = [{ indent: -1, value: root }];

  for (const rawLine of text.split(/\r?\n/u)) {
    const line = rawLine.replace(/\s+#.*$/u, '');
    if (line.trim() === '') {
      continue;
    }
    const indent = line.match(/^ */u)?.[0].length ?? 0;
    const match = /^ *([^:]+):(.*)$/u.exec(line);
    if (!match) {
      continue;
    }
    while (stack.length > 1 && indent <= stack[stack.length - 1].indent) {
      stack.pop();
    }
    const key = unquote(match[1].trim());
    const value = match[2].trim();
    const parent = stack[stack.length - 1].value;
    if (value === '') {
      const child: Record<string, unknown> = {};
      parent[key] = child;
      stack.push({ indent, value: child });
    } else {
      parent[key] = unquote(value);
    }
  }

  return root;
}

function unquote(value: string): string {
  if ((value.startsWith("'") && value.endsWith("'")) || (value.startsWith('"') && value.endsWith('"'))) {
    return value.slice(1, -1);
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value != null && !Array.isArray(value);
}
