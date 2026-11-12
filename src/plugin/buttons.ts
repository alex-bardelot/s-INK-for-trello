import {Image} from 'react-native';
import {PluginManager} from 'sn-plugin-lib';

import {i18n} from '../i18n';
import {AppType, ButtonId, ButtonShowType, ButtonType} from './constants';

const ICON_URI = Image.resolveAssetSource(require('../../assets/icon.png')).uri;

/**
 * Registers the SuperTrello toolbar button with a label in the active locale.
 *
 * @returns `true` if the host accepted the registration.
 */
export async function registerButtons(): Promise<boolean> {
  return PluginManager.registerButton(
    ButtonType.Toolbar,
    [AppType.Note, AppType.Doc],
    {
      id: ButtonId.Open,
      name: i18n.t('button.toolbar.name'),
      icon: ICON_URI,
      showType: ButtonShowType.ShowView,
    },
  );
}

/**
 * Re-registers the buttons so their labels follow the system language.
 * The SDK exposes no "rename" API, hence the unregister/register cycle.
 *
 * @returns `true` if the host accepted the new registration.
 */
export async function refreshButtons(): Promise<boolean> {
  await PluginManager.unregisterButton(ButtonId.Open);
  return registerButtons();
}
