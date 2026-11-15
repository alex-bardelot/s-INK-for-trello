import {createContext, useContext} from 'react';

import type {SettingsCategory} from '../screens/SettingsScreen';

/** Opens Settings over the current page, at the given category. */
export type SettingsOpener = (category: SettingsCategory) => void;

/**
 * Provided by the app around the pages, and `null` inside Settings itself
 * (and what opens over it). The navigation pages (boards, a board, a card)
 * name their category, and their frame shows the settings button.
 */
export const SettingsOpenerContext = createContext<SettingsOpener | null>(null);

/** The way to open Settings from this page, or `null` if it cannot. */
export function useSettingsOpener(): SettingsOpener | null {
  return useContext(SettingsOpenerContext);
}
