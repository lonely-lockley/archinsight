import * as monaco from 'monaco-editor-core';

import { InsightError } from './InsightErrorListener';
import InsightLanguageService from './LanguageService';

import IWorkerContext = monaco.worker.IWorkerContext;

export class InsightWorker {
  private _ctx: IWorkerContext;
  private languageService: InsightLanguageService;

  constructor(ctx: IWorkerContext) {
    this._ctx = ctx;
    this.languageService = new InsightLanguageService();
  }

  doValidation(uri: monaco.Uri): Promise<InsightError[]> {
    const code = this.getTextDocument(uri);
    return Promise.resolve(this.languageService.validate(code));
  }

  format(code: string): Promise<string> {
    return Promise.resolve(this.languageService.format(code));
  }

  private getTextDocument(uri: any): string {
    const model = this._ctx.getMirrorModels().filter((md) => md.uri == uri._formatted)[0];
    return model.getValue();
  }
}