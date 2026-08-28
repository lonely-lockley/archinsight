import { describe, expect, it } from 'vitest';
import { linkForStoredSources } from './language-pipeline';

describe('language error reporting', () => {
  it('returns source diagnostics without attempting to render an invalid link result', async () => {
    const response = await linkForStoredSources(
      { NODE_ENV: 'test' },
      'error-reporting-project',
      new Map([
        ['main.ai', `
context demo

system app
    name = App
    links:
        ->
`]
      ]),
      {
        openSourceIdentities: ['main.ai'],
        overlays: {},
        view: 'c1'
      }
    );

    expect(response.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: 'main.ai', level: 'ERROR', category: 'SOURCE' })
    ]));
    expect(response.diagnostics).not.toContainEqual(expect.objectContaining({ code: 'RENDER_FAILED' }));
    expect(response.renders).toEqual([]);
  });
});
