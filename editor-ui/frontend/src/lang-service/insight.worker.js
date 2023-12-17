import * as worker from 'monaco-editor/esm/vs/editor/editor.worker';
import { InsightWorker} from './InsightWorker';

self.onmessage = () => {
  worker.initialize((ctx) => {
    return new InsightWorker(ctx);
  });
};
