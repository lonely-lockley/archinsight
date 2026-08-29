import { describe, expect, it } from 'vitest';
import { discoverDeploymentEnvironments } from '@insight/language';
import { ProjectAnalysisCache } from './project-analysis-cache';

const env = { NODE_ENV: 'test' };

describe('project analysis cache source additions', () => {
  it('relinks an existing source when a new environment satisfies its unresolved deployment reference', async () => {
    const cache = new ProjectAnalysisCache();
    const key = 'owner:a\0project:deployment';
    const initial = new Map([
      ['definitions.ai', `extend type Environment
    Compute compute
`],
      ['eu.ai', environment('eu')],
      ['application.ai', `context application

deploymentProfile regional
    appliesTo:
        production from eu
        production from sa

    runsOn compute

system storefront
    name = Storefront

    service api
        name = API
        deployment:
            uses regional
`]
    ]);

    const missing = await cache.analyze(key, initial, {}, env);
    expect(missing.result.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'UNDECLARED_IDENTIFIER',
        message: expect.stringContaining("context 'sa'")
      })
    ]));

    const completed = new Map(initial);
    completed.set('sa.ai', environment('sa'));
    const incremental = await cache.analyze(key, completed, {}, env);
    const profile = incremental.result.elements.find((element) => element.id === 'application/regional');

    expect(incremental.mode).toBe('incremental');
    expect(incremental.result.diagnostics.filter((diagnostic) => (diagnostic.level ?? 'ERROR') === 'ERROR')).toEqual([]);
    expect(profile?.attributes.appliesTo).toEqual(['eu/production', 'sa/production']);
    expect(discoverDeploymentEnvironments(incremental.result, {
      context: 'application',
      tab: 'application.ai'
    })).toEqual([
      { id: 'eu', name: 'EU environment' },
      { id: 'sa', name: 'SA environment' }
    ]);
  });
});

function environment(id: string): string {
  return `environment ${id}
    name = ${id.toUpperCase()} environment

deployment production
    compute:
        compute compute
            name = Compute
`;
}
