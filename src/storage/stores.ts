import {FileUtils, PluginManager} from 'sn-plugin-lib';

import {i18n} from '../i18n';
import {ensureStorageWritePermission} from '../plugin/permissions';
import {createDirectoryStore} from './directoryStore';
import {
  createMemoryStore,
  findNativeStore,
  KeyValueStore,
} from './keyValueStore';

/** Sub-directory of the plugin directory holding the stored values. */
const STATE_DIR_NAME = 'state';

let sessionStore: KeyValueStore | null = null;
let deviceStore: KeyValueStore | null = null;

/**
 * Store kept in memory: it survives closing and reopening the plugin view,
 * but not a restart of the tablet. Nothing is written to the device.
 */
export function getSessionStore(): KeyValueStore {
  sessionStore ??= createMemoryStore();
  return sessionStore;
}

/**
 * Store that survives a restart of the tablet: the host's AsyncStorage when
 * it is bundled, otherwise directory names in the plugin directory.
 */
export function getDeviceStore(): KeyValueStore {
  if (!deviceStore) {
    deviceStore =
      findNativeStore() ??
      createDirectoryStore(
        async () => {
          const pluginDir = await PluginManager.getPluginDirPath();
          return pluginDir
            ? `${pluginDir.replace(/\/+$/, '')}/${STATE_DIR_NAME}`
            : null;
        },
        FileUtils,
        () =>
          ensureStorageWritePermission(
            i18n.t('storage.writePermissionRationale'),
          ),
      );
    console.info(`[SuperTrello] Device storage: ${deviceStore.backend}`);
  }
  return deviceStore;
}
