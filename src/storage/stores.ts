import {FileUtils, PluginManager} from 'sn-plugin-lib';

import {i18n} from '../i18n';
import {
  ensureFileReadPermission,
  ensureStorageWritePermission,
} from '../plugin/permissions';
import {createDirectoryStore, listedPath} from './directoryStore';
import {
  createMemoryStore,
  findNativeStore,
  KeyValueStore,
} from './keyValueStore';

/** Sub-directory of the plugin directory holding the stored values. */
const STATE_DIR_NAME = 'state';

/** Small files of the plugin package, preferred as copy seeds. */
const SEED_SUFFIXES = ['.json', '.png', '.bundle'];

let sessionStore: KeyValueStore | null = null;
let deviceStore: KeyValueStore | null = null;

async function pluginDir(): Promise<string | null> {
  const dir = await PluginManager.getPluginDirPath();
  return dir ? dir.replace(/\/+$/, '') : null;
}

/** Picks an existing file of the plugin package to copy. */
async function findSeedFile(): Promise<string | null> {
  const dir = await pluginDir();
  if (!dir) {
    return null;
  }
  const paths = (await FileUtils.listFiles(dir)) ?? [];
  const files = paths
    .map(listedPath)
    .filter((path): path is string => path !== null)
    .map(path => (path.includes('/') ? path : `${dir}/${path}`));
  for (const suffix of SEED_SUFFIXES) {
    const match = files.find(path => path.toLowerCase().endsWith(suffix));
    if (match) {
      return match;
    }
  }
  return null;
}

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
 * it is bundled, otherwise entry names in the plugin directory.
 */
export function getDeviceStore(): KeyValueStore {
  if (!deviceStore) {
    deviceStore =
      findNativeStore() ??
      createDirectoryStore(
        async () => {
          const dir = await pluginDir();
          return dir ? `${dir}/${STATE_DIR_NAME}` : null;
        },
        FileUtils,
        {
          ensureWritable: () =>
            ensureStorageWritePermission(
              i18n.t('storage.writePermissionRationale'),
            ),
          ensureReadable: () =>
            ensureFileReadPermission(
              i18n.t('storage.writePermissionRationale'),
            ),
          findSeedFile,
        },
      );
    console.info(`[SuperTrello] Device storage: ${deviceStore.backend}`);
  }
  return deviceStore;
}
