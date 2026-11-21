import { describe, expect, it } from 'vitest';
import {
  coreSourceNotice,
  deploymentEnvironmentNotice,
  emptyDiagramNotice,
  emptyProjectionNotice,
  linkerErrorNotice,
  queryErrorNotice,
  queryScopeNotice,
  renderErrorNotice
} from '@archinsight/workbench/diagram-notice';

describe('diagram notices', () => {
  it.each([
    ['c1', 'C1 diagram is empty', 'system-level'],
    ['c2', 'C2 diagram is empty', 'container-level'],
    ['c3', 'C3 diagram is empty', 'component-level'],
    ['c4', 'C4 diagram is empty', 'code-level'],
    ['deployment-system', 'D1 diagram is empty', 'system deployment'],
    ['deployment', 'Deployment diagram is empty', 'deployment elements'],
    ['default', 'Diagram is empty', 'current context']
  ] as const)('describes an empty %s view without suggesting an action', (mode, title, detail) => {
    const notice = emptyDiagramNotice(mode, false);
    expect(notice).toMatchObject({ kind: 'empty', title });
    expect(notice.detail).toContain(detail);
  });

  it('describes D2 with and without a selected environment', () => {
    expect(emptyDiagramNotice('deployment-container', false).detail).toContain('container deployment view');
    expect(emptyDiagramNotice('deployment-container', false, 'eu').detail).toBe(
      'The eu environment contains no deployment elements from the current source.'
    );
  });

  it('describes empty custom queries independently of the selected view', () => {
    expect(emptyDiagramNotice('c4', true)).toEqual({
      kind: 'empty',
      title: 'Query result is empty',
      detail: 'The query completed successfully and returned no visible elements.'
    });
  });

  it('provides factual terminal explanations without action labels', () => {
    const notices = [
      queryScopeNotice(), deploymentEnvironmentNotice(), coreSourceNotice(), linkerErrorNotice(),
      queryErrorNotice(), renderErrorNotice(), emptyProjectionNotice()
    ];
    expect(notices.map((notice) => notice.kind)).toEqual([
      'waiting', 'empty', 'unavailable', 'unavailable', 'unavailable', 'unavailable', 'empty'
    ]);
    for (const notice of notices) {
      expect(notice.title.length).toBeGreaterThan(0);
      expect(notice.detail.length).toBeGreaterThan(0);
      expect(`${notice.title} ${notice.detail}`).not.toMatch(/\b(try|choose|select|fix|open|save|retry|show)\b/i);
    }
  });
});
