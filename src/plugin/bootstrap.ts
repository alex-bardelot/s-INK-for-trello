import {PluginManager} from 'sn-plugin-lib';

import {getSystemLocale, i18n} from '../i18n';
import {refreshButtons, registerButtons} from './buttons';
import {handleButtonPress} from './launchIntent';

const LOG_TAG = '[SuperTrello]';

/**
 * Initializes the plugin runtime.
 *
 * Must be called once, right after `AppRegistry.registerComponent`, as
 * required by the Supernote SDK. Other SDK calls are only valid afterwards.
 */
export function bootstrapPlugin(): void {
  PluginManager.init();

  i18n.setLocale(getSystemLocale());

  PluginManager.registerLangListener({
    onMsg: (languageCode: string) => {
      if (i18n.setLocale(languageCode)) {
        refreshButtons().catch(error =>
          console.warn(`${LOG_TAG} Failed to refresh buttons`, error),
        );
      }
    },
  });

  registerButtons()
    .then(registered => {
      if (!registered) {
        console.warn(`${LOG_TAG} A button registration was rejected`);
      }
    })
    .catch(error =>
      console.warn(`${LOG_TAG} Failed to register buttons`, error),
    )
    .finally(() => {
      // The SDK requires buttons to be registered before the listener.
      PluginManager.registerButtonListener({
        onButtonPress: event => {
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
