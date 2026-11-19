import {RattaFileSelector} from 'sn-plugin-lib';

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
 * The SDK starts Supernote's file selection screen over the plugin and
 * resolves with the absolute paths chosen, or nothing if the user left it.
 *
 * @returns The absolute path of the chosen file, or `null` if none was.
 */
export async function pickFile({
  title,
  confirmLabel,
}: PickFileOptions): Promise<string | null> {
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
}
