import { worker as namespace } from 'monaco-editor-core';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import * as worker from 'monaco-editor-core/esm/vs/editor/editor.worker';

import { InsightWorker } from './InsightWorker';

import IWorkerContext = namespace.IWorkerContext;

self.onmessage = () => {
  worker.initialize((ctx: IWorkerContext) => {
    return new InsightWorker(ctx);
  });
};
