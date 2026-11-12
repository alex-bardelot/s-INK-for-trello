# Release notes

All notable changes to this project are listed here, one entry per commit,
newest first.

## 0.3.3 — Note read permission for the lasso

- Reported on device: "file permission has not been requested, so related
  APIs cannot be called". `getLassoElements` is a file read API and needs
  `plugin.permission.FILE:READ`.
- Declared `plugin.permission.FILE:READ` in `PluginConfig.json`.
- The permission is requested when the plugin view opens (after the session
  check) and, if still missing, right before reading the lasso selection.
- New message when note access is refused; generic `ensurePermission`
  helper replacing the Internet-only one.
- Bumped the plugin to version 0.3.3 (`versionCode` 7).

## 0.3.2 — Read the lasso selection before opening the view

- Reported on device: error 904 "No lasso action has been performed". The
  host drops the lasso once the plugin view is shown, so reading the
  selection from the card screen always came too late.
- The lasso button now only emits its event (`showType` 0): the selection is
  read immediately in the button listener, then the view is opened with
  `PluginManager.showPluginView()` and the card flow uses that result.
- Removed the "Retry" button of the no-text screen (the lasso is gone by
  then) and added a hint to close, select again and press the button.
- Unit tests for reading the selection at press time.
- Bumped the plugin to version 0.3.2 (`versionCode` 6).

## 0.3.1 — More robust lasso text reading

- Reported on device: the lasso text was not recognized.
- Lasso reading now tries several strategies: recognition of strokes with the
  page size, then with the Manta fallback size, then of every selected
  element; text boxes fall back to `PluginNoteAPI.getLassoText()`; the
  recognition result is accepted as a string or an object with `text`.
- When no text is found, the screen shows a diagnostics block (SDK responses,
  element types, page size) plus "Retry" and "Write the card manually",
  which continues the card flow with empty fields.
- Unit test for the recognition result parsing.

## 0.3.0 — Create Trello cards from a lasso selection

- Added an "Add a Trello card" lasso toolbar button in NOTE, shown when the
  selection contains handwriting or text.
- The selection is read with the SDK: handwriting goes through the device's
  recognition engine (`recognizeElements`), text boxes are read as is.
- Card flow: board picker (favorites, last used board on top, "Show all
  boards" toggle), list picker (last used list of the board on top), review
  screen with editable title and description, then creation and confirmation.
- The last board and the last list of each board are remembered.
- The plugin view now opens on the feature of the pressed button.
- Trello client: board lists and card creation (JSON body).
- Shared `ChoiceList` component and a back button in `ScreenFrame`.
- Unit tests for ordering, title/description split, preferences, launch
  routing and the new client calls.
- Bumped the plugin to version 0.3.0 (`versionCode` 4).

## 0.2.1 — Paste the Trello token

- Added a "Paste token" button on the connection screen: the long-press
  paste menu of text fields does not work in the Supernote plugin view.
  It reads the clipboard through React Native's core Android clipboard
  module and connects at once when the content looks like a token.
- Explains when the clipboard is empty or cannot be read on the device.

## Unreleased — Trello API key

- Configured the SuperTrello Trello API key in `src/trello/config.ts`
  (public by design; user tokens remain the only secret).

## 0.2.0 — Trello account connection

- Added a dependency-free Trello REST client (`src/trello/`) built from the
  official documentation: current member, open boards, token revocation.
  Credentials are sent in the `Authorization` header, never in URLs.
- On opening, the plugin looks for a linked Trello account and validates it;
  a token rejected by Trello is forgotten, transient failures can be retried.
- Added the connection screen (manual token flow of `trello.com/1/authorize`)
  and the boards screen (starred first, disconnect button).
- Declared and requested the `plugin.permission.INTERNET` permission.
- Added a key/value store that uses the host's AsyncStorage module when it
  exists and falls back to memory, with a warning, otherwise.
- Added shared `ScreenFrame` and `Button` components; removed the greeting
  screen.
- Added unit tests for the Trello client and the session logic.
- Bumped the plugin to version 0.2.0 (`versionCode` 2).

## Unreleased — Remove tablet deployment script

- Removed `scripts/deploy.mjs` and its npm scripts / config: packages are now
  delivered through the official Supernote Partner sync (`MyStyle` folder).
- Documented the Supernote Partner sync in the README install steps.
- Kept the UTF-8 BOM removal from `PluginConfig.json`.

## Unreleased — Tablet deployment script (reverted)

- Added `scripts/deploy.mjs` to push the package to the tablet over Wi-Fi
  (Browse & Access) or adb. Reverted by the next commit.

## 0.1.0 — Project bootstrap

- Scaffolded the plugin from the official `@supernote-plugin/sn-plugin-template`
  (React Native 0.79.2, `sn-plugin-lib`).
- Added a SuperTrello toolbar button in NOTE and DOC that opens the plugin view.
- Added the home screen displaying "Hi SuperTrello" with a close button.
- Added a dependency-free localization layer following the tablet's system
  language (English, French, Japanese, Simplified and Traditional Chinese),
  with live updates of the UI and the toolbar button label.
- Added `PluginConfig.json` manifest with a stable plugin ID and icon.
- Added unit tests for locale resolution and catalog consistency.
- Added README, contributing guide, MIT license and editor/git settings.
- Removed the unused iOS project from the template.
