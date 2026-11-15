/**
 * Metro transformer: Markdown files become modules exporting their text
 * (used for RELEASE_NOTES.md, shown in Settings > About). Every other file
 * goes through React Native's usual Babel transformer.
 */
const upstream = require('@react-native/metro-babel-transformer');

module.exports.transform = function transform(params) {
  if (params.filename.endsWith('.md')) {
    return upstream.transform({
      ...params,
      src: `module.exports = ${JSON.stringify(params.src)};`,
    });
  }
  return upstream.transform(params);
};

module.exports.getCacheKey = upstream.getCacheKey;
