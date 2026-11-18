import { describe, expect, it } from 'vitest';
import { technologyIconEdit, technologyIconQuery } from '@archinsight/workbench/technology-icon-picker-model';

describe('technology icon picker model', () => {
  it('replaces an existing icon value as one text edit', () => {
    const source = 'context test\n\n@icon(postgresql)\nsystem app\n';
    const offset = source.indexOf('postgresql') + 4;
    expect(technologyIconQuery(source, offset)).toBe('postgresql');
    const edit = technologyIconEdit(source, offset, 'java');
    expect(source.slice(0, edit.start) + edit.text + source.slice(edit.end))
      .toBe('context test\n\n@icon(java)\nsystem app\n');
  });

  it('inserts an annotation before the active declaration with its indentation', () => {
    const source = 'context test\n\nsystem app\n    service api\n';
    const offset = source.indexOf('service');
    const edit = technologyIconEdit(source, offset, 'quarkus');
    expect(source.slice(0, edit.start) + edit.text + source.slice(edit.end))
      .toBe('context test\n\nsystem app\n    @icon(quarkus)\n    service api\n');
    expect(technologyIconQuery(source, -100)).toBe('');
  });
});
