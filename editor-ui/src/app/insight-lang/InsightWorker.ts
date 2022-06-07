import * as monaco from 'monaco-editor-core';

import { InsightError } from '../lang-service/InsightErrorListener';
import InsightLanguageService from '../lang-service/LanguageService';

import IWorkerContext = monaco.worker.IWorkerContext;

export class InsightWorker {
  private _ctx: IWorkerContext;
  private languageService: InsightLanguageService;

  constructor(ctx: IWorkerContext) {
    this._ctx = ctx;
    this.languageService = new InsightLanguageService();
  }

  doValidation(): Promise<InsightError[]> {
    const code = this.getTextDocument();
    return Promise.resolve(this.languageService.validate(code));
  }

  format(code: string): Promise<string> {
    return Promise.resolve(this.languageService.format(code));
  }

  private getTextDocument(): string {
    const model = this._ctx.getMirrorModels()[0]; // When there are multiple files open, this will be an array
    return model.getValue();
  }
}
