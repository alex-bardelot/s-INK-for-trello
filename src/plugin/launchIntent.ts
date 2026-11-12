import {useSyncExternalStore} from 'react';

import {ButtonId} from './constants';

/** What the plugin view was opened for. */
export type LaunchIntent =
  | {kind: 'boards'}
  /** `requestId` changes on every press, to restart the flow. */
  | {kind: 'lassoCreateCard'; requestId: number};

type Listener = () => void;

let current: LaunchIntent = {kind: 'boards'};
let requestCounter = 0;
const listeners = new Set<Listener>();

/** Records which SuperTrello button was pressed. */
export function handleButtonPress(buttonId: number): void {
  if (buttonId === ButtonId.LassoCreateCard) {
    requestCounter += 1;
    current = {kind: 'lassoCreateCard', requestId: requestCounter};
  } else if (buttonId === ButtonId.Open) {
    current = {kind: 'boards'};
  } else {
    return;
  }
  listeners.forEach(listener => listener());
}

export function getLaunchIntent(): LaunchIntent {
  return current;
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** React hook returning the current launch intent. */
export function useLaunchIntent(): LaunchIntent {
  return useSyncExternalStore(subscribe, getLaunchIntent);
}
