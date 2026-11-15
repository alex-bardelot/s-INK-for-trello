import {createContext, useContext} from 'react';

/**
 * Opens Settings over the current page. Provided by the app around every
 * page but Settings itself (and what opens over it), where it is `null`:
 * the frame of each page then shows the settings button.
 */
export const SettingsOpenerContext = createContext<(() => void) | null>(null);

/** The way to open Settings from this page, or `null` if it cannot. */
export function useSettingsOpener(): (() => void) | null {
  return useContext(SettingsOpenerContext);
}
