import * as monaco from 'monaco-editor-core';
import React, { FC, useEffect, useRef } from 'react';

import { useDispatch, useSelect } from '../store';

const Editor: FC = () => {
  const container = useRef<HTMLDivElement>(null);
  const editor = useRef<monaco.editor.IStandaloneCodeEditor>();

  const { code } = useSelect((state) => state.save);
  const { getRender } = useDispatch((state) => state.app);
  const { updateCode } = useDispatch((state) => state.save);

  useEffect(() => {
    if (container.current && !editor.current) {
      editor.current = monaco.editor.create(container.current, {
        language: 'insight',
        minimap: { enabled: false },
        automaticLayout: true,
        autoIndent: 'full',
        theme: 'vs-dark',
        value: code,
      });

      let timeout: number | undefined;
      editor.current.onDidChangeModelContent(() => {
        const value = editor.current?.getValue();
        updateCode(value || '');

        clearTimeout(timeout);
        timeout = window.setTimeout(() => {
          const errors = monaco.editor.getModelMarkers({})?.length;
          if (!errors && value) {
            getRender(value);
          }
        }, 1000);
      });

      if (code) {
        getRender(code);
      }
    }
  }, []);

  return <div style={{ height: '100%', overflow: 'hidden' }} ref={container} />;
};

export default Editor;
