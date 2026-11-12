module.exports = {
  root: true,
  extends: '@react-native',
  overrides: [
    {
      // Node.js tooling scripts.
      files: ['scripts/**/*.mjs'],
      env: {node: true},
      parser: 'espree',
      parserOptions: {ecmaVersion: 2022, sourceType: 'module'},
    },
  ],
};
