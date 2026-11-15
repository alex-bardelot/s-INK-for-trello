import {PluginManager} from 'sn-plugin-lib';

import {getSystemLocale, i18n, language, loadLanguageChoice} from '../i18n';
import {getDeviceStore} from '../storage/stores';
import {Permission} from './permissions';
import {
  captureLassoSelection,
  clearPendingBinding,
} from '../inkLink/lassoBinding';
import {inspectLassoSelection} from '../inkLink/lassoInspect';
import {startInkLinkTaps} from '../inkLink/noteBridge';
import {refreshButtons, registerButtons} from './buttons';
import {ButtonId} from './constants';
import {handleButtonPress, openBoardsIntent} from './launchIntent';

const LOG_TAG = '[sINK]';

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
    }
  } catch (error) {
    console.warn(`${LOG_TAG} Failed to restore the language`, error);
  }
}

/**
 * Initializes the plugin runtime.
 *
 * Must be called once, right after `AppRegistry.registerComponent`, as
 * required by the Supernote SDK. Other SDK calls are only valid afterwards.
 */
export function bootstrapPlugin(): void {
  PluginManager.init();

  language.setSystemLanguage(getSystemLocale());

  PluginManager.registerLangListener({
    onMsg: (languageCode: string) => {
      language.setSystemLanguage(languageCode);
    },
  });

  startInkLinkTaps();

  // The buttons are registered in the language chosen in Settings.
  restoreLanguage()
    .then(registerButtons)
    .then(registered => {
      if (!registered) {
        console.warn(`${LOG_TAG} A button registration was rejected`);
      }
    })
    .catch(error =>
      console.warn(`${LOG_TAG} Failed to register buttons`, error),
    )
    .finally(() => {
      // Button labels follow the language, whether the system's or the
      // one chosen in Settings.
      i18n.subscribe(() => {
        refreshButtons().catch(error =>
          console.warn(`${LOG_TAG} Failed to refresh buttons`, error),
        );
      });
      // The SDK requires buttons to be registered before the listener.
      PluginManager.registerButtonListener({
        onButtonPress: event => {
          if (event.id === ButtonId.LassoInspect) {
            inspectLassoSelection();
            return;
          }
          if (event.id === ButtonId.LassoLink) {
            // Read the selection while the lasso is active, then let the
            // user pick the card or board from the boards view.
            openBoardsIntent();
            captureLassoSelection().finally(() =>
              PluginManager.showPluginView().catch(error =>
                console.warn(
                  `${LOG_TAG} Failed to show the plugin view`,
                  error,
                ),
              ),
            );
            return;
          }
          if (event.id === ButtonId.Open) {
            clearPendingBinding();
          }
          const intent = handleButtonPress(event.id);
          if (intent?.kind === 'lassoCreateCard') {
            // The lasso button does not open the view by itself: the
            // selection must be read before the host drops the lasso.
            intent.lasso.finally(() =>
              PluginManager.showPluginView().catch(error =>
                console.warn(
                  `${LOG_TAG} Failed to show the plugin view`,
                  error,
                ),
              ),
            );
          }
        },
      });
    });
}
