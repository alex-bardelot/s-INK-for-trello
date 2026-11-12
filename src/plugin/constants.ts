/**
 * Supernote plugin constants.
 *
 * Values mirror the contract documented at https://docs.supernote.com.
 */

/** Toolbar placement of a plugin button (`PluginManager.registerButton`). */
export const ButtonType = {
  /** Main toolbar of NOTE and DOC. */
  Toolbar: 1,
  /** Lasso toolbar, shown when a lasso selection is active. */
  Lasso: 2,
  /** Text selection toolbar (DOC only). */
  Selection: 3,
} as const;

/** What happens when a plugin button is pressed. */
export const ButtonShowType = {
  /** Only emit the button event, do not open the plugin view. */
  EventOnly: 0,
  /** Open the plugin view. */
  ShowView: 1,
} as const;

/** Host applications in which a button can appear. */
export const AppType = {
  Note: 'NOTE',
  Doc: 'DOC',
} as const;

/**
 * Stable identifiers of the buttons registered by SuperTrello.
 * Never reuse or renumber an id once released.
 */
export const ButtonId = {
  Open: 100,
} as const;
