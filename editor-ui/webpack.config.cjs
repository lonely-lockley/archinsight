const path = require('path');
const NodePolyfillPlugin = require('node-polyfill-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');

/*
 * !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
 * A separate legacy config to build Monaco Web Workers. Build is orchestrated
 * by Gradle npm tasks. Web Workers built by Vite are broken!!!
 * !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
 */
module.exports = {
       entry: {
         'editor.worker': 'monaco-editor-core/esm/vs/editor/editor.worker.js',
         'insight.worker': './frontend/src/lang-service/insight.worker.ts',
       },
       mode: 'production',
       devtool: false,
       target: 'web',
       resolve: {
           extensions: ['.ts', '.tsx', '.js'],
       },
       optimization: {
           minimize: true,
       },
       module: {
           rules: [
               {
                   test: /\.tsx?/,
                   exclude: /.*node_modules.*/,
                   use: 'ts-loader',
               },
               {
                   test: /\.css$/i,
                   use: [MiniCssExtractPlugin.loader, 'css-loader'],
               },
           ],
       },
       output: {
           globalObject: 'self',
           path: path.resolve(__dirname, './frontend/generated/workers'),
           filename: (data) => {
               switch (data.chunk.name) {
                   case 'editor.worker':
                       return 'editor.worker.js';
                   case 'insight.worker':
                       return 'insight.worker.js';
                   default:
                       return '[name].js';
               }
           },
           clean: true,
       },
       plugins: [
           new NodePolyfillPlugin(),
           new MiniCssExtractPlugin(),
       ],
   };
