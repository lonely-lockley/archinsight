import * as monaco from 'monaco-editor-core';
import setupLanguage from './lang-service/setup'

const _global = (window) as any

function initializeEditor(code: string) {
    setupLanguage();
    const container: HTMLElement = document.getElementById('editor')!;
    const editor: monaco.editor.IStandaloneCodeEditor = monaco.editor.create(container, {
                                                                  language: 'insight',
                                                                  minimap: { enabled: true },
                                                                  automaticLayout: true,
                                                                  autoIndent: 'full',
                                                                  theme: 'vs-dark',
                                                                  fixedOverflowWidgets: true,
                                                                  value: code,
                                                              });

interface RRR {
    msg: string,
    messages: {
        level: string,
        msg: string,
        line: number,
        characterPos: number
    }[]
}

    let timeout: number | undefined;
    editor.onDidChangeModelContent(() => {
        const value = editor.getValue();
        //updateCode(value || '');

        clearTimeout(timeout);
        timeout = window.setTimeout(() => {
            const errors = monaco.editor.getModelMarkers({})?.length;
            if (!errors && value) {
                //getRender(value);
                (container as any).$server.render(value).then(
                    (value: string) => {
                        var ttt: RRR = JSON.parse(value);
                        console.log(value);
                        console.log(ttt.messages);
                    },
                    (error: any) => {
                        console.log(error);
                    }
                );
            }
        }, 1000);
    });

    //if (code) {
        //getRender(code);
    //}
    _global.editor = editor;

    fetch('/themes/Cobalt2.json')
      .then(data => data.json())
      .then(data => {
        monaco.editor.defineTheme('cobalt', data);
        monaco.editor.setTheme('cobalt');
      })
}

_global.initializeEditor = initializeEditor
