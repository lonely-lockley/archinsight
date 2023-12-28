import * as monaco from 'monaco-editor-core';
import { languageID } from './lang-service/config';
import setupLanguage from './lang-service/setup';
import Renderer from './remote/Renderer';
import { LinkerMessage } from './model/TranslatorResponse';

const _global = (window) as any
const renderClient: Renderer = new Renderer();

function renderCode(container: HTMLElement, tab: string, value: string, uri: monaco.Uri) {
    const errors = monaco.editor.getModelMarkers({ resource: uri })?.length;
    if (!errors && value && value.length > 0) {
        renderClient.remoteRender(container, tab, value);
    }
    else {
        renderClient.remoteCache(container, tab, value);
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
                                                              });
    // source highlight listener
    let timeout: number | undefined;
    editor.onDidChangeModelContent(() => {
        const value = editor.getValue();
        localStorage.setItem(localStorageKey, value || '');
        clearTimeout(timeout);
        timeout = window.setTimeout(() => renderCode(remote, tab, value, editor.getModel()!.uri), 1000);
    });

    // monkey patch editor to pass errors
    (editor as any).addModelMarkers = (linkerErrors: string) => {
        var model = editor.getModel()!;
        var errors = monaco.editor.getModelMarkers({ resource: model.uri! });
        (JSON.parse(linkerErrors) as LinkerMessage[]).forEach(lm => {
            errors.push({
                "resource": model.uri!,
                "owner": languageID,
                "code": "1", // random number
                "severity": monaco.MarkerSeverity.Error,
                "message": lm.msg!,
                "startLineNumber": lm.line,
                "startColumn": lm.charPosition + 1,
                "endLineNumber": lm.line,
                "endColumn": lm.charPosition + (lm.stopIndex - lm.startIndex) + 2
            });
        })

        monaco.editor.setModelMarkers(model, languageID, errors);
    }

    // publish editor
    (container as any).editor = editor;

    // set theme
    fetch('/themes/Cobalt2.json')
      .then(data => data.json())
      .then(data => {
        monaco.editor.defineTheme('cobalt', data);
        monaco.editor.setTheme('cobalt');
    })

    if (code) {
        editor.setValue(code);
    }
}

_global.initializeEditor = initializeEditor
