import {PluginManager} from 'sn-plugin-lib';

import {getSystemLocale, i18n, language, loadLanguageChoice} from '../i18n';
import {getDeviceStore} from '../storage/stores';
import {Permission} from './permissions';
import {
  captureLassoSelection,
  clearPendingBinding,
} from '../inkLink/lassoBinding';
import {logInkLink} from '../inkLink/diagnostics';
import {inspectLassoSelection} from '../inkLink/lassoInspect';
import {startInkLinkTaps} from '../inkLink/noteBridge';
import {refreshButtons, registerButtons} from './buttons';
import {ButtonId} from './constants';
import {handleButtonPress, openBoardsIntent} from './launchIntent';

const LOG_TAG = '[sINK]';
/** Longest wait for the host to say the view is open. */
const VIEW_OPEN_WAIT_MS = 3000;

/**
 * Applies the language saved in Settings, only if file read access is
 * already granted: no permission prompt at startup. The plugin view reads
 * it again when it opens.
 */
async function restoreLanguage(): Promise<void> {
  try {
    const permission = await PluginManager.hasPermission(Permission.FileRead);
    if (permission === 1 || permission === 2) {
      language.setChoice(await loadLanguageChoice(getDeviceStore()));
      logInkLink('startup: saved language applied');
    } else {
      logInkLink(`startup: saved language skipped (file read ${permission})`);
    }
  } catch (error) {
    console.warn(`${LOG_TAG} Failed to restore the language`, error);
    logInkLink(`startup: saved language failed: ${String(error)}`);
  }
}

function refreshButtonLabels(): void {
  refreshButtons().catch(error =>
    console.warn(`${LOG_TAG} Failed to refresh buttons`, error),
  );
}

/** Handles a press on one of the s-INK buttons. */
function onButtonPress(event: {id: number}): void {
  logInkLink(`button ${event.id} pressed`);
  if (event.id === ButtonId.LassoInspect) {
    inspectLassoSelection();
    return;
  }
  if (event.id === ButtonId.LassoLink) {
    // Read the selection while the lasso is active, then let the user pick
    // the card or board from the boards view.
    openBoardsIntent();
    captureLassoSelection().finally(() =>
      PluginManager.showPluginView().catch(error =>
        console.warn(`${LOG_TAG} Failed to show the plugin view`, error),
      ),
    );
    return;
  }
  if (event.id === ButtonId.Open) {
    clearPendingBinding();
  }
  // The lasso button does not open the view by itself: the selection must
  // be read before the host drops the lasso. The view then shows a
  // "recognizing" popup until the slow handwriting recognition is done.
  handleButtonPress(event.id, {
    // Recognition waits for the view, but not forever.
    openView: () =>
      Promise.race([
        PluginManager.showPluginView().then(() => {}),
        new Promise<void>(resolve => setTimeout(resolve, VIEW_OPEN_WAIT_MS)),
      ]),
  });
}

/**
 * Initializes the plugin runtime.
 *
 * Must be called once, right after `AppRegistry.registerComponent`, as
 * required by the Supernote SDK. Other SDK calls are only valid afterwards.
 */
export function bootstrapPlugin(): void {
  PluginManager.init();
  logInkLink('startup: plugin started');

  language.setSystemLanguage(getSystemLocale());

  PluginManager.registerLangListener({
    onMsg: (languageCode: string) => {
      language.setSystemLanguage(languageCode);
    },
  });

  startInkLinkTaps();

  // Button labels follow the language, whether the system's or the one
  // chosen in Settings; a change before the first registration is applied
  // right after it.
  let buttonsReady = false;
  let labelsStale = false;
  i18n.subscribe(() => {
    if (buttonsReady) {
      refreshButtonLabels();
    } else {
      labelsStale = true;
    }
  });

  // Registered right away, in the system language: the listener must not
  // wait for the language saved in Settings. While it waited, a stalled
  // read of the settings left the lasso buttons doing nothing.
  registerButtons()
    .then(registered =>
      logInkLink(
        `startup: buttons registered${registered ? '' : ' (one rejected)'}`,
      ),
    )
    .catch(error => {
      console.warn(`${LOG_TAG} Failed to register buttons`, error);
      logInkLink(`startup: button registration failed: ${String(error)}`);
    })
    .finally(() => {
      // The SDK requires buttons to be registered before the listener.
      PluginManager.registerButtonListener({onButtonPress});
      logInkLink('startup: button listener ready');
      buttonsReady = true;
      if (labelsStale) {
        refreshButtonLabels();
      }
    });

  restoreLanguage();
}
