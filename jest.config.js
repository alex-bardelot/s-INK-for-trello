module.exports = {
  preset: 'react-native',
  setupFiles: ['<rootDir>/jest/noNetwork.js'],
  transform: {
    // RELEASE_NOTES.md is imported as text (see markdownTransformer.js).
    '\\.md$': '<rootDir>/jest/markdownTransform.js',
  },
};
