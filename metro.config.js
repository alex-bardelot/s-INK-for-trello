const {getDefaultConfig, mergeConfig} = require('@react-native/metro-config');

const defaultConfig = getDefaultConfig(__dirname);

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * Markdown files can be imported as text (see markdownTransformer.js).
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const config = {
    resolver: {
        useWatchman: !process.env.CI,
        sourceExts: [...defaultConfig.resolver.sourceExts, 'md'],
    },
    transformer: {
        babelTransformerPath: require.resolve('./markdownTransformer.js'),
    },
};

module.exports = mergeConfig(defaultConfig, config);
