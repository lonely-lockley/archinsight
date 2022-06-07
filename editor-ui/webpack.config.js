const path = require('path');
const htmlWebpackPlugin = require('html-webpack-plugin');
const BundleAnalyzerPlugin = require('webpack-bundle-analyzer');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const NodePolyfillPlugin = require('node-polyfill-webpack-plugin');
const CopyPlugin = require('copy-webpack-plugin');

module.exports = (env) => ({
  entry: {
    app: './src/index.tsx',
    'editor.worker': 'monaco-editor-core/esm/vs/editor/editor.worker.js',
    'insight.worker': './src/app/insight-lang/insight.worker.ts',
  },
  mode: env.dev ? 'development' : 'production',
  devtool: env.dev ? 'source-map' : false,
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
    path: path.resolve(__dirname, 'dist'),
    clean: true,
  },
  resolve: {
    extensions: ['.ts', '.tsx', '.js'],
  },
  devServer: {
    historyApiFallback: true,
    compress: true,
    port: 8080,
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
  plugins: [
    new NodePolyfillPlugin(),
    new MiniCssExtractPlugin(),
    new htmlWebpackPlugin({
      template: 'static/template.html',
      favicon: 'static/favicon.ico',
      filename: 'index.html',
      templateParameters(compilation, assets, options) {
        return {
          compilation: compilation,
          webpack: compilation.getStats(),
          webpackConfig: compilation.options,
          htmlWebpackPlugin: {
            files: assets,
            options: options,
          },
          process,
        };
      },
    }),
    new CopyPlugin({
      patterns: [
        {
          from: 'static/api.json',
          to: 'api.json',
          toType: 'file',
        },
      ],
    }),
  ].concat(
    env.report
      ? [
          new BundleAnalyzerPlugin.BundleAnalyzerPlugin({
            analyzerMode: 'disabled',
            generateStatsFile: true,
            statsOptions: { source: false },
          }),
        ]
      : [],
  ),
});
