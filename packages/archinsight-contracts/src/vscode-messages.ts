import {
  isBuiltinDiagramView,
  type BuiltinDiagramView,
  type CompletionDocumentation,
  type CompletionKind,
  type DiagramQuickActionMetadata,
  type LanguageSnapshot,
  type QueryParameterValue,
  type QueryTableResult
} from '@insight/language';
import { ContractValidationError, array, boolean, number, record, string } from './validation.js';

const COMPLETION_KINDS = new Set<CompletionKind>([
  'KEYWORD', 'TYPE', 'CONSTRUCTOR', 'OPERATOR', 'ATTRIBUTE',
  'IDENTIFIER', 'ENUM_VALUE', 'ANNOTATION', 'NEWLINE'
]);

export type WebviewDiagnostic = {
  sourceName: string;
  line?: number;
  column?: number;
  endLine?: number;
  endColumn?: number;
  level?: string;
  code?: string;
  message: string;
};

export type WebviewCompletionItem = {
  label: string;
  insertText?: string;
  kind: CompletionKind;
  typeName?: string;
  imported?: boolean;
  documentation?: CompletionDocumentation;
};

export type WebviewQueryScopeChoice = {
  value: string;
  label: string;
  typeName?: string;
};

export type WebviewQueryScopeState = {
  readonly enabled: boolean;
  readonly tab?: string;
  readonly context?: string;
  readonly sources: readonly WebviewQueryScopeChoice[];
  readonly contexts: readonly WebviewQueryScopeChoice[];
};

export type WebviewPreviewState = {
  view: BuiltinDiagramView;
  query: string;
  environment?: string;
  contextId?: string;
  sourceName: string;
  fileName: string;
  source: string;
  svg?: string;
  dot?: string;
  error?: string;
  queryResult?: QueryTableResult;
  parameters?: Readonly<Record<string, QueryParameterValue>>;
  quickActionMetadata?: DiagramQuickActionMetadata;
};

export type WebviewFindPathMode =
  | { status: 'idle' }
  | {
      status: 'selecting-target';
      sourceId: string;
      sourceTitle: string;
    }
  | { status: 'resolving-path'; sourceId: string; sourceTitle: string; targetId: string; targetTitle: string }
  | { status: 'showing-path'; sourceId: string; sourceTitle: string; targetId: string; targetTitle: string };

export type WebviewIsolateMode =
  | { status: 'idle' }
  | { status: 'showing-isolate'; elementId: string; elementTitle: string };

export type ControlsWebviewToHostMessage =
  | { command: 'ready' }
  | { command: 'render'; view: BuiltinDiagramView; query: string }
  | { command: 'clipboardRead'; requestId: number }
  | { command: 'clipboardWrite'; text: string };

export type ControlsHostToWebviewMessage =
  | { command: 'state'; view?: BuiltinDiagramView; query?: string; readOnly?: boolean; focusQuery?: boolean }
  | { command: 'clipboardText'; requestId: number; text: string };

export type WorkbenchWebviewToHostMessage =
  | { command: 'ready' }
  | { command: 'cancel' }
  | { command: 'sourceChanged'; source: string }
  | { command: 'selectQueryScope'; variable: 'tab' | 'context'; value: string }
  | { command: 'render'; view: BuiltinDiagramView; query: string; parameters?: Readonly<Record<string, QueryParameterValue>> }
  | { command: 'selectDeploymentEnvironment' }
  | { command: 'refresh' }
  | { command: 'download'; kind: 'source' | 'svg' | 'png' | 'dot' | 'csv' | 'json' }
  | { command: 'editQuery'; view: BuiltinDiagramView; query: string }
  | { command: 'png'; dataUrl: string }
  | { command: 'complete'; requestId: number; sourceName: string; source: string; cursorOffset: number }
  | { command: 'clipboardRead'; requestId: number }
  | { command: 'clipboardWrite'; text: string }
  | { command: 'diagramQuickAction'; action: 'isolate' | 'show-deployment' | 'go-to-declaration' | 'find-path'; elementId: string }
  | { command: 'selectPathTarget'; elementId: string }
  | { command: 'reverseFindPath' }
  | { command: 'cancelFindPath' }
  | { command: 'cancelIsolate' }
  | { command: 'openDeclaration'; declaration: { source: string; line: number; column: number } };

export type WorkbenchHostToWebviewMessage =
  | {
    command: 'source'; source: string; sourceName: string; fileName: string; view: BuiltinDiagramView; query: string;
    environment?: string; parameters?: Readonly<Record<string, QueryParameterValue>>; diagnostics?: WebviewDiagnostic[]; symbols?: LanguageSnapshot; readOnly?: boolean;
    queries?: Readonly<Record<BuiltinDiagramView, string>>; queryScope?: WebviewQueryScopeState;
  }
  | { command: 'query'; view: BuiltinDiagramView; query: string; environment?: string; parameters?: Readonly<Record<string, QueryParameterValue>> }
  | { command: 'preview'; state: WebviewPreviewState }
  | { command: 'diagnostics'; diagnostics: WebviewDiagnostic[] }
  | { command: 'queryScope'; state: WebviewQueryScopeState }
  | { command: 'completionResult'; requestId: number; items: WebviewCompletionItem[]; replacementStartOffset?: number; replacementEndOffset?: number }
  | { command: 'clipboardText'; requestId: number; text: string }
  | { command: 'exportPng'; svg: string }
  | { command: 'findPathMode'; state: WebviewFindPathMode }
  | { command: 'isolateMode'; state: WebviewIsolateMode }
  | { command: 'reveal'; line: number; column: number };

export type PreviewWebviewToHostMessage = { command: 'ready' } | { command: 'png'; dataUrl: string };
export type PreviewHostToWebviewMessage =
  | { command: 'preview'; state: WebviewPreviewState }
  | { command: 'exportPng'; svg: string };

export function parseControlsWebviewToHostMessage(value: unknown): ControlsWebviewToHostMessage {
  const input = commandRecord(value);
  switch (input.command) {
    case 'ready': return { command: 'ready' };
    case 'render': return { command: 'render', view: view(input.view), query: string(input.query, 'query') };
    case 'clipboardRead': return { command: 'clipboardRead', requestId: number(input.requestId, 'requestId') };
    case 'clipboardWrite': return { command: 'clipboardWrite', text: string(input.text, 'text') };
    default: throw unknownCommand(input.command);
  }
}

export function parseControlsHostToWebviewMessage(value: unknown): ControlsHostToWebviewMessage {
  const input = commandRecord(value);
  if (input.command === 'clipboardText') {
    return { command: 'clipboardText', requestId: number(input.requestId, 'requestId'), text: string(input.text, 'text') };
  }
  if (input.command !== 'state') throw unknownCommand(input.command);
  return {
    command: 'state',
    ...(input.view === undefined ? {} : { view: view(input.view) }),
    ...(input.query === undefined ? {} : { query: string(input.query, 'query') }),
    ...(input.readOnly === undefined ? {} : { readOnly: boolean(input.readOnly, 'readOnly') }),
    ...(input.focusQuery === undefined ? {} : { focusQuery: boolean(input.focusQuery, 'focusQuery') })
  };
}

export function parseWorkbenchWebviewToHostMessage(value: unknown): WorkbenchWebviewToHostMessage {
  const input = commandRecord(value);
  switch (input.command) {
    case 'ready': case 'cancel': case 'selectDeploymentEnvironment': case 'refresh':
    case 'reverseFindPath': case 'cancelFindPath': case 'cancelIsolate': return { command: input.command };
    case 'sourceChanged': return { command: 'sourceChanged', source: string(input.source, 'source') };
    case 'selectQueryScope': {
      const variable = string(input.variable, 'variable');
      if (variable !== 'tab' && variable !== 'context') throw new ContractValidationError('query scope variable is invalid');
      return { command: 'selectQueryScope', variable, value: string(input.value, 'value') };
    }
    case 'render': return {
      command: 'render', view: view(input.view), query: string(input.query, 'query'),
      ...(input.parameters === undefined ? {} : { parameters: queryParameters(input.parameters) })
    };
    case 'editQuery': return { command: 'editQuery', view: view(input.view), query: string(input.query, 'query') };
    case 'download': {
      const kind = string(input.kind, 'kind');
      if (!['source', 'svg', 'png', 'dot', 'csv', 'json'].includes(kind)) throw new ContractValidationError('download kind is invalid');
      return { command: 'download', kind: kind as 'source' | 'svg' | 'png' | 'dot' | 'csv' | 'json' };
    }
    case 'png': return { command: 'png', dataUrl: string(input.dataUrl, 'dataUrl') };
    case 'complete': return {
      command: 'complete', requestId: number(input.requestId, 'requestId'), sourceName: string(input.sourceName, 'sourceName'),
      source: string(input.source, 'source'), cursorOffset: number(input.cursorOffset, 'cursorOffset')
    };
    case 'clipboardRead': return { command: 'clipboardRead', requestId: number(input.requestId, 'requestId') };
    case 'clipboardWrite': return { command: 'clipboardWrite', text: string(input.text, 'text') };
    case 'diagramQuickAction': {
      const action = string(input.action, 'action');
      if (!['isolate', 'show-deployment', 'go-to-declaration', 'find-path'].includes(action)) {
        throw new ContractValidationError('diagram quick action is invalid');
      }
      return {
        command: 'diagramQuickAction',
        action: action as 'isolate' | 'show-deployment' | 'go-to-declaration' | 'find-path',
        elementId: string(input.elementId, 'elementId')
      };
    }
    case 'selectPathTarget': return { command: 'selectPathTarget', elementId: string(input.elementId, 'elementId') };
    case 'openDeclaration': {
      const declaration = record(input.declaration, 'declaration');
      return { command: 'openDeclaration', declaration: {
        source: string(declaration.source, 'declaration.source'), line: number(declaration.line, 'declaration.line'),
        column: number(declaration.column, 'declaration.column')
      } };
    }
    default: throw unknownCommand(input.command);
  }
}

export function parseWorkbenchHostToWebviewMessage(value: unknown): WorkbenchHostToWebviewMessage {
  const input = commandRecord(value);
  switch (input.command) {
    case 'source': return {
      command: 'source', source: string(input.source, 'source'), sourceName: string(input.sourceName, 'sourceName'),
      fileName: string(input.fileName, 'fileName'), view: view(input.view), query: string(input.query, 'query'),
      ...(input.environment === undefined ? {} : { environment: string(input.environment, 'environment') }),
      ...(input.parameters === undefined ? {} : { parameters: queryParameters(input.parameters) }),
      ...(input.diagnostics === undefined ? {} : { diagnostics: diagnostics(input.diagnostics, 'diagnostics') }),
      ...(input.symbols === undefined ? {} : { symbols: input.symbols as LanguageSnapshot }),
      ...(input.readOnly === undefined ? {} : { readOnly: boolean(input.readOnly, 'readOnly') }),
      ...(input.queries === undefined ? {} : { queries: queryRecord(input.queries) }),
      ...(input.queryScope === undefined ? {} : { queryScope: queryScopeState(input.queryScope) })
    };
    case 'query': return {
      command: 'query', view: view(input.view), query: string(input.query, 'query'),
      ...(input.environment === undefined ? {} : { environment: string(input.environment, 'environment') }),
      ...(input.parameters === undefined ? {} : { parameters: queryParameters(input.parameters) })
    };
    case 'preview': return { command: 'preview', state: previewState(input.state) };
    case 'diagnostics': return { command: 'diagnostics', diagnostics: diagnostics(input.diagnostics, 'diagnostics') };
    case 'queryScope': return { command: 'queryScope', state: queryScopeState(input.state) };
    case 'completionResult': return {
      command: 'completionResult', requestId: number(input.requestId, 'requestId'), items: completionItems(input.items),
      ...(input.replacementStartOffset === undefined ? {} : { replacementStartOffset: number(input.replacementStartOffset, 'replacementStartOffset') }),
      ...(input.replacementEndOffset === undefined ? {} : { replacementEndOffset: number(input.replacementEndOffset, 'replacementEndOffset') })
    };
    case 'clipboardText': return { command: 'clipboardText', requestId: number(input.requestId, 'requestId'), text: string(input.text, 'text') };
    case 'exportPng': return { command: 'exportPng', svg: string(input.svg, 'svg') };
    case 'findPathMode': return { command: 'findPathMode', state: findPathMode(input.state) };
    case 'isolateMode': return { command: 'isolateMode', state: isolateMode(input.state) };
    case 'reveal': return { command: 'reveal', line: number(input.line, 'line'), column: number(input.column, 'column') };
    default: throw unknownCommand(input.command);
  }
}

function queryScopeState(value: unknown): WebviewQueryScopeState {
  const input = record(value, 'query scope');
  return {
    enabled: boolean(input.enabled, 'query scope.enabled'),
    ...(input.tab === undefined ? {} : { tab: string(input.tab, 'query scope.tab') }),
    ...(input.context === undefined ? {} : { context: string(input.context, 'query scope.context') }),
    sources: queryScopeChoices(input.sources, 'query scope.sources'),
    contexts: queryScopeChoices(input.contexts, 'query scope.contexts')
  };
}

function queryScopeChoices(value: unknown, name: string): WebviewQueryScopeChoice[] {
  return array(value, name).map((item, index) => {
    const input = record(item, `${name}[${index}]`);
    return {
      value: string(input.value, `${name}[${index}].value`),
      label: string(input.label, `${name}[${index}].label`),
      ...(input.typeName === undefined ? {} : { typeName: string(input.typeName, `${name}[${index}].typeName`) })
    };
  });
}

export function parsePreviewWebviewToHostMessage(value: unknown): PreviewWebviewToHostMessage {
  const input = commandRecord(value);
  if (input.command === 'ready') return { command: 'ready' };
  if (input.command === 'png') return { command: 'png', dataUrl: string(input.dataUrl, 'dataUrl') };
  throw unknownCommand(input.command);
}

function previewState(value: unknown): WebviewPreviewState {
  const input = record(value, 'preview state');
  return {
    view: view(input.view), query: string(input.query, 'preview.query'), sourceName: string(input.sourceName, 'preview.sourceName'),
    fileName: string(input.fileName, 'preview.fileName'), source: string(input.source, 'preview.source'),
    ...(input.environment === undefined ? {} : { environment: string(input.environment, 'preview.environment') }),
    ...(input.contextId === undefined ? {} : { contextId: string(input.contextId, 'preview.contextId') }),
    ...(input.svg === undefined ? {} : { svg: string(input.svg, 'preview.svg') }),
    ...(input.dot === undefined ? {} : { dot: string(input.dot, 'preview.dot') }),
    ...(input.error === undefined ? {} : { error: string(input.error, 'preview.error') }),
    ...(input.queryResult === undefined ? {} : { queryResult: queryTableResult(input.queryResult) }),
    ...(input.parameters === undefined ? {} : { parameters: queryParameters(input.parameters) }),
    ...(input.quickActionMetadata === undefined ? {} : { quickActionMetadata: quickActionMetadata(input.quickActionMetadata) })
  };
}

function quickActionMetadata(value: unknown): DiagramQuickActionMetadata {
  const input = record(value, 'preview.quickActionMetadata');
  return Object.fromEntries(Object.entries(input).map(([key, value]) => {
    const label = `preview.quickActionMetadata.${key}`;
    const item = record(value, label);
    const declaration = item.declaration === undefined ? undefined : record(item.declaration, `${label}.declaration`);
    return [key, {
      elementId: string(item.elementId, `${label}.elementId`),
      canonicalElementId: string(item.canonicalElementId, `${label}.canonicalElementId`),
      title: string(item.title, `${label}.title`),
      hasChildren: boolean(item.hasChildren, `${label}.hasChildren`),
      hasDeployment: boolean(item.hasDeployment, `${label}.hasDeployment`),
      ...(declaration === undefined ? {} : { declaration: {
        sourceName: string(declaration.sourceName, `${label}.declaration.sourceName`),
        line: number(declaration.line, `${label}.declaration.line`),
        column: number(declaration.column, `${label}.declaration.column`)
      } }),
      pathEligible: boolean(item.pathEligible, `${label}.pathEligible`)
    }];
  }));
}

function findPathMode(value: unknown): WebviewFindPathMode {
  const input = record(value, 'find path mode');
  const status = string(input.status, 'find path mode.status');
  if (status === 'idle') return { status };
  if (status === 'selecting-target') return {
    status,
    sourceId: string(input.sourceId, 'find path mode.sourceId'),
    sourceTitle: string(input.sourceTitle, 'find path mode.sourceTitle')
  };
  if (status === 'resolving-path' || status === 'showing-path') return {
    status,
    sourceId: string(input.sourceId, 'find path mode.sourceId'),
    sourceTitle: string(input.sourceTitle, 'find path mode.sourceTitle'),
    targetId: string(input.targetId, 'find path mode.targetId'),
    targetTitle: string(input.targetTitle, 'find path mode.targetTitle')
  };
  throw new ContractValidationError('find path mode status is invalid');
}

function isolateMode(value: unknown): WebviewIsolateMode {
  const input = record(value, 'isolate mode');
  const status = string(input.status, 'isolate mode.status');
  if (status === 'idle') return { status };
  if (status === 'showing-isolate') return {
    status,
    elementId: string(input.elementId, 'isolate mode.elementId'),
    elementTitle: string(input.elementTitle, 'isolate mode.elementTitle')
  };
  throw new ContractValidationError('isolate mode status is invalid');
}

function queryParameters(value: unknown): Readonly<Record<string, QueryParameterValue>> {
  const input = record(value, 'query parameters');
  return Object.fromEntries(Object.entries(input).map(([name, item]) => [name, queryParameterValue(item, name)]));
}

function queryParameterValue(value: unknown, name: string): QueryParameterValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean'
      || (typeof value === 'number' && Number.isFinite(value))) return value;
  if (Array.isArray(value)) return value.map((item) => queryParameterValue(item, name));
  throw new ContractValidationError(`query parameter '${name}' has an invalid value`);
}

function queryTableResult(value: unknown): QueryTableResult {
  const input = record(value, 'preview.queryResult');
  if (input.kind !== 'table' || input.schemaVersion !== 'aiq-table.v1') {
    throw new ContractValidationError('preview.queryResult must be an aiq-table.v1 table result');
  }
  array(input.columns, 'preview.queryResult.columns');
  array(input.rows, 'preview.queryResult.rows');
  record(input.metadata, 'preview.queryResult.metadata');
  return value as QueryTableResult;
}

function diagnostics(value: unknown, label: string): WebviewDiagnostic[] {
  return array(value, label).map((item, index) => {
    const itemLabel = `${label}[${index}]`;
    const input = record(item, itemLabel);
    return {
      sourceName: string(input.sourceName, `${itemLabel}.sourceName`),
      message: string(input.message, `${itemLabel}.message`),
      ...(input.line === undefined ? {} : { line: number(input.line, `${itemLabel}.line`) }),
      ...(input.column === undefined ? {} : { column: number(input.column, `${itemLabel}.column`) }),
      ...(input.endLine === undefined ? {} : { endLine: number(input.endLine, `${itemLabel}.endLine`) }),
      ...(input.endColumn === undefined ? {} : { endColumn: number(input.endColumn, `${itemLabel}.endColumn`) }),
      ...(input.level === undefined ? {} : { level: string(input.level, `${itemLabel}.level`) }),
      ...(input.code === undefined ? {} : { code: string(input.code, `${itemLabel}.code`) })
    };
  });
}

function completionItems(value: unknown): WebviewCompletionItem[] {
  return array(value, 'items').map((item, index) => {
    const itemLabel = `items[${index}]`;
    const input = record(item, itemLabel);
    const kind = string(input.kind, `${itemLabel}.kind`) as CompletionKind;
    if (!COMPLETION_KINDS.has(kind)) throw new ContractValidationError(`${itemLabel}.kind is invalid`);
    return {
      label: string(input.label, `${itemLabel}.label`),
      kind,
      ...(input.typeName === undefined ? {} : { typeName: string(input.typeName, `${itemLabel}.typeName`) }),
      ...(input.insertText === undefined ? {} : { insertText: string(input.insertText, `${itemLabel}.insertText`) }),
      ...(input.imported === undefined ? {} : { imported: boolean(input.imported, `${itemLabel}.imported`) }),
      ...(input.documentation === undefined
        ? {}
        : { documentation: completionDocumentation(input.documentation, `${itemLabel}.documentation`) })
    };
  });
}

function completionDocumentation(value: unknown, label: string): CompletionDocumentation {
  const input = record(value, label);
  return {
    ...(input.header === undefined ? {} : { header: string(input.header, `${label}.header`) }),
    ...(input.subtitle === undefined ? {} : { subtitle: string(input.subtitle, `${label}.subtitle`) }),
    ...(input.body === undefined ? {} : { body: string(input.body, `${label}.body`) }),
    ...(input.type === undefined ? {} : { type: completionTypeDocumentation(input.type, `${label}.type`) })
  };
}

function completionTypeDocumentation(value: unknown, label: string): NonNullable<CompletionDocumentation['type']> {
  const input = record(value, label);
  return {
    abstract: boolean(input.abstract, `${label}.abstract`),
    ...(input.baseType === undefined ? {} : { baseType: string(input.baseType, `${label}.baseType`) }),
    constructors: array(input.constructors, `${label}.constructors`).map((value, index) => {
      const constructorLabel = `${label}.constructors[${index}]`;
      const constructor = record(value, constructorLabel);
      return {
        spelling: string(constructor.spelling, `${constructorLabel}.spelling`),
        ownerType: string(constructor.ownerType, `${constructorLabel}.ownerType`)
      };
    })
  };
}

function queryRecord(value: unknown): Readonly<Record<BuiltinDiagramView, string>> {
  const input = record(value, 'queries');
  const queries = {} as Record<BuiltinDiagramView, string>;
  for (const [key, query] of Object.entries(input)) {
    const queryView = view(key);
    queries[queryView] = string(query, `queries.${key}`);
  }
  return queries;
}

function commandRecord(value: unknown): Record<string, unknown> & { command: string } {
  const input = record(value, 'webview message');
  return { ...input, command: string(input.command, 'command') };
}

function view(value: unknown): BuiltinDiagramView {
  if (!isBuiltinDiagramView(value)) throw new ContractValidationError('view must be a built-in diagram view');
  return value;
}

function unknownCommand(command: string): ContractValidationError {
  return new ContractValidationError(`Unknown webview command '${command}'`);
}
