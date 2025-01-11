import * as monaco from 'monaco-editor';
import { languageID } from './lang-service/config';
import setupLanguage from './lang-service/setup';
import Renderer from './remote/Renderer';
import { LinkerMessage } from './model/TranslatorResponse';

const _global = (window) as any
const renderClient: Renderer = new Renderer();
const prefersDarkScheme = window.matchMedia('(prefers-color-scheme: dark)');

function renderCode(container: HTMLElement, tab: string, value: string, uri: monaco.Uri) {
    const errors = monaco.editor.getModelMarkers({ resource: uri })?.length;
    if (!errors) {
        renderClient.remoteRender(container, tab, value, prefersDarkScheme.matches);
    }
    else {
        renderClient.remoteCache(container, tab, value);
    }
}

function updateEditorTheme() {
    if (prefersDarkScheme.matches) {
        monaco.editor.setTheme('insight-dark');
    }
    else {
        monaco.editor.setTheme('insight-light');
    }
}

function initializeEditor(anchorId: string, remoteId: string, tab: string, localStorageKey: string, code: string) {
    setupLanguage();
    const remote: HTMLElement = document.getElementById(remoteId)!;
    const container: HTMLElement = document.getElementById(anchorId)!;
    const editor: monaco.editor.IStandaloneCodeEditor = monaco.editor.create(container, {
                                                                  language: languageID,
                                                                  minimap: { enabled: true },
                                                                  automaticLayout: true,
                                                                  autoIndent: 'full',
                                                                  theme: 'vs-dark',
                                                                  fixedOverflowWidgets: true,
                                                                  overflowWidgetsDomNode: document.getElementById('monaco-editor-overflow-widgets-root')!,
                                                                  suggest: {
                                                                    showWords: false
                                                                  },
                                                              });
    // source highlight listener
    let timeout: number | undefined;
    editor.onDidChangeModelContent(() => {
        const value = editor.getValue();
        _global.tabState.storeCodeForTab(localStorageKey, tab, value);
        clearTimeout(timeout);
        timeout = window.setTimeout(() => renderCode(remote, tab, value, editor.getModel()!.uri), 1000);
    });

    // monkey patch editor to pass errors
    (editor as any).setModelMarkers = (linkerErrors: string) => {
        let levels = new Map<string, monaco.MarkerSeverity>([
            ["ERROR", monaco.MarkerSeverity.Error],
            ["WARNING", monaco.MarkerSeverity.Warning],
            ["NOTICE", monaco.MarkerSeverity.Info]
        ]);
        let model = editor.getModel()!;
        let errors: any[] = [];
        (JSON.parse(linkerErrors) as LinkerMessage[]).forEach(lm => {
            var severity = monaco.MarkerSeverity.Error;
            errors.push({
                "resource": model.uri!,
                "owner": languageID,
                "code": "1", // random number
                "severity": levels.get(lm.level!),
                "message": lm.msg!,
                "startLineNumber": lm.line,
                "startColumn": lm.charPosition + 1,
                "endLineNumber": lm.line,
                "endColumn": lm.charPosition + (lm.stopIndex - lm.startIndex) + 2
            });
        })

        monaco.editor.setModelMarkers(model, languageID, errors);
    }

    (editor as any).resetModelMarkers = () => {
        let model = editor.getModel()!;
        monaco.editor.setModelMarkers(model, languageID, []);
    }

    // publish editor
    (container as any).editor = editor;

    // set theme
    Promise.all([
        fetch(_global.frontendSettings.contextPath + '/themes/monaco/insight_light.json')
            .then(response => response.json())
            .then(data => {
                monaco.editor.defineTheme('insight-light', data);
            }),
        fetch(_global.frontendSettings.contextPath + '/themes/monaco/insight_dark.json')
            .then(response => response.json())
            .then(data => {
                monaco.editor.defineTheme('insight-dark', data);
            })
    ]).then(() => {
        updateEditorTheme();
        prefersDarkScheme.onchange = () => {
            updateEditorTheme();

        }
    }).catch(error => {
        console.error('Failed to load themes:', error);
    });

    if (code) {
        editor.setValue(code);
    }
}

_global.initializeEditor = initializeEditor
