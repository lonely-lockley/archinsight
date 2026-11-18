import { describe, expect, it } from 'vitest';
import {
  ContractValidationError,
  parseLinkRequest,
  parseLinkResponse,
  parseSvgRenderRequest,
  parseWorkbenchHostToWebviewMessage,
  parseWorkbenchWebviewToHostMessage
} from '@archinsight/contracts';
import { coreLanguageSnapshot } from '@insight/language';

describe('shared transport contracts', () => {
  it('normalizes a valid HTTP link request', () => {
    expect(parseLinkRequest({ view: 'c2', overlays: { 'main.ai': 'context demo' }, query: null, theme: 'light' })).toEqual({
      openSourceIdentities: undefined,
      overlays: { 'main.ai': 'context demo' },
      query: null,
      view: 'c2',
      environment: undefined,
      theme: 'light'
    });
    expect(parseLinkRequest({ forceFullAnalysis: true })).toEqual({
      openSourceIdentities: undefined,
      overlays: undefined,
      query: undefined,
      view: undefined,
      environment: undefined,
      forceFullAnalysis: true
    });
  });

  it('rejects malformed HTTP and webview payloads', () => {
    expect(() => parseLinkRequest({ view: 'unknown' })).toThrow(ContractValidationError);
    expect(() => parseLinkRequest({ forceFullAnalysis: 'yes' })).toThrow(ContractValidationError);
    expect(() => parseLinkRequest({ theme: 'system' })).toThrow(ContractValidationError);
    expect(() => parseWorkbenchWebviewToHostMessage({ command: 'complete', requestId: '1' }))
      .toThrow(ContractValidationError);
    expect(() => parseWorkbenchHostToWebviewMessage({ command: 'preview', state: { view: 'c1' } }))
      .toThrow(ContractValidationError);
    expect(() => parseWorkbenchHostToWebviewMessage({
      command: 'diagnostics',
      diagnostics: [{ sourceName: 'main.ai', message: 42 }]
    })).toThrow(ContractValidationError);
    expect(() => parseWorkbenchHostToWebviewMessage({
      command: 'completionResult', requestId: 1, items: [{ label: 'system', kind: 'UNKNOWN' }]
    })).toThrow(ContractValidationError);
  });

  it('rejects non-text completion types', () => {
    expect(() => parseWorkbenchHostToWebviewMessage({
      command: 'completionResult', requestId: 1, items: [{ label: 'entry', kind: 'IDENTIFIER', typeName: 42 }]
    })).toThrow(ContractValidationError);
  });

  it('preserves the shared icon placement sidecar in render transports', () => {
    const render = {
      sourceIdentity: 'main.ai', diagram: 'query', dot: 'digraph {}',
      icons: [{ slotId: 'icon-slot-1', iconId: 'postgresql', color: '#f4f4f4' }]
    };
    expect(parseSvgRenderRequest({ renders: [render] })).toEqual({ renders: [render] });
    const response = {
      revision: '1', analysis: { mode: 'full', relinkedSources: 1 }, symbols: coreLanguageSnapshot,
      linkedModel: { contexts: [], elements: [], edges: [], graph: { nodes: [], relations: [] } },
      diagnostics: [], renders: [render], structure: { schemaVersion: 'project-structure.v1', contexts: [] }
    };
    expect(parseLinkResponse(response).renders).toEqual([render]);
    expect(() => parseSvgRenderRequest({ renders: [{ ...render, icons: [{ ...render.icons[0], color: 42 }] }] }))
      .toThrow(ContractValidationError);
  });

  it('preserves completion icon metadata and incomplete state', () => {
    expect(parseWorkbenchHostToWebviewMessage({
      command: 'completionResult', requestId: 1, isIncomplete: true,
      items: [{ label: 'postgresql', kind: 'ENUM_VALUE', iconId: 'postgresql' }]
    })).toMatchObject({ isIncomplete: true, items: [{ iconId: 'postgresql' }] });
  });

  it('accepts a complete declaration navigation message', () => {
    expect(parseWorkbenchWebviewToHostMessage({
      command: 'openDeclaration',
      declaration: { source: 'main.ai', line: 4, column: 8 }
    })).toEqual({
      command: 'openDeclaration',
      declaration: { source: 'main.ai', line: 4, column: 8 }
    });
  });

  it('validates diagram quick-action messages and state', () => {
    expect(parseWorkbenchWebviewToHostMessage({
      command: 'diagramQuickAction', action: 'drill-down', elementId: 'shop/api'
    })).toEqual({ command: 'diagramQuickAction', action: 'drill-down', elementId: 'shop/api' });
    expect(parseWorkbenchWebviewToHostMessage({
      command: 'diagramQuickAction', action: 'isolate', elementId: 'shop/api'
    })).toEqual({ command: 'diagramQuickAction', action: 'isolate', elementId: 'shop/api' });
    expect(parseWorkbenchWebviewToHostMessage({
      command: 'selectPathTarget', elementId: 'shop/db'
    })).toEqual({ command: 'selectPathTarget', elementId: 'shop/db' });
    expect(parseWorkbenchWebviewToHostMessage({ command: 'reverseFindPath' }))
      .toEqual({ command: 'reverseFindPath' });
    expect(parseWorkbenchWebviewToHostMessage({ command: 'backQuickAction' }))
      .toEqual({ command: 'backQuickAction' });
    expect(parseWorkbenchWebviewToHostMessage({ command: 'closeQuickActions' }))
      .toEqual({ command: 'closeQuickActions' });
    expect(() => parseWorkbenchWebviewToHostMessage({ command: 'closeIsolate' }))
      .toThrow("Unknown webview command 'closeIsolate'");
    expect(parseWorkbenchWebviewToHostMessage({
      command: 'diagramQuickAction', action: 'diff', elementId: 'shop/api'
    })).toEqual({ command: 'diagramQuickAction', action: 'diff', elementId: 'shop/api' });
    expect(parseWorkbenchWebviewToHostMessage({
      command: 'compareDiagramDiff', before: 'abc', after: 'def', elementId: 'shop/api'
    })).toEqual({ command: 'compareDiagramDiff', before: 'abc', after: 'def', elementId: 'shop/api' });
    expect(parseWorkbenchHostToWebviewMessage({
      command: 'diagramDiffMode',
      state: {
        status: 'showing-diff', before: 'abc', after: 'def', beforeShort: 'abc', afterShort: 'HEAD',
        currentRevision: 'def', selectedElementId: 'shop/api'
      }
    })).toMatchObject({ state: { status: 'showing-diff', afterShort: 'HEAD' } });
    expect(parseWorkbenchHostToWebviewMessage({
      command: 'findPathMode',
      state: {
        status: 'showing-path', sourceId: 'shop/api', sourceTitle: 'API',
        targetId: 'shop/db', targetTitle: 'Database'
      }
    })).toMatchObject({ state: { status: 'showing-path', targetId: 'shop/db' } });
    expect(parseWorkbenchHostToWebviewMessage({
      command: 'isolateMode',
      state: { status: 'showing-isolate', elementId: 'shop/api', elementTitle: 'API' }
    })).toMatchObject({ state: { status: 'showing-isolate', elementId: 'shop/api' } });
    expect(parseWorkbenchHostToWebviewMessage({
      command: 'isolateMode',
      state: { status: 'showing-drill-down', elementId: 'shop/api', elementTitle: 'API' }
    })).toMatchObject({ state: { status: 'showing-drill-down', elementId: 'shop/api' } });
    expect(parseWorkbenchHostToWebviewMessage({
      command: 'deploymentMode',
      state: {
        status: 'showing-deployment', elementId: 'shop/api', elementTitle: 'API',
        environment: 'eu', focusElementIds: ['shop/api']
      }
    })).toMatchObject({ state: { status: 'showing-deployment', environment: 'eu' } });
    expect(() => parseWorkbenchWebviewToHostMessage({
      command: 'diagramQuickAction', action: 'impact', elementId: 'shop/api'
    })).toThrow(ContractValidationError);
    expect(() => parseWorkbenchHostToWebviewMessage({
      command: 'findPathMode', state: { status: 'selecting-target', sourceId: 42, sourceTitle: 'API' }
    })).toThrow(ContractValidationError);
    expect(() => parseWorkbenchHostToWebviewMessage({
      command: 'deploymentMode',
      state: {
        status: 'showing-deployment', elementId: 'shop/api', elementTitle: 'API',
        environment: 'eu', focusElementIds: [42]
      }
    })).toThrow(ContractValidationError);
    expect(() => parseWorkbenchHostToWebviewMessage({
      command: 'preview',
      state: {
        view: 'c2', query: '', sourceName: 'model.ai', fileName: 'model.ai', source: '',
        quickActionMetadata: {
          'shop/api': {
            elementId: 'shop/api', canonicalElementId: 'shop/api', title: 'API',
            hasChildren: 'yes', hasDeployment: false, isolateEligible: true, pathEligible: true
          }
        }
      }
    })).toThrow(ContractValidationError);
  });

  it('validates AIQ built-in variable scope messages', () => {
    expect(parseWorkbenchWebviewToHostMessage({
      command: 'selectQueryScope', variable: 'context', value: 'archinsight'
    })).toEqual({ command: 'selectQueryScope', variable: 'context', value: 'archinsight' });
    expect(parseWorkbenchHostToWebviewMessage({
      command: 'queryScope',
      state: {
        enabled: true,
        context: 'archinsight',
        sources: [{ value: 'main.ai', label: 'main.ai', typeName: 'Context' }],
        contexts: [{ value: 'archinsight', label: 'archinsight', typeName: 'Context' }]
      }
    })).toMatchObject({ state: { context: 'archinsight' } });
    expect(() => parseWorkbenchWebviewToHostMessage({
      command: 'selectQueryScope', variable: 'source', value: 'main.ai'
    })).toThrow(ContractValidationError);
    expect(() => parseWorkbenchHostToWebviewMessage({
      command: 'queryScope', state: { enabled: true, sources: [{}], contexts: [] }
    })).toThrow(ContractValidationError);
  });

  it('validates structured completion documentation from the extension host', () => {
    expect(parseWorkbenchHostToWebviewMessage({
      command: 'completionResult',
      requestId: 3,
      items: [{
        label: 'Application',
        kind: 'TYPE',
        typeName: 'Application',
        documentation: {
          header: 'Application',
          type: {
            abstract: true,
            baseType: 'SystemElement',
            constructors: [{ spelling: 'service', ownerType: 'ServiceApplication' }]
          }
        }
      }]
    })).toMatchObject({
      items: [{
        typeName: 'Application',
        documentation: {
          type: {
            constructors: [{ spelling: 'service', ownerType: 'ServiceApplication' }]
          }
        }
      }]
    });
    expect(() => parseWorkbenchHostToWebviewMessage({
      command: 'completionResult',
      requestId: 3,
      items: [{
        label: 'Application',
        kind: 'TYPE',
        documentation: { type: { abstract: 'yes', constructors: [] } }
      }]
    })).toThrow(ContractValidationError);
  });
});
