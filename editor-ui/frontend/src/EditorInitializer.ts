import * as monaco from 'monaco-editor-core';
import { languageID } from './lang-service/config';
import setupLanguage from './lang-service/setup';
import Renderer from './render/Renderer';
import { LinkerMessage } from './model/TranslatorResponse';

const _global = (window) as any
const renderClient: Renderer = new Renderer();

function initializeEditor(code: string) {
    setupLanguage();
    const container: HTMLElement = document.getElementById('editor')!;
    const svg: HTMLElement = document.getElementById('svg')!;
    const editor: monaco.editor.IStandaloneCodeEditor = monaco.editor.create(container, {
                                                                  language: languageID,
                                                                  minimap: { enabled: true },
                                                                  automaticLayout: true,
                                                                  autoIndent: 'full',
                                                                  theme: 'vs-dark',
                                                                  fixedOverflowWidgets: true,
                                                                  value: code,
                                                              });
    // source highlight listener
    let timeout: number | undefined;
    editor.onDidChangeModelContent(() => {
        const value = editor.getValue();
        //updateCode(value || '');

        clearTimeout(timeout);
        timeout = window.setTimeout(() => {
            const errors = monaco.editor.getModelMarkers({})?.length;
            if (!errors && value) {
                renderClient.remoteRender(container, value);
            }
        }, 1000);
    });

    if (code) {
        renderClient.remoteRender(container, code);
    }

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
}

_global.initializeEditor = initializeEditor
