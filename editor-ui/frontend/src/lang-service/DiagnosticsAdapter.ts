import * as monaco from 'monaco-editor';

import { InsightError } from './InsightErrorListener';
import { languageID } from './config';
import { WorkerAccessor } from './setup';

class DiagnosticsAdapter {
  constructor(private worker: WorkerAccessor) {
    const onModelAdd = (model: monaco.editor.IModel): void => {
      let handle: number | undefined;
      model.onDidChangeContent(() => {
        // here we are Debouncing the user changes, so everytime a new change is done, we wait 500ms before validating
        // otherwise if the user is still typing, we cancel the
        clearTimeout(handle);
        handle = window.setTimeout(() => this.validate(model.uri), 500);
      });

      this.validate(model.uri);
    };
    monaco.editor.onDidCreateModel(onModelAdd);
    monaco.editor.getModels().forEach(onModelAdd);
  }

  private async validate(resource: monaco.Uri): Promise<void> {
    // get the worker proxy
    const worker = await this.worker(resource);
    // call to validate method proxy from the language service and get errors
    const errorMarkers = await worker.doValidation(resource);
    // get the current model(editor or file) which is only one
    const model = monaco.editor.getModel(resource);
    // add the error markers and underline them with severity of Error
    if (!model) return;
    monaco.editor.setModelMarkers(model, languageID, errorMarkers.map(toDiagnostics));
  }
}

const toDiagnostics = (error: InsightError): monaco.editor.IMarkerData => {
  return {
    ...error,
    severity: monaco.MarkerSeverity.Error,
  };
};

export default DiagnosticsAdapter;
