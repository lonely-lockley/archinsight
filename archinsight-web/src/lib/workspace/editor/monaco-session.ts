import {
  CompletionEngine,
  createGeneratedInsightSyntaxProvider,
  type CompletionKind,
  type LanguageSnapshot
} from '@insight/language';
import { completionDetail, completionSortText } from '@archinsight/editor-support';
import type * as Monaco from 'monaco-editor';
import EditorWorker from 'monaco-editor/editor/editor.worker.js?worker';
import type { Diagnostic } from '$lib/api';
import {
  createInsightSemanticTokensProvider,
  createInsightTokenVocabulary,
  createInsightTokensProvider,
  refreshInsightTokenVocabulary,
  type InsightSemanticTokensProvider,
  type InsightTokenVocabulary
} from '@archinsight/workbench/monaco';
import LanguageWorker from '$lib/language.worker?worker';
import { defineInsightThemes, insightDarkTheme } from '@archinsight/workbench/monaco-themes';
import {
  visibleIdentifiersForSource,
  type WorkspaceCompletionSnapshot
} from '$lib/workspace-completion-snapshot';
import { isSourceDiagnostic } from '../analysis/diagnostics';
import { markerRange } from './monaco-markers';
import type { SourceLocation, WorkspaceTab } from '@archinsight/workbench/types';

type AnalysisSource = { readonly sourceIdentity: string; readonly content: string };

export type MonacoSessionPorts = {
  editorHost(): HTMLDivElement;
  tabs(): WorkspaceTab[];
  activeTab(): WorkspaceTab | undefined;
  activeTabId(): string | undefined;
  editorTabId(): string | undefined;
  selectEditorTab(id: string | undefined): void;
  editorSymbols(): LanguageSnapshot;
  completionSnapshot(): WorkspaceCompletionSnapshot;
  diagnosticsFor(tab: WorkspaceTab): Diagnostic[];
  contentChanged(tab: WorkspaceTab, content: string): void;
};

export type MonacoSession = {
  startLanguageWorker(): void;
  setupEditor(): Promise<void>;
  checkSyntax(sources: AnalysisSource[]): Promise<Diagnostic[]>;
  syncActiveTab(): void;
  ensureModel(id: string, content: string): void;
  removeModel(id: string): void;
  retargetModel(sourceId: string, targetId: string): void;
  reveal(location: SourceLocation): void;
  refreshTokenVocabulary(options?: { readonly repaint?: boolean }): void;
  refreshMarkers(): void;
  layout(): void;
  reset(): void;
  dispose(): void;
};

export function createMonacoSession(ports: MonacoSessionPorts): MonacoSession {
  let monaco: typeof Monaco | undefined;
  let editor: Monaco.editor.IStandaloneCodeEditor | undefined;
  let completionEngine: CompletionEngine | undefined;
  let tokenVocabulary: InsightTokenVocabulary | undefined;
  let semanticTokensProvider: InsightSemanticTokensProvider | undefined;
  let suppressEditorChange = false;
  let languageWorker: Worker | undefined;
  let syntaxSequence = 0;
  const syntaxResolvers = new Map<number, (diagnostics: Diagnostic[]) => void>();
  const editorModels = new Map<string, Monaco.editor.ITextModel>();

  const sourceIdentityForModel = (model: Monaco.editor.ITextModel): string => {
    for (const [id, candidate] of editorModels) {
      if (candidate === model) {
        return ports.tabs().find((tab) => tab.id === id)?.sourceIdentity ?? id;
      }
    }
    return model.uri.path.replace(/^\/+/, '');
  };

  const registerCompletionProvider = (): void => {
    if (monaco === undefined || completionEngine === undefined) {
      return;
    }
    const runtime = monaco;
    const engine = completionEngine;
    runtime.languages.registerCompletionItemProvider('insight', {
      triggerCharacters: [
        '@', '-', '~', '>', ':', '=', '.',
        ...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ_'.split('')
      ],
      provideCompletionItems(model, position) {
        const path = sourceIdentityForModel(model);
        const offset = model.getOffsetAt(position);
        const snapshot = ports.completionSnapshot();
        const result = engine.complete({
          sourceName: path,
          source: model.getValue(),
          cursorOffset: offset,
          snapshot: ports.editorSymbols(),
          indexedIdentifiers: visibleIdentifiersForSource(snapshot, path),
          contextIds: snapshot.contextIds
        });
        const replacementStart = model.getPositionAt(result.replacementStartOffset);
        const replacementEnd = model.getPositionAt(result.replacementEndOffset);
        const range = {
          startLineNumber: replacementStart.lineNumber,
          endLineNumber: replacementEnd.lineNumber,
          startColumn: replacementStart.column,
          endColumn: replacementEnd.column
        };
        return {
          suggestions: result.items.map((item) => ({
            label: item.label,
            kind: completionItemKind(runtime, item),
            insertText: item.insertText,
            range,
            detail: completionDetail(item),
            sortText: completionSortText(item)
          }))
        };
      }
    });
  };

  const ensureModel = (id: string, content: string): Monaco.editor.ITextModel | undefined => {
    const existing = editorModels.get(id);
    if (existing !== undefined) {
      if (existing.getValue() !== content && id !== ports.activeTabId()) {
        existing.setValue(content);
      }
      return existing;
    }
    if (monaco === undefined) {
      return undefined;
    }
    const model = monaco.editor.createModel(content, 'insight', monaco.Uri.parse(`insight://tab/${id}`));
    editorModels.set(id, model);
    return model;
  };

  const applyMarkers = (id: string | undefined): void => {
    if (editor === undefined || monaco === undefined || id === undefined) {
      return;
    }
    const model = editorModels.get(id);
    if (model === undefined) {
      return;
    }
    const tab = ports.tabs().find((item) => item.id === id);
    monaco.editor.setModelMarkers(
      model,
      'insight',
      (tab === undefined ? [] : ports.diagnosticsFor(tab))
        .filter(isSourceDiagnostic)
        .map((diagnostic) => {
          const range = markerRange(model, diagnostic);
          return {
            ...range,
            code: diagnostic.code,
            source: 'insight',
            message: diagnostic.message,
            severity: markerSeverity(monaco!, diagnostic)
          };
        })
    );
  };

  const reset = (): void => {
    if (editor !== undefined) {
      editor.setModel(null);
    }
    for (const model of editorModels.values()) {
      model.dispose();
    }
    editorModels.clear();
    ports.selectEditorTab(undefined);
  };

  return {
    startLanguageWorker() {
      (self as unknown as { MonacoEnvironment: unknown }).MonacoEnvironment = {
        getWorker: () => new EditorWorker()
      };
      languageWorker = new LanguageWorker();
      languageWorker.onmessage = (event: MessageEvent<{ requestId: number; diagnostics: Diagnostic[] }>) => {
        const resolver = syntaxResolvers.get(event.data.requestId);
        if (resolver === undefined) {
          return;
        }
        syntaxResolvers.delete(event.data.requestId);
        resolver(event.data.diagnostics);
      };
    },

    async setupEditor() {
      monaco = await import('monaco-editor');
      completionEngine = new CompletionEngine(createGeneratedInsightSyntaxProvider());
      tokenVocabulary = createInsightTokenVocabulary(ports.editorSymbols());
      monaco.languages.register({ id: 'insight' });
      monaco.languages.setTokensProvider('insight', createInsightTokensProvider(tokenVocabulary));
      semanticTokensProvider = createInsightSemanticTokensProvider(tokenVocabulary);
      monaco.languages.registerDocumentRangeSemanticTokensProvider('insight', semanticTokensProvider);
      defineInsightThemes(monaco);
      registerCompletionProvider();
      editor = monaco.editor.create(ports.editorHost(), {
        model: null,
        theme: insightDarkTheme,
        automaticLayout: true,
        minimap: { enabled: true },
        autoIndent: 'full',
        suggest: { showWords: false },
        fontFamily: 'JetBrains Mono, Menlo, Monaco, Consolas, monospace',
        fontSize: 12,
        tabSize: 4,
        insertSpaces: true,
        hover: { enabled: 'on' },
        fixedOverflowWidgets: true,
        occurrencesHighlight: 'off',
        selectionHighlight: false,
        renderValidationDecorations: 'on',
        'semanticHighlighting.enabled': true,
        scrollBeyondLastLine: false
      });
      editor.onDidChangeModelContent(() => {
        const activeTabId = ports.activeTabId();
        if (suppressEditorChange || activeTabId === undefined || editor === undefined) {
          return;
        }
        const tab = ports.tabs().find((item) => item.id === activeTabId);
        if (tab === undefined || tab.readOnly === true) {
          return;
        }
        ports.contentChanged(tab, editor.getValue());
      });
    },

    checkSyntax(sources) {
      if (sources.length === 0 || languageWorker === undefined) {
        return Promise.resolve([]);
      }
      const requestId = ++syntaxSequence;
      return new Promise((resolve) => {
        syntaxResolvers.set(requestId, resolve);
        languageWorker!.postMessage({
          requestId,
          sources,
          snapshot: ports.editorSymbols()
        });
      });
    },

    syncActiveTab() {
      const tab = ports.activeTab();
      if (editor === undefined || tab === undefined) {
        if (editor !== undefined) {
          suppressEditorChange = true;
          editor.setModel(null);
          editor.updateOptions({ readOnly: false });
          suppressEditorChange = false;
        }
        ports.selectEditorTab(undefined);
        applyMarkers(ports.activeTabId());
        return;
      }
      const model = ensureModel(tab.id, tab.content);
      if (model === undefined) {
        return;
      }
      if (ports.editorTabId() === tab.id && editor.getModel() === model) {
        editor.updateOptions({ readOnly: tab.readOnly === true });
        applyMarkers(ports.activeTabId());
        return;
      }
      suppressEditorChange = true;
      editor.setModel(model);
      ports.selectEditorTab(tab.id);
      editor.updateOptions({ readOnly: tab.readOnly === true });
      suppressEditorChange = false;
      editor.layout();
      applyMarkers(ports.activeTabId());
    },

    ensureModel(id, content) {
      ensureModel(id, content);
    },

    removeModel(id) {
      const model = editorModels.get(id);
      if (model === undefined) {
        return;
      }
      if (editor?.getModel() === model) {
        editor.setModel(null);
      }
      model.dispose();
      editorModels.delete(id);
    },

    retargetModel(sourceId, targetId) {
      const model = editorModels.get(sourceId);
      if (model === undefined) {
        return;
      }
      editorModels.delete(sourceId);
      editorModels.set(targetId, model);
    },

    reveal(location) {
      const model = editor?.getModel();
      if (editor === undefined || monaco === undefined || model === null || model === undefined) {
        return;
      }
      const lineNumber = clamp(Math.trunc(location.line), 1, model.getLineCount());
      const column = clamp(Math.trunc(location.column) + 1, 1, model.getLineMaxColumn(lineNumber));
      const position = { lineNumber, column };
      editor.setPosition(position);
      editor.revealPositionInCenter(position, monaco.editor.ScrollType.Smooth);
      editor.focus();
    },

    refreshTokenVocabulary(options = {}) {
      if (tokenVocabulary === undefined) {
        return;
      }
      refreshInsightTokenVocabulary(
        tokenVocabulary,
        ports.editorSymbols(),
        ports.tabs().map((tab) => tab.content)
      );
      if (options.repaint === false || monaco === undefined) {
        return;
      }
      for (const model of editorModels.values()) {
        monaco.editor.setModelLanguage(model, 'insight');
      }
      semanticTokensProvider?.refresh();
      editor?.render(true);
    },

    refreshMarkers() {
      for (const id of editorModels.keys()) {
        applyMarkers(id);
      }
    },

    layout() {
      editor?.layout();
    },

    reset,

    dispose() {
      reset();
      languageWorker?.terminate();
      languageWorker = undefined;
      syntaxResolvers.clear();
      editor?.dispose();
      editor = undefined;
    }
  };
}

function markerSeverity(runtime: typeof Monaco, diagnostic: Diagnostic): Monaco.MarkerSeverity {
  if (diagnostic.level === 'ERROR') {
    return runtime.MarkerSeverity.Error;
  }
  if (diagnostic.level === 'WARNING') {
    return runtime.MarkerSeverity.Warning;
  }
  return runtime.MarkerSeverity.Info;
}

function completionItemKind(
  runtime: typeof Monaco,
  item: { kind: CompletionKind; imported?: boolean }
): Monaco.languages.CompletionItemKind {
  switch (item.kind) {
    case 'KEYWORD': return runtime.languages.CompletionItemKind.Keyword;
    case 'TYPE': return runtime.languages.CompletionItemKind.Class;
    case 'CONSTRUCTOR': return runtime.languages.CompletionItemKind.Constructor;
    case 'OPERATOR': return runtime.languages.CompletionItemKind.Operator;
    case 'ATTRIBUTE': return runtime.languages.CompletionItemKind.Property;
    case 'IDENTIFIER': return item.imported === true
      ? runtime.languages.CompletionItemKind.Reference
      : runtime.languages.CompletionItemKind.Variable;
    case 'ENUM_VALUE': return runtime.languages.CompletionItemKind.EnumMember;
    case 'ANNOTATION': return runtime.languages.CompletionItemKind.Function;
    case 'NEWLINE': return runtime.languages.CompletionItemKind.Snippet;
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
