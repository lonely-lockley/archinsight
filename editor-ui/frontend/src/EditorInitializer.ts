import * as monaco from 'monaco-editor-core';
import setupLanguage from './lang-service/setup';
import Renderer from './render/Renderer';

const _global = (window) as any
const renderClient: Renderer = new Renderer();

function initializeEditor(code: string) {
    setupLanguage();
    const container: HTMLElement = document.getElementById('editor')!;
    const svg: HTMLElement = document.getElementById('svg')!;
    const editor: monaco.editor.IStandaloneCodeEditor = monaco.editor.create(container, {
                                                                  language: 'insight',
                                                                  minimap: { enabled: true },
                                                                  automaticLayout: true,
                                                                  autoIndent: 'full',
                                                                  theme: 'vs-dark',
                                                                  fixedOverflowWidgets: true,
                                                                  value: code,
                                                              });



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
    _global.editor = editor;

    fetch('/themes/Cobalt2.json')
      .then(data => data.json())
      .then(data => {
        monaco.editor.defineTheme('cobalt', data);
        monaco.editor.setTheme('cobalt');
      })
}

_global.initializeEditor = initializeEditor
