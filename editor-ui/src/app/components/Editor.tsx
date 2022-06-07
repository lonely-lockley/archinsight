import * as monaco from 'monaco-editor-core';
import React, { FC, useEffect, useRef } from 'react';

import { useDispatch } from '../store';

const Editor: FC = () => {
  const container = useRef<HTMLDivElement>(null);
  const editor = useRef<monaco.editor.IStandaloneCodeEditor>();

  const { getRender } = useDispatch((state) => state.app);

  useEffect(() => {
    if (container.current && !editor.current) {
      editor.current = monaco.editor.create(container.current, {
        language: 'insight',
        minimap: { enabled: false },
        automaticLayout: true,
        autoIndent: 'full',
        theme: 'vs-dark',
      });

      let timeout: number | undefined;
      editor.current.onDidChangeModelContent(() => {
        clearTimeout(timeout);
        timeout = window.setTimeout(() => {
          const errors = monaco.editor.getModelMarkers({})?.length;
          const value = editor.current?.getValue();
          if (!errors && value) {
            getRender(value);
          }
        }, 1000);
      });
    }
  }, []);

  return <div style={{ height: '100%', overflow: 'hidden' }} ref={container} id={'container'} />;
};

export default Editor;
