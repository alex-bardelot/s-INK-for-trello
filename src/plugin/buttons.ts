import {Image} from 'react-native';
import {PluginManager} from 'sn-plugin-lib';

import {i18n} from '../i18n';
import {diagnosticsUnlocked} from '../settings/rapidTaps';
import {
  AppType,
  ButtonId,
  ButtonShowType,
  ButtonType,
  LassoDataType,
} from './constants';

const ICON_URI = Image.resolveAssetSource(require('../../assets/icon.png')).uri;

/**
 * Every registration with the host goes through this queue, one at a time:
 * two overlapping unregister/register cycles could leave a button
 * registered twice, or not at all.
 */
let queue: Promise<unknown> = Promise.resolve();

function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task);
  queue = run.catch(() => {});
  return run;
}

/** Labels and Diagnostics state of the last accepted registration. */
let registeredKey: string | null = null;

function buttonsKey(): string {
  return JSON.stringify([
    i18n.t('button.toolbar.name'),
    i18n.t('button.lasso.createCard'),
    i18n.t('button.lasso.link'),
    i18n.t('button.lasso.inspect'),
    diagnosticsUnlocked(),
  ]);
}

function registerInspect(): Promise<boolean> {
  return PluginManager.registerButton(ButtonType.Lasso, [AppType.Note], {
    id: ButtonId.LassoInspect,
    name: i18n.t('button.lasso.inspect'),
    icon: ICON_URI,
    // Only writes to the s-INK log; the view stays closed.
    showType: ButtonShowType.EventOnly,
    editDataTypes: [
      LassoDataType.Stroke,
      LassoDataType.Text,
      LassoDataType.Image,
      LassoDataType.Link,
    ],
  });
}

async function registerAll(): Promise<boolean> {
  const key = buttonsKey();
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
      // The view is opened by the button listener once the selection is read.
      showType: ButtonShowType.EventOnly,
      editDataTypes: [LassoDataType.Stroke, LassoDataType.Text],
    }),
    PluginManager.registerButton(ButtonType.Lasso, [AppType.Note], {
      id: ButtonId.LassoLink,
      name: i18n.t('button.lasso.link'),
      icon: ICON_URI,
      // The view is opened by the button listener once the selection is read.
      showType: ButtonShowType.EventOnly,
      editDataTypes: [
        LassoDataType.Stroke,
        LassoDataType.Text,
        LassoDataType.Geometry,
      ],
    }),
    diagnosticsUnlocked()
      ? registerInspect()
      : // A registration may outlive the run that unlocked it.
        PluginManager.unregisterButton(ButtonId.LassoInspect).then(() => true),
  ]);
  const accepted = results.every(Boolean);
  registeredKey = accepted ? key : null;
  return accepted;
}

/**
 * Registers the s-INK buttons with labels in the active locale:
 * - the toolbar button of NOTE and DOC, which opens the boards view;
 * - the lasso toolbar button of NOTE, shown when the selection contains
 *   handwriting or text, which turns the selection into a Trello card;
 * - the lasso button of NOTE that links the selection to a card or board;
 * - once Diagnostics is unlocked, a diagnostic lasso button of NOTE that
 *   logs the selected elements.
 *
 * @returns `true` if the host accepted every registration.
 */
export function registerButtons(): Promise<boolean> {
  return enqueue(registerAll);
}

/**
 * Registers the diagnostic lasso button "s-INK: Inspect", shown only once
 * the Diagnostics category of Settings is unlocked.
 *
 * @returns `true` if the host accepted it.
 */
export function registerInspectButton(): Promise<boolean> {
  return enqueue(async () => {
    const accepted = await registerInspect();
    registeredKey = accepted ? buttonsKey() : null;
    return accepted;
  });
}

/**
 * Re-registers the buttons so their labels follow the language. The SDK
 * exposes no "rename" API, hence the unregister/register cycle, skipped
 * when the labels did not change: while it runs, the lasso buttons are
 * missing from the note app.
 *
 * @returns `true` if the host accepted the new registrations, or if they
 *   were already up to date.
 */
export function refreshButtons(): Promise<boolean> {
  return enqueue(async () => {
    if (registeredKey === buttonsKey()) {
      return true;
    }
    await Promise.all([
      PluginManager.unregisterButton(ButtonId.Open),
      PluginManager.unregisterButton(ButtonId.LassoCreateCard),
      PluginManager.unregisterButton(ButtonId.LassoLink),
      PluginManager.unregisterButton(ButtonId.LassoInspect),
    ]);
    return registerAll();
  });
}
