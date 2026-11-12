# Release notes

All notable changes to this project are listed here, one entry per commit,
newest first.

## 0.7.0 — Focus mode

- New **Focus** switch in the board header (shown inverted when on). Focus
  mode keeps only the cards assigned to you that are not marked complete and
  that carry at least one of the Focus tags; lists left without any card are
  hidden.
- New **Tags** button, next to Focus while it is on, to pick the Focus tags
  (e.g. `TODO` and `WIP`) among the label names used on the board. Names are
  compared without case, so the choice applies to every board. With no tag
  checked, the tags are ignored.
- In Focus mode, lists are stacked one under another in the columns so that
  as much as possible fits on one page; a list that does not fit goes on in
  the next column with its header repeated (prefixed with `…`), and further
  columns go to the next pages (◀ ▶ buttons or two-finger swipe).
- The Focus switch and tags are remembered on the tablet.
- Bumped the plugin to version 0.7.0 (`versionCode` 17).

## 0.6.6 — Checkmark on completed cards

- Cards marked complete in Trello (`dueComplete`, the checkbox next to the
  card title) now show a black circle with a white ✓ before their name on the
  board view, with or without a due date. Screen readers announce it as
  "Complete" (translated in every locale).
- Bumped the plugin to version 0.6.6 (`versionCode` 16).

## 0.6.5 — New plugin icon

- Replaced the template's puzzle-piece icon with a SuperTrello icon: a board
  outline holding three kanban columns (two filled, one empty), pure black on
  transparent so it stays crisp on the e-ink screen.
- Bumped the plugin to version 0.6.5 (`versionCode` 15).

## 0.6.4 — Remove the storage diagnostics

- Saving the token now works on the device, so the "Storage diagnostics"
  button is removed from the connect and boards screens, along with the
  code behind it. The read-back check and the file fallback stay.
- Bumped the plugin to version 0.6.4 (`versionCode` 14).

## 0.6.3 — Read the Android shape of FileUtils.listFiles

- Likely cause of the token not being saved: on Android, `FileUtils.listFiles`
  resolves `{path, type}` objects although the SDK typings declare strings
  (also noted by the community plugin emilesilvis/handwritten-blog-supernote-plugin).
  Treating them as strings threw on every read, so nothing could be found.
- Listing entries are now accepted as strings or objects (`path`, `filePath`,
  `name`, `fileName`), for the store and for the copy seed lookup.
- Storage diagnostics show the shape of a listing entry (field names only).
- Unit tests for both shapes.
- Verified on device: the saved token is found again after the tablet restarts.
- Bumped the plugin to version 0.6.3 (`versionCode` 13).

## 0.6.2 — More robust token saving, with storage diagnostics

- Reported on device: saving the token on the tablet did not work.
- Every write to the plugin directory is now read back; a value that cannot
  be found again counts as a failure instead of silently being lost.
- If the host does not list the empty directories back, entries are created
  as copies of a small file of the plugin package (`FileUtils.copyFile`),
  and that mode is kept for the next writes.
- The storage asks for `FILE:READ` before listing the directory, including
  at startup when the saved token is looked for.
- New "Storage diagnostics" button on the connect and boards screens:
  backend, permission states, plugin directory, entries (values masked,
  only their length), copy seed and last error.
- Unit tests for the read-back check, the file fallback and the masking.
- Bumped the plugin to version 0.6.2 (`versionCode` 12).

## 0.6.1 — More legible labels

- Reported on device: yellow labels did not stand out from the white card.
  Label chips now have a light grey outline.
- Mid-grey chips (e.g. purple, dark green) were hard to read with either
  text color: chips are now pushed to a dark shade with white text or a
  light shade with black text.
- Bumped the plugin to version 0.6.1 (`versionCode` 11).

## 0.6.0 — Board view rendering, labels and members

- List headers are now a dark grey band with white text; the outline around
  each list is gone.
- Cards show their labels as grey chips (each Trello color keeps its relative
  lightness; unnamed labels are short bars) and their members as round
  avatars (photo, or initials when there is none), up to 3 then "+N".
- Cards now take the height they need (labels, title up to 3 lines, badges
  and members). They are measured in an invisible layer first and pages hold
  only the cards that fit entirely, so none is cut or drawn under the page
  buttons.
- The refresh button shows a text label: the ⟳ glyph is missing from the
  tablet's font.
- Trello client: card labels and members, board members
  (`GET /1/boards/{id}/members`). Grey tokens added to the theme.
- Bumped the plugin to version 0.6.0 (`versionCode` 10).

## 0.5.0 — Board view

- Pressing a board in "Your boards" opens it: its open lists are shown side
  by side with their cards (title on up to 2 lines, due date, checklist
  progress, description marker).
- 2 lists side by side in portrait and 3 in landscape by default. A header
  button switches between 1, 2 and 3 lists; the choice is remembered per
  orientation.
- Lists and cards are browsed page by page instead of scrolling (slow on
  E Ink): ◀ ▶ under the lists, ▲ ▼ under each list. Cards have a fixed
  height and a page only holds the cards that fit entirely, so they are
  never drawn under the page buttons.
- Two-finger swipe, like turning pages in a document: left/right for the
  next/previous lists, up/down on a list for its next/previous cards.
- Refresh button in the header. `ScreenFrame` accepts extra header actions.
- Trello client: open cards of a board (`GET /1/boards/{id}/cards`).
- Unit tests for paging, swipe detection, preferences and the new client call.
- Bumped the plugin to version 0.5.0 (`versionCode` 9).

## 0.4.0 — Opt-in saving of the Trello token on the tablet

- The token is now always kept in memory first: it survives closing the
  plugin view, and must be pasted again after the tablet restarts.
- Saving it on the tablet is the user's explicit choice: a "Save the token on
  this tablet" checkbox (unticked by default) on the connect screen, with a
  warning that the token is then stored unencrypted and readable by anyone or
  any plugin with access to the tablet's files.
- The boards screen tells where the token is kept, with "Save on this
  tablet" (after a confirmation showing the same warning) and "Forget on this
  tablet" (stays connected for the session). Disconnecting deletes it
  everywhere and revokes it on Trello.
- New persistent backend for hosts without AsyncStorage: since plugins
  cannot write files, values are encoded into the names of empty directories
  under `<plugin directory>/state/` (`FileUtils.makeDir` / `listFiles` /
  `deleteDir`), split into chunks when long. The last board and list of the
  card flow are stored there too.
- Declared `plugin.permission.FILE:WRITE` and `FILE:DELETE`; they are only
  requested when something is actually written to the tablet.
- Unit tests for the directory store and the opt-in session logic.
- Bumped the plugin to version 0.4.0 (`versionCode` 8).

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
