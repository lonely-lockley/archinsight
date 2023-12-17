import * as monaco from 'monaco-editor-core';
import DiagnosticsAdapter from './DiagnosticsAdapter';
import InsightFormattingProvider from './InsightFormattingProvider';
import { InsightTokensProvider } from '../InsightHighlight';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import { InsightWorker } from './InsightWorker';
import { WorkerManager } from './WorkerManager';
import { languageExtensionPoint, languageID } from './config';

export type WorkerAccessor = (...uris: monaco.Uri[]) => Promise<InsightWorker>;


const setupLanguage = () => {
  (window as any).MonacoEnvironment = {
    getWorkerUrl: (moduleId: unknown, label: string) => {
      if (label === languageID) {
        return 'insight.worker.bundle.js';
      }
      else {
        return 'editor.worker.bundle.js';
      }
    },
  };

  monaco.languages.register(languageExtensionPoint);
  monaco.languages.onLanguage(languageID, () => {
    monaco.languages.setTokensProvider(languageID, new InsightTokensProvider());

    const client = new WorkerManager();
    const worker: WorkerAccessor = (...uris: monaco.Uri[]): Promise<InsightWorker> => {
      return client.getLanguageServiceWorker(...uris);
    };
    //Call the errors provider
    new DiagnosticsAdapter(worker);
    monaco.languages.registerDocumentFormattingEditProvider(
      languageID,
      new InsightFormattingProvider(worker),
    );
  });
};

export default setupLanguage;
