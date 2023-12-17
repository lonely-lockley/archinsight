// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import * as worker from 'monaco-editor/esm/vs/editor/editor.worker';
import * as monaco from 'monaco-editor-core';

import Uri = monaco.Uri;
import IWorkerContext = monaco.worker.IWorkerContext;

import { InsightWorker } from './InsightWorker';

self.onmessage = () => {
  worker.initialize((ctx: IWorkerContext) => {
    return new InsightWorker(ctx);
  });
};