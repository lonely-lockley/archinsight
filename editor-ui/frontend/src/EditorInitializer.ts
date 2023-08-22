import * as monaco from 'monaco-editor-core';
import { languageID } from './lang-service/config';
import setupLanguage from './lang-service/setup';
import Renderer from './render/Renderer';
import { LinkerMessage } from './model/TranslatorResponse';

const _global = (window) as any
const renderClient: Renderer = new Renderer();

function renderCode(container: HTMLElement, value: string) {
    const errors = monaco.editor.getModelMarkers({})?.length;
    if (!errors && value) {
        renderClient.remoteRender(container, value);
    }
}

async function updateCode(value: string) {
    localStorage.setItem('com.archinsight.sourcecode', value);
}

function restoreCode(): string {
   return localStorage.getItem('com.archinsight.sourcecode') || '';
}

function initializeEditor(code: string) {
    code = code || restoreCode();
    setupLanguage();
    const container: HTMLElement = document.getElementById('editor')!;
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
        updateCode(value || '');
        clearTimeout(timeout);
        timeout = window.setTimeout(() => renderCode(container, value), 1000);
    });

    // monkey patch editor to pass errors
    (editor as any).addModelMarkers = (linkerErrors: string) => {
        var model = editor.getModel()!;
        var errors = monaco.editor.getModelMarkers({ resource: model.uri! });
        (JSON.parse(linkerErrors) as LinkerMessage[]).forEach(lm => {
        console.log(lm);
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
    _global.editor = editor;

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
