module.exports = {
  preset: 'react-native',
  transform: {
    // RELEASE_NOTES.md is imported as text (see markdownTransformer.js).
    '\\.md$': '<rootDir>/jest/markdownTransform.js',
  },
};
