import {FileUtils, PluginManager} from 'sn-plugin-lib';

import {i18n} from '../i18n';
import {
  ensureFileReadPermission,
  ensureStorageWritePermission,
  Permission,
} from '../plugin/permissions';
import {
  createDirectoryStore,
  DiagnosableStore,
  listedPath,
} from './directoryStore';
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
let directoryStore: DiagnosableStore | null = null;

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
    const native = findNativeStore();
    if (native) {
      deviceStore = native;
    } else {
      directoryStore = createDirectoryStore(
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
      deviceStore = directoryStore;
    }
    console.info(`[SuperTrello] Device storage: ${deviceStore.backend}`);
  }
  return deviceStore;
}

async function permissionState(permission: string): Promise<string> {
  try {
    return String(await PluginManager.hasPermission(permission));
  } catch (error) {
    return `error (${error instanceof Error ? error.message : error})`;
  }
}

/**
 * Lines describing the device storage, shown on screen to troubleshoot
 * saving on the tablet. Stored values are masked (only their length).
 */
export async function getStorageDiagnostics(): Promise<string[]> {
  const store = getDeviceStore();
  const lines = [`backend: ${store.backend}`];
  for (const [name, permission] of [
    ['FILE:READ', Permission.FileRead],
    ['FILE:WRITE', Permission.FileWrite],
    ['FILE:DELETE', Permission.FileDelete],
  ] as const) {
    lines.push(`${name}: ${await permissionState(permission)}`);
  }
  if (directoryStore && store === directoryStore) {
    const d = await directoryStore.diagnose();
    lines.push(
      `dir: ${d.rootDir ?? 'none'}`,
      `dir exists: ${d.rootExists ?? 'unknown'}`,
      `entry kind: ${d.entryKind}`,
      `entries: ${
        d.entries === null ? 'unreadable' : d.entries.join(', ') || 'none'
      }`,
    );
    try {
      // Shape of a listing entry (field names only, no values).
      const dir = await pluginDir();
      const first = dir ? ((await FileUtils.listFiles(dir)) ?? [])[0] : null;
      lines.push(
        `listFiles entry: ${
          first && typeof first === 'object'
            ? `object {${Object.keys(first).join(', ')}}`
            : typeof first
        }`,
      );
    } catch (error) {
      lines.push(
        `listFiles entry: error (${
          error instanceof Error ? error.message : error
        })`,
      );
    }
    try {
      lines.push(`seed: ${(await findSeedFile()) ?? 'none'}`);
    } catch (error) {
      lines.push(
        `seed: error (${error instanceof Error ? error.message : error})`,
      );
    }
    lines.push(`last error: ${d.lastError ?? 'none'}`);
  }
  return lines;
}
