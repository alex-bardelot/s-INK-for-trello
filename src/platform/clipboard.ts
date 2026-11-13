import {NativeModules, TurboModuleRegistry} from 'react-native';

interface ClipboardNativeModule {
  getString(): Promise<string>;
}

function isClipboardModule(value: unknown): value is ClipboardNativeModule {
  return (
    typeof (value as Partial<ClipboardNativeModule> | null)?.getString ===
    'function'
  );
}

/**
 * Looks up the clipboard module that still ships with React Native's Android
 * core (`ClipboardModule`). The deprecated `Clipboard` export of
 * `react-native` is not used: it logs a warning and throws if the module is
 * missing.
 */
function findClipboardModule(): ClipboardNativeModule | null {
  let candidate: unknown = NativeModules.Clipboard;
  if (!candidate) {
    try {
      candidate = TurboModuleRegistry.get('Clipboard');
    } catch {
      candidate = null;
    }
  }
  return isClipboardModule(candidate) ? candidate : null;
}

/** `true` if the host exposes the clipboard to the plugin. */
export function isClipboardAvailable(): boolean {
  return findClipboardModule() !== null;
}

/**
 * Reads the text currently in the clipboard.
 *
 * The long-press paste menu of text fields is not available in the Supernote
 * plugin view, hence this explicit access.
 *
 * @returns The text, or `null` if the clipboard is empty or unavailable.
 */
export async function readClipboardText(): Promise<string | null> {
  const module = findClipboardModule();
  if (!module) {
    return null;
  }
  try {
    const text = await module.getString();
    return text ? text : null;
  } catch (error) {
    console.warn('[sINK] Failed to read the clipboard', error);
    return null;
  }
}
