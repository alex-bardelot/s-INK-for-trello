import {PluginManager} from 'sn-plugin-lib';

/**
 * Plugin permissions used by sINK. Each one must also be declared in
 * the `uses-permissions` array of PluginConfig.json, otherwise the request
 * fails (error 1500).
 *
 * @see https://docs.supernote.com/en/plugin-base/permission
 */
export const Permission = {
  /** Network access, to reach the Trello API. */
  Internet: 'plugin.permission.INTERNET',
  /** Read access to notes, needed by `getLassoElements` (error 1503 otherwise). */
  FileRead: 'plugin.permission.FILE:READ',
  /** Creating the directories that hold saved settings (see `stores.ts`). */
  FileWrite: 'plugin.permission.FILE:WRITE',
  /** Deleting those directories when a setting changes or is forgotten. */
  FileDelete: 'plugin.permission.FILE:DELETE',
} as const;

export type PermissionName = (typeof Permission)[keyof typeof Permission];

/** Request answers: 1 = allowed this time, 2 = always allowed. */
const GRANTED_STATES = new Set([1, 2]);

/**
 * Makes sure the plugin holds a permission, prompting the user if needed.
 *
 * Firmware without the permission system rejects these calls; the feature is
 * then attempted anyway and any failure surfaces through its own error.
 *
 * @param permission - The permission to check.
 * @param rationale - Shown by the host if the user previously denied access.
 * @returns `false` only if the user did not grant the permission.
 */
export async function ensurePermission(
  permission: PermissionName,
  rationale?: string,
): Promise<boolean> {
  try {
    const current = await PluginManager.hasPermission(permission);
    if (GRANTED_STATES.has(current)) {
      return true;
    }
    const answer = await PluginManager.requestPermission(permission, rationale);
    return GRANTED_STATES.has(answer);
  } catch (error) {
    console.warn('[sINK] Permission API unavailable', error);
    return true;
  }
}

/** Makes sure the plugin may access the network. */
export function ensureInternetPermission(rationale?: string): Promise<boolean> {
  return ensurePermission(Permission.Internet, rationale);
}

/** Makes sure the plugin may create and delete its storage directories. */
export async function ensureStorageWritePermission(
  rationale?: string,
): Promise<boolean> {
  return (
    (await ensurePermission(Permission.FileWrite, rationale)) &&
    (await ensurePermission(Permission.FileDelete, rationale))
  );
}

/** Makes sure the plugin may read the lasso selection of a note. */
export function ensureFileReadPermission(rationale?: string): Promise<boolean> {
  return ensurePermission(Permission.FileRead, rationale);
}
