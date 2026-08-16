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
- `ARCHINSIGHT_RUNTIME_PROFILE=all|editor|playground` restricts the HTTP surface
  exposed by a deployment. Use `all` only for local development.
- `ARCHINSIGHT_AUTH_TOKEN_SECRET=...` configures the persistent session-signing
  secret and is required in production, Postgres, and OIDC modes.
- `ARCHINSIGHT_AUTH_DEV_LOGIN_ENABLED=true` enables the development login route.
- `ARCHINSIGHT_AUTH_OIDC_*` configures OIDC providers.
- `ARCHINSIGHT_LIMITS_*` controls request size and render limits.

The server also accepts legacy `local/application.yaml` files through
`src/lib/server/config/local-config.ts`. Keep local files out of git.

## HTTP API

API routes live under `src/routes/api/`:

- `auth/` - current user, logout, development login, OIDC, Ghost sync, standalone token sync.
- `projects/` - project listing, files, folders, tree, structure, symbols, link, and SVG rendering.
- `playground/` - anonymous read/link/render API for the single published project; it exposes no mutations.
- `admin/playground/publication/` - publication management restricted to `playground_admin`.
- `health/` - health check endpoint.

Core server adapters live under `src/lib/server/`:

- `auth/` - auth config, token handling, OIDC, Ghost, and user data.
- `database/` - Postgres config, migrations, and query wrapper.
- `repository/` - in-memory and Postgres repository file systems.
- `language/` - web API pipeline over `@insight/language`.
- `render/` - server-side SVG rendering adapter.
- `security/` - request size and query limits.
- `publication/` - publication persistence and the restricted playground read model.

## Editor and playground deployments

Production can run the same image twice against one database:

- editor: `ARCHINSIGHT_RUNTIME_PROFILE=editor`, authenticated application credentials;
- playground: `ARCHINSIGHT_RUNTIME_PROFILE=playground`, the restricted
  `archinsight_playground` database role from `database/playground-role.sql`.

Run migrations once with a separate database owner/migration job and disable
migrations in both application deployments. Create the playground LOGIN role and
grant database `CONNECT` through deployment secret management, then run
`database/playground-role.sql` as the database owner. The playground role can select only
`public.playground_current_repository` and `public.playground_current_file`; it has no access
to private repositories or user data.

`playground_admin` is additive and grants only `publication:manage`. Grant it to
an existing user by stable id:

```sql
insert into public.userdata_role (user_id, role, granted_by)
values ('<user-id>', 'playground_admin', '<user-id>')
on conflict (user_id, role) do nothing;
```

The editor shows the publication checkbox only for this capability. All
repository mutations remain owner-scoped. In playground, mutation controls are
visible but disabled; publication management is disabled and hidden. Both
states are derived from the typed action catalog in `src/lib/actions/` and are
enforced independently by the backend.

## Checks

```shell
npm --prefix archinsight-web run check
npm --prefix archinsight-web run test:server
npm --prefix archinsight-web run test:security
npm --prefix archinsight-web run test:postgres
```

`test:postgres` runs the real-database concurrency and publication ownership/read-model tests. It uses
`ARCHINSIGHT_TEST_DATABASE_URL` when set, otherwise `ARCHINSIGHT_DATABASE_URL`.

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

## License

Copyright 2021-2026 Alexey Zaytsev

Licensed under the Apache License, Version 2.0. See [LICENSE](../LICENSE).
