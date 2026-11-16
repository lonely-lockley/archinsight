import 'monaco-editor/editor/editor.all.js';
import EditorWorker from 'monaco-editor/editor/editor.worker.js?worker';
import { mount } from 'svelte';
import ControlsApp from './ControlsApp.svelte';
import './controls.css';

(self as unknown as { MonacoEnvironment: unknown }).MonacoEnvironment = {
  getWorker: () => new EditorWorker()
};

window.addEventListener('error', (event) => {
  renderStartupError(event.error ?? event.message);
});
window.addEventListener('unhandledrejection', (event) => {
  renderStartupError(event.reason);
});

try {
  mount(ControlsApp, {
    target: document.getElementById('app') ?? document.body
  });
} catch (error) {
  renderStartupError(error);
}

function renderStartupError(error: unknown): void {
  const target = document.getElementById('app') ?? document.body;
  const message = error instanceof Error ? `${error.message}\n\n${error.stack ?? ''}` : String(error);
  target.innerHTML = '';
  const panel = document.createElement('pre');
  panel.style.margin = '12px';
  panel.style.padding = '10px';
  panel.style.whiteSpace = 'pre-wrap';
  panel.style.border = '1px solid var(--vscode-inputValidation-errorBorder, #ff5c57)';
  panel.style.background = 'var(--vscode-inputValidation-errorBackground, #2b1d1d)';
  panel.style.color = 'var(--vscode-inputValidation-errorForeground, #f2f2f2)';
  panel.textContent = `Archinsight controls failed to start:\n\n${message}`;
  target.append(panel);
}
