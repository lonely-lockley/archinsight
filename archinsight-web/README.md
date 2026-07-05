# Archinsight Web

SvelteKit web editor for Insight architecture models.

The web app owns hosted repository state, authentication, HTTP APIs, Monaco
integration, browser rendering, and the editor workspace UI. It embeds
`@insight/language` for parsing, linking, diagnostics, queries, completion data,
and Graphviz DOT generation.

## Run Locally

```shell
npm --prefix archinsight-web install
npm --prefix archinsight-web run dev
```

Vite serves the app on port `5173` by default.

## Configuration

Runtime configuration comes from environment variables. Start from:

```text
archinsight-web/env.example
```

Common local settings:

- `ARCHINSIGHT_REPOSITORY_BACKEND=postgres` enables the Postgres repository backend.
- `ARCHINSIGHT_DATABASE_URL=postgres://...` configures the database connection.
- `ARCHINSIGHT_DATABASE_MIGRATIONS_ENABLED=true` runs built-in migrations.
- `ARCHINSIGHT_AUTH_DEV_LOGIN_ENABLED=true` enables the development login route.
- `ARCHINSIGHT_AUTH_OIDC_*` configures OIDC providers.
- `ARCHINSIGHT_LIMITS_*` controls request size and render limits.

The server also accepts legacy `local/application.yaml` files through
`src/lib/server/config/local-config.ts`. Keep local files out of git.

## HTTP API

API routes live under `src/routes/api/`:

- `auth/` - current user, logout, development login, OIDC, Ghost sync, standalone token sync.
- `projects/` - project listing, files, folders, tree, structure, symbols, link, and SVG rendering.
- `health/` - health check endpoint.

Core server adapters live under `src/lib/server/`:

- `auth/` - auth config, token handling, OIDC, Ghost, and user data.
- `database/` - Postgres config, migrations, and query wrapper.
- `repository/` - in-memory and Postgres repository file systems.
- `language/` - web API pipeline over `@insight/language`.
- `render/` - server-side SVG rendering adapter.
- `security/` - request size and query limits.

## Checks

```shell
npm --prefix archinsight-web run check
npm --prefix archinsight-web run test:server
npm --prefix archinsight-web run test:security
```

Gradle also exposes:

```shell
./gradlew :archinsight-web:npmBuild
./gradlew :archinsight-web:npmCheck
```

## Boundaries

Keep language semantics in `packages/insight-language`. Web code may translate
language results into HTTP DTOs, Monaco markers, Svelte state, repository
overlays, or browser-rendered SVG, but it should not duplicate parser/linker
rules.
