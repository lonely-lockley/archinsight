import * as monaco from 'monaco-editor-core';

import Uri = monaco.Uri;
import { InsightWorker } from './InsightWorker';
import { languageID } from './config';

export class WorkerManager {
  private worker: monaco.editor.MonacoWebWorker<InsightWorker> | null;
  private workerClientProxy: Promise<InsightWorker> | undefined;

  constructor() {
    this.worker = null;
  }

  private getClientProxy(): Promise<InsightWorker> {
    if (!this.workerClientProxy) {
      this.worker = monaco.editor.createWebWorker<InsightWorker>({
        // module that exports the create() method and returns a `JSONWorker` instance
        moduleId: 'InsightWorker',
        label: languageID,
        // passed in to the create() method
        createData: {
          languageId: languageID,
        },
      });

      this.workerClientProxy = <Promise<InsightWorker>>(<any>this.worker.getProxy());
    }

    return this.workerClientProxy;
  }

  async getLanguageServiceWorker(...resources: Uri[]): Promise<InsightWorker> {
    const client = await this.getClientProxy();
    await this.worker?.withSyncedResources(resources);
    return client;
  }
}
