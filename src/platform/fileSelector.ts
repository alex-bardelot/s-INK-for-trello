import {PluginManager, RattaFileSelector} from 'sn-plugin-lib';

import {logInkLink} from '../inkLink/diagnostics';

/** `selectType` of the SDK's file selector: one file, not a set. */
const SINGLE_FILE = 1;

export interface PickFileOptions {
  /** Shown at the top of the file manager. */
  title: string;
  /** Text of its top-right button. */
  confirmLabel: string;
}

/**
 * Opens the tablet's own file manager to choose one file, of any type.
 *
 * The SDK starts Supernote's file selection screen and resolves with the
 * absolute paths chosen, or nothing if the user left it. It offers no way
 * to bring that screen to the front, and the plugin view sometimes stays
 * over it. So the view is hidden while the file manager is open, and shown
 * again once it answered (or failed): the file manager covers the whole
 * screen anyway. The answer is a native promise, so it still arrives while
 * the view is hidden, when JavaScript timers would not. Each step goes to
 * the Diagnostics log (`attach:` lines).
 *
 * @returns The absolute path of the chosen file, or `null` if none was.
 */
export async function pickFile({
  title,
  confirmLabel,
}: PickFileOptions): Promise<string | null> {
  try {
    await PluginManager.closePluginView();
    logInkLink('attach: view hidden');
  } catch (error) {
    logInkLink(`attach: hiding the view failed (${String(error)})`);
  }
  try {
    const paths = await RattaFileSelector.selectFile({
      selectType: SINGLE_FILE,
      maxNum: 1,
      title,
      rightButtonText: confirmLabel,
    });
    const path = Array.isArray(paths)
      ? paths.find(candidate => typeof candidate === 'string' && candidate)
      : undefined;
    return path ?? null;
  } finally {
    try {
      await PluginManager.showPluginView();
      logInkLink('attach: view shown');
    } catch (error) {
      logInkLink(`attach: showing the view failed (${String(error)})`);
    }
  }
}
