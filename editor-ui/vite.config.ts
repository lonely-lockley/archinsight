import { UserConfigFn } from 'vite';
import { overrideVaadinConfig } from './vite.generated';
import monacoEditorPlugin from 'vite-plugin-monaco-editor';
import { NodeGlobalsPolyfillPlugin } from '@esbuild-plugins/node-globals-polyfill'
import { NodeModulesPolyfillPlugin } from '@esbuild-plugins/node-modules-polyfill'
import path from 'path';

var mep = monacoEditorPlugin({
                 customDistPath: (root, buildOutDir, base) => {
                                         return buildOutDir;
                                     },
                 languageWorkers: ['editorWorkerService'],
                 customWorkers: [
                    {
                      label: 'insight',
                      entry: path.resolve(__dirname, 'frontend/src/lang-service/insight.worker'),
                    },
                 ],
               });
//monkey patch transformIndexHtml so it won't add unnecessary script and break index.html
mep.transformIndexHtml = (html) => {
};

const customConfig: UserConfigFn = (env) => ({
  plugins: [mep],
});

export default overrideVaadinConfig(customConfig);
