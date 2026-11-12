import {PluginManager} from 'sn-plugin-lib';

/**
 * Network access permission. It must also be declared in the
 * `uses-permissions` array of PluginConfig.json, otherwise the request fails.
 *
 * @see https://docs.supernote.com/en/plugin-base/permission
 */
export const INTERNET_PERMISSION = 'plugin.permission.INTERNET';

/** Permission states returned by the host: 1 = allowed this time, 2 = always. */
const GRANTED_STATES = new Set([1, 2]);

/**
 * Makes sure the plugin may access the network, prompting the user if needed.
 *
 * Firmware without the permission system rejects these calls; network access
 * is then attempted anyway and any failure surfaces as a network error.
 *
 * @param rationale - Shown by the host if the user previously denied access.
 * @returns `false` only if the user explicitly refused.
 */
export async function ensureInternetPermission(
  rationale?: string,
): Promise<boolean> {
  try {
    const current = await PluginManager.hasPermission(INTERNET_PERMISSION);
    if (GRANTED_STATES.has(current)) {
      return true;
    }
    const answer = await PluginManager.requestPermission(
      INTERNET_PERMISSION,
      rationale,
    );
    return GRANTED_STATES.has(answer);
  } catch (error) {
    console.warn('[SuperTrello] Permission API unavailable', error);
    return true;
  }
}
