import { describe, expect, it } from 'vitest';
import {
  ContractValidationError,
  parseLinkRequest,
  parseWorkbenchHostToWebviewMessage,
  parseWorkbenchWebviewToHostMessage
} from '@archinsight/contracts';

describe('shared transport contracts', () => {
  it('normalizes a valid HTTP link request', () => {
    expect(parseLinkRequest({ view: 'c2', overlays: { 'main.ai': 'context demo' }, query: null })).toEqual({
      openSourceIdentities: undefined,
      overlays: { 'main.ai': 'context demo' },
      query: null,
      view: 'c2',
      environment: undefined
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

  it('accepts a complete declaration navigation message', () => {
    expect(parseWorkbenchWebviewToHostMessage({
      command: 'openDeclaration',
      declaration: { source: 'main.ai', line: 4, column: 8 }
    })).toEqual({
      command: 'openDeclaration',
      declaration: { source: 'main.ai', line: 4, column: 8 }
    });
  });

  it('validates structured completion documentation from the extension host', () => {
    expect(parseWorkbenchHostToWebviewMessage({
      command: 'completionResult',
      requestId: 3,
      items: [{
        label: 'Application',
        kind: 'TYPE',
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
