# Release notes

All notable changes to this project are listed here, one entry per commit,
newest first.

## Unreleased — Tablet deployment script

- Added `scripts/deploy.mjs` to push the plugin package to the tablet's
  `MyStyle` folder without manual copying:
  - over Wi-Fi through the built-in Browse & Access server (`npm run deploy`),
  - over USB with adb (`npm run deploy:adb`).
- Added `npm run build:deploy` to build and push in one step.
- Added optional, git-ignored `deploy.config.json` (see
  `deploy.config.example.json`) to store the tablet address.
- Linted Node.js scripts; removed the UTF-8 BOM from `PluginConfig.json`.

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
