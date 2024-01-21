import * as monaco from 'monaco-editor-core';
import DiagnosticsAdapter from './DiagnosticsAdapter';
import InsightFormattingProvider from './InsightFormattingProvider';
import { InsightTokensProvider } from '../InsightHighlight';
import { InsightAutocomplete } from '../InsightAutocomplete';
import { InsightWorker } from './InsightWorker';
import { WorkerManager } from './WorkerManager';
import { languageExtensionPoint, languageID } from './config';

export type WorkerAccessor = (...uris: monaco.Uri[]) => Promise<InsightWorker>;

const setupLanguage = () => {
  if ((window as any).MonacoEnvironment != undefined) {
    return;
  }

  (window as any).MonacoEnvironment = {
    getWorkerUrl: (moduleId: unknown, label: string) => {
      if (label === languageID) return 'insight.worker.js';
     return 'editor.worker.js';
    },
  };

  monaco.languages.register(languageExtensionPoint);
  monaco.languages.registerCompletionItemProvider(languageID, new InsightAutocomplete());
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