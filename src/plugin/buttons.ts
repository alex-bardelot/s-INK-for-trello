import {Image} from 'react-native';
import {PluginManager} from 'sn-plugin-lib';

import {i18n} from '../i18n';
import {
  AppType,
  ButtonId,
  ButtonShowType,
  ButtonType,
  LassoDataType,
} from './constants';

const ICON_URI = Image.resolveAssetSource(require('../../assets/icon.png')).uri;

/**
 * Registers the SuperTrello buttons with labels in the active locale:
 * - the toolbar button of NOTE and DOC, which opens the boards view;
 * - the lasso toolbar button of NOTE, shown when the selection contains
 *   handwriting or text, which turns the selection into a Trello card.
 *
 * @returns `true` if the host accepted every registration.
 */
export async function registerButtons(): Promise<boolean> {
  const results = await Promise.all([
    PluginManager.registerButton(
      ButtonType.Toolbar,
      [AppType.Note, AppType.Doc],
      {
        id: ButtonId.Open,
        name: i18n.t('button.toolbar.name'),
        icon: ICON_URI,
        showType: ButtonShowType.ShowView,
      },
    ),
    PluginManager.registerButton(ButtonType.Lasso, [AppType.Note], {
      id: ButtonId.LassoCreateCard,
      name: i18n.t('button.lasso.createCard'),
      icon: ICON_URI,
      showType: ButtonShowType.ShowView,
      editDataTypes: [LassoDataType.Stroke, LassoDataType.Text],
    }),
  ]);
  return results.every(Boolean);
}

/**
 * Re-registers the buttons so their labels follow the system language.
 * The SDK exposes no "rename" API, hence the unregister/register cycle.
 *
 * @returns `true` if the host accepted the new registrations.
 */
export async function refreshButtons(): Promise<boolean> {
  await Promise.all([
    PluginManager.unregisterButton(ButtonId.Open),
    PluginManager.unregisterButton(ButtonId.LassoCreateCard),
  ]);
  return registerButtons();
}
