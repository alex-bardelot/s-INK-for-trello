import {useSyncExternalStore} from 'react';

import type {InkLinkTarget} from '../inkLink/inkLink';
import {ButtonId} from './constants';
import {LassoTextResult, readLassoText} from './lassoText';

/** What the plugin view was opened for. */
export type LaunchIntent =
  | {kind: 'boards'}
  | {
      kind: 'lassoCreateCard';
      /** Changes on every press, to restart the flow. */
      requestId: number;
      /**
       * Text of the lasso selection, read when the button was pressed: the
       * host drops the lasso once the plugin view is shown, after which the
       * lasso APIs fail with error 904 ("no lasso").
       */
      lasso: Promise<LassoTextResult>;
    }
  | {
      /** An s-INK link was tapped in a note. */
      kind: 'inkLink';
      /** Changes on every tap, to open the target again. */
      requestId: number;
      target: InkLinkTarget;
    };

/** Reads the current lasso selection. */
export type SelectionReader = () => Promise<LassoTextResult>;

type Listener = () => void;

let current: LaunchIntent = {kind: 'boards'};
let requestCounter = 0;
const listeners = new Set<Listener>();

async function readSafely(read: SelectionReader): Promise<LassoTextResult> {
  try {
    return await read();
  } catch (error) {
    return {ok: false, error: 'noSelection', diagnostics: String(error)};
  }
}

/**
 * Records which s-INK button was pressed. For the lasso button, the
 * selection is read right away, while the lasso is still active.
 *
 * @param buttonId - Id of the pressed button.
 * @param readSelection - Lasso reader, replaceable in tests.
 * @returns The new intent, or `null` if the button is not ours.
 */
export function handleButtonPress(
  buttonId: number,
  readSelection: SelectionReader = readLassoText,
): LaunchIntent | null {
  if (buttonId === ButtonId.LassoCreateCard) {
    requestCounter += 1;
    current = {
      kind: 'lassoCreateCard',
      requestId: requestCounter,
      lasso: readSafely(readSelection),
    };
  } else if (buttonId === ButtonId.Open) {
    current = {kind: 'boards'};
  } else {
    return null;
  }
  listeners.forEach(listener => listener());
  return current;
}

/** Records that an s-INK link was tapped, to open its card or board. */
export function openInkLinkIntent(target: InkLinkTarget): LaunchIntent {
  requestCounter += 1;
  current = {kind: 'inkLink', requestId: requestCounter, target};
  listeners.forEach(listener => listener());
  return current;
}

/** Shows the boards view, for example to pick what to link a selection to. */
export function openBoardsIntent(): LaunchIntent {
  current = {kind: 'boards'};
  listeners.forEach(listener => listener());
  return current;
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
