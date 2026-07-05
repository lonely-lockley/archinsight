import 'monaco-editor/esm/vs/editor/editor.all.js';
import 'monaco-editor/esm/vs/base/browser/ui/codicons/codicon/codicon.css';
import 'monaco-editor/esm/vs/base/browser/ui/codicons/codicon/codicon-modifiers.css';
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import { mount } from 'svelte';
import WorkbenchApp from './WorkbenchApp.svelte';
import './workbench.css';

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
  mount(WorkbenchApp, {
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
  panel.style.margin = '16px';
  panel.style.padding = '12px';
  panel.style.whiteSpace = 'pre-wrap';
  panel.style.border = '1px solid #ff5c57';
  panel.style.background = '#2b1d1d';
  panel.style.color = '#f2f2f2';
  panel.textContent = `Archinsight webview failed to start:\n\n${message}`;
  target.append(panel);
}
