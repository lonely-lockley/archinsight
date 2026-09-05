import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const sourceRoot = resolve(process.cwd(), 'src');

describe('server composition architecture', () => {
  it('binds the initialized composition root to every SvelteKit request', () => {
    const hooks = source('hooks.server.ts');

    expect(hooks).toContain('initializeApplicationServices()');
    expect(hooks).toContain('event.locals.services = applicationServices()');
    expect(hooks).toContain("process.once('sveltekit:shutdown'");
  });

  it('does not restore feature-level process-global service locators', () => {
    expect(source('lib/server/database/postgres-database.ts')).not.toMatch(/\bconst pools\b/u);
    expect(source('lib/server/repository/repository-file-system.ts')).not.toMatch(
      /setRepositoryFileSystem|postgresFileSystems/u
    );
    expect(source('lib/server/publication/playground-publication-store.ts')).not.toMatch(
      /setPlaygroundPublicationStore|postgresStores/u
    );
    expect(source('lib/server/language/project-analysis-cache.ts')).not.toMatch(
      /export const projectAnalysisCache|resetProjectAnalysisCache/u
    );
  });
});

function source(path: string): string {
  return readFileSync(resolve(sourceRoot, path), 'utf8');
}
