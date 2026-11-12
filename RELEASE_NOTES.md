# Release notes

All notable changes to this project are listed here, one entry per commit,
newest first.

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
