/**
 * Plugin entry point (referenced by `jsMainPath` in PluginConfig.json).
 *
 * The component name registered here must match `pluginKey` in
 * PluginConfig.json, otherwise the Supernote host cannot start the plugin.
 *
 * @format
 */

import {AppRegistry} from 'react-native';

import {name as appName} from './app.json';
import App from './src/App';
import {bootstrapPlugin} from './src/plugin/bootstrap';

AppRegistry.registerComponent(appName, () => App);

bootstrapPlugin();
