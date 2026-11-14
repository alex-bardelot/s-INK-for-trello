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
 * Stable identifiers of the buttons registered by s-INK.
 * Never reuse or renumber an id once released.
 */
export const ButtonId = {
  Open: 100,
  LassoCreateCard: 101,
  /** Diagnostic: logs the selected elements (docs/ink-link-tracking.md). */
  LassoInspect: 102,
} as const;

/**
 * Lasso content types for which a lasso button is shown
 * (`editDataTypes` of `PluginManager.registerButton`).
 */
export const LassoDataType = {
  Stroke: 0,
  Title: 1,
  Image: 2,
  Text: 3,
  Link: 4,
  Geometry: 5,
} as const;
