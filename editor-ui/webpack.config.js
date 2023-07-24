const path = require('path');
const NodePolyfillPlugin = require('node-polyfill-webpack-plugin');
const merge = require('webpack-merge');
const flowDefaults = require('./webpack.generated.js');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');

module.exports = merge(flowDefaults,
  // Override default configuration
   {
       entry: {
         'editor.worker': 'monaco-editor-core/esm/vs/editor/editor.worker.js',
         'insight.worker': './src/lang-service/insight.worker.ts',
       },
//       mode: 'development',
//       devtool: 'source-map'
       mode: 'production',
       devtool: false,
       target: 'web',
       resolve: {
           extensions: ['.ts', '.tsx', '.js'],
       },
       devServer: {
           historyApiFallback: true,
           compress: true,
           port: 8080,
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
   }
);
