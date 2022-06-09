module.exports = {
  root: false,
  env: {
    browser: true,
    es6: true,
  },
  extends: [
    'plugin:react/recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:prettier/recommended',
    'plugin:react-hooks/recommended',
    'plugin:sonarjs/recommended',
    'plugin:compat/recommended',
  ],
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaFeatures: {
      jsx: true,
    },
    ecmaVersion: 12,
    sourceType: 'module',
  },
  plugins: [
    'react',
    '@typescript-eslint/eslint-plugin',
    'prettier',
    'react-hooks',
    'compat',
    'sonarjs',
  ],
  rules: {
    '@typescript-eslint/no-explicit-any': 'off',
    'react/display-name': 'off',
    'prettier/prettier': ['error', { endOfLine: 'lf' }],
    'sonarjs/cognitive-complexity': 1,
    'sonarjs/no-identical-functions': 1,
    'sonarjs/no-duplicate-string': 1,
    'react-hooks/exhaustive-deps': 0,
  },
  settings: {
    react: {
      version: 'detect',
    },
  },
  ignorePatterns: ['webpack.config.js', '.eslintrc.js'],
};
