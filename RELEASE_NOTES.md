# Release notes

All notable changes to this project are listed here, one entry per commit,
newest first.

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
