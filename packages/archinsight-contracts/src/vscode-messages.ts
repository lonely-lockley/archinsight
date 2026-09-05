import { isBuiltinDiagramView, type BuiltinDiagramView, type CompletionKind, type LanguageSnapshot } from '@insight/language';
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
  imported?: boolean;
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
};

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
  | { command: 'sourceChanged'; source: string }
  | { command: 'render'; view: BuiltinDiagramView; query: string }
  | { command: 'selectDeploymentEnvironment' }
  | { command: 'refresh' }
  | { command: 'download'; kind: 'source' | 'svg' | 'png' | 'dot' }
  | { command: 'editQuery'; view: BuiltinDiagramView; query: string }
  | { command: 'png'; dataUrl: string }
  | { command: 'complete'; requestId: number; sourceName: string; source: string; cursorOffset: number }
  | { command: 'clipboardRead'; requestId: number }
  | { command: 'clipboardWrite'; text: string }
  | { command: 'openDeclaration'; declaration: { source: string; line: number; column: number } };

export type WorkbenchHostToWebviewMessage =
  | {
    command: 'source'; source: string; sourceName: string; fileName: string; view: BuiltinDiagramView; query: string;
    environment?: string; diagnostics?: WebviewDiagnostic[]; symbols?: LanguageSnapshot; readOnly?: boolean;
    queries?: Readonly<Record<BuiltinDiagramView, string>>;
  }
  | { command: 'query'; view: BuiltinDiagramView; query: string; environment?: string }
  | { command: 'preview'; state: WebviewPreviewState }
  | { command: 'diagnostics'; diagnostics: WebviewDiagnostic[] }
  | { command: 'completionResult'; requestId: number; items: WebviewCompletionItem[]; replacementStartOffset?: number; replacementEndOffset?: number }
  | { command: 'clipboardText'; requestId: number; text: string }
  | { command: 'exportPng'; svg: string }
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
    case 'ready': case 'selectDeploymentEnvironment': case 'refresh': return { command: input.command };
    case 'sourceChanged': return { command: 'sourceChanged', source: string(input.source, 'source') };
    case 'render': case 'editQuery': return { command: input.command, view: view(input.view), query: string(input.query, 'query') };
    case 'download': {
      const kind = string(input.kind, 'kind');
      if (!['source', 'svg', 'png', 'dot'].includes(kind)) throw new ContractValidationError('download kind is invalid');
      return { command: 'download', kind: kind as 'source' | 'svg' | 'png' | 'dot' };
    }
    case 'png': return { command: 'png', dataUrl: string(input.dataUrl, 'dataUrl') };
    case 'complete': return {
      command: 'complete', requestId: number(input.requestId, 'requestId'), sourceName: string(input.sourceName, 'sourceName'),
      source: string(input.source, 'source'), cursorOffset: number(input.cursorOffset, 'cursorOffset')
    };
    case 'clipboardRead': return { command: 'clipboardRead', requestId: number(input.requestId, 'requestId') };
    case 'clipboardWrite': return { command: 'clipboardWrite', text: string(input.text, 'text') };
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
      ...(input.diagnostics === undefined ? {} : { diagnostics: diagnostics(input.diagnostics, 'diagnostics') }),
      ...(input.symbols === undefined ? {} : { symbols: input.symbols as LanguageSnapshot }),
      ...(input.readOnly === undefined ? {} : { readOnly: boolean(input.readOnly, 'readOnly') }),
      ...(input.queries === undefined ? {} : { queries: queryRecord(input.queries) })
    };
    case 'query': return { command: 'query', view: view(input.view), query: string(input.query, 'query'), ...(input.environment === undefined ? {} : { environment: string(input.environment, 'environment') }) };
    case 'preview': return { command: 'preview', state: previewState(input.state) };
    case 'diagnostics': return { command: 'diagnostics', diagnostics: diagnostics(input.diagnostics, 'diagnostics') };
    case 'completionResult': return {
      command: 'completionResult', requestId: number(input.requestId, 'requestId'), items: completionItems(input.items),
      ...(input.replacementStartOffset === undefined ? {} : { replacementStartOffset: number(input.replacementStartOffset, 'replacementStartOffset') }),
      ...(input.replacementEndOffset === undefined ? {} : { replacementEndOffset: number(input.replacementEndOffset, 'replacementEndOffset') })
    };
    case 'clipboardText': return { command: 'clipboardText', requestId: number(input.requestId, 'requestId'), text: string(input.text, 'text') };
    case 'exportPng': return { command: 'exportPng', svg: string(input.svg, 'svg') };
    case 'reveal': return { command: 'reveal', line: number(input.line, 'line'), column: number(input.column, 'column') };
    default: throw unknownCommand(input.command);
  }
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
    ...(input.error === undefined ? {} : { error: string(input.error, 'preview.error') })
  };
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
      ...(input.insertText === undefined ? {} : { insertText: string(input.insertText, `${itemLabel}.insertText`) }),
      ...(input.imported === undefined ? {} : { imported: boolean(input.imported, `${itemLabel}.imported`) })
    };
  });
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
