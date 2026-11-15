# s-INK for Trello®

A [Supernote](https://supernote.com) plugin that brings Trello boards to your
e-ink tablet. The name mixes *sync* and *ink*.

> **Status:** early development. The current build connects a Trello account,
> lists its open boards and turns lasso selections into Trello cards. See [RELEASE_NOTES.md](RELEASE_NOTES.md).

## Compatibility

| Item              | Version                         |
| ----------------- | ------------------------------- |
| Device            | Supernote Manta (A5 X2)         |
| Firmware          | Chauvet 3.31.45 or later        |
| React Native      | 0.79.2 (imposed by the host)    |
| Plugin SDK        | [`sn-plugin-lib`](https://www.npmjs.com/package/sn-plugin-lib) |

Other Supernote devices that support plugins may work but are not tested.

## Features

- Toolbar button in NOTE and DOC that opens the plugin view.
- Trello account connection: on opening, the plugin looks for a linked
  account and validates it; otherwise it guides the user through Trello's
  authorization page. Once connected, the open boards are listed (starred
  first).
- **New Trello Card** lasso button in NOTE: circle handwriting or text,
  press the button (a "recognizing" popup shows while the handwriting is
  recognized), pick a board (favorites, the last used one on top, or all
  boards on demand), pick a list (the last used one on top), review the
  recognized title, description and checklist, and create the card. The
  first line becomes the card title, the rest its description, and every
  line starting with a square (`☐`, `□`, `[ ]`; ticked: `☑`, `■`, `[x]`)
  an item of a `Check-list` checklist.
- **Start** button on the cards of boards the member can edit: assigns the
  member, swaps labels (e.g. removes `TODO`, adds `WIP`), moves the card to
  a chosen list and creates a note for it,
  `Note/s-INK for Trello/{board name}/{card name}.note`, titled with an
  s-INK link to the card, on a blank page, a Supernote template or one of
  the user's own (PNG images of `MyStyle`). Each action is set, or turned
  off, in
  Settings > Start work; the card's **Note** button opens its note again.
- UI in English, French, Japanese, Simplified Chinese and Traditional
  Chinese. By default it follows the tablet's system language (unsupported
  languages fall back to English); Settings > General > Language can fix
  another one.

## Getting started

### Prerequisites

- Node.js 18 or later
- Windows PowerShell 5.1+ (Windows) or Bash (Linux/macOS) for packaging
- JDK 17+ and the Android SDK are **only** needed if native Android modules
  are added later (see the
  [official environment guide](https://docs.supernote.com/en/environment)).

### Install dependencies

```bash
npm ci
```

### Quality checks

```bash
npm run typecheck
npm run lint
npm test
```

### Configure the Trello API key

s-INK talks to the [Trello REST API](https://developer.atlassian.com/cloud/trello/rest/)
directly with `fetch`; there is no official Trello SDK for JavaScript.
Each build needs a Trello API key:

1. Create a Power-Up at <https://trello.com/apps/admin> (any workspace).
2. Open its **Trello Auth** tab and select **Generate a new API Key**.
3. Paste the key in `TRELLO_API_KEY` in `src/trello/config.ts`.

The API key is public by design (it grants no access on its own); the token
each user generates is the secret, and it never leaves the tablet except in
the `Authorization` header of requests to `api.trello.com`.

### Build the plugin package

```bash
npm run build:plugin        # Windows
npm run build:plugin:unix   # Linux / macOS
```

The package is written to `build/outputs/sINKforTrello.snplg`.

### Install on the tablet

1. Get `sINKforTrello.snplg` into the `MyStyle` folder of the device, either:
   - with the official **Supernote Partner** desktop app: copy the package
     into its local `Supernote/MyStyle` sync folder and let it sync, or
   - by copying it over USB.
2. On the tablet, sync if needed, then open **Settings → Apps → Plugins → Add Plugin** and pick
   `sINKforTrello.snplg`.
3. Open a note or a document: the s-INK button appears in the toolbar.

### Connect a Trello account

Without an account, the boards page already shows Supernote's public
roadmap (read with the API key only), a **+** card to add other public
boards, and, under **My boards**, a **Connect your Trello account** card
that opens the connection screen. The same button is in **Settings**, whose
switch "Show “Connect your Trello account” on the boards page" hides the My
boards section for those who only read public boards.

1. Press the s-INK button, then **Connect your Trello account**, and allow
   Internet access when asked.
2. In step 1, press **Open in browser** (or scan the QR code with a phone),
   sign in to Trello and press **Allow**.
3. Come back to the plugin: the token travels back through the
   [s-INK relay](relay/README.md), end-to-end encrypted, and the plugin
   connects by itself.
4. As a fallback (relay unreachable, or no relay configured), open Trello's
   page directly (under **Show the address**), copy the token it displays
   and come back: the plugin watches the clipboard while the connection page
   is open and connects as soon as a token is copied. You can also press
   **Paste token**, or type it: the plugin says when it looks like a complete
   token, and only then enables **Connect**.

How the connection works and why:

- Trello's redirect-based flows need a WebView or a registered callback URL,
  which the Supernote host does not provide. The plugin therefore uses a
  small relay (`relay/`, a Cloudflare Worker) that receives the token from
  the browser, encrypted with a key only the tablet knows, and hands it to
  the plugin once. Without a relay, the manual token flow
  (`response_type=token` without `return_url`) remains available.
- By default the token is only kept in memory: it survives closing the plugin
  view, but must be pasted again after the tablet restarts.
- Saving it on the tablet is opt-in: choose **Stay connected: After
  restarts** in step 1 of the connection page, or press **Save on this tablet** in **Settings**. The
  plugin warns first that the token is then stored unencrypted, readable by
  anyone (or any plugin) with access to the tablet's files. **Forget on this
  tablet** removes it again while staying connected.
- The Supernote SDK has no file-writing or key/value API and plugins cannot
  ship native modules without a custom build. The token therefore goes to the
  host's AsyncStorage module when it is present; otherwise it is encoded into
  the names of empty directories under `<plugin directory>/state/`, the only
  persistent write the SDK allows (`FileUtils.makeDir` / `listFiles`). Board
  and list choices of the card flow are stored the same way.
- **Disconnect** (in **Settings**, after a confirmation) forgets the token
  and revokes it on Trello. A token revoked from Trello's side is detected on
  the next opening.

To update, bump `versionCode` / `versionName` in `PluginConfig.json`, rebuild
and install the new package the same way.

## Project layout

```text
.
├── index.js                 # Plugin entry (jsMainPath), registers the root component
├── PluginConfig.json        # Plugin manifest read by the Supernote host
├── assets/                  # Icons and static assets
├── src/
│   ├── App.tsx              # Root component, routes on session state and pressed button
│   ├── board/               # Board view logic (columns, pages, labels, Focus mode)
│   ├── boards/              # Boards page logic (sections, tile shades, pages)
│   ├── cards/               # Card creation logic (ordering, remembered choices)
│   ├── components/          # Shared UI components
│   ├── i18n/                # Localization (catalogs, locale resolution, hook)
│   │   └── locales/         # One JSON catalog per language
│   ├── platform/            # Host capability wrappers (clipboard)
│   ├── qr/                  # Dependency-free QR code encoder
│   ├── plugin/              # Supernote SDK integration (buttons, permissions, lasso text)
│   ├── screens/             # Screens
│   ├── session/             # Trello account lifecycle (restore, connect, disconnect)
│   ├── storage/             # Key/value storage with runtime backend detection
│   ├── trello/              # Trello REST client, authorization URL, types
│   └── theme.ts             # E-ink oriented design tokens
├── __tests__/               # Jest unit tests
├── relay/                   # Cloudflare Worker for copy-free sign-in (see relay/README.md)
├── android/                 # Native Android project (only used for native modules)
├── buildPlugin.ps1 / .sh    # Official packaging scripts (from the SDK template)
├── deployPlugin.ps1         # Build + copy the .snplg to the Partner app's MyStyle folder
└── RELEASE_NOTES.md
```

## Localization

All user-facing strings live in `src/i18n/locales/<code>.json`. Codes match
those sent by the Supernote firmware (`en`, `fr`, `ja`, `zh_CN`, `zh_TW`).

- The initial language is read from the Android locale at startup.
- Language changes on the tablet are received through
  `PluginManager.registerLangListener`; open views re-render and the toolbar
  button label is refreshed.
- `LanguageController` (`src/i18n/language.ts`) applies the language chosen
  in Settings, saved under `supertrello.language`; "system" keeps following
  the tablet.
- `en.json` is the reference catalog. A unit test ensures that every catalog
  defines exactly the same keys.

Use strings in components with the `useTranslation` hook:

```tsx
const {t} = useTranslation();
return <Text>{t('home.greeting')}</Text>;
```

To add a language, create `src/i18n/locales/<code>.json`, register it in
`src/i18n/catalogs.ts` and, if needed, extend `src/i18n/resolveLocale.ts`.

## Contributing

Contributions are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE)

## Disclaimer

s-INK for Trello® is an independent community project. It is not affiliated,
associated, authorized, endorsed by, or in any way officially connected with
Trello, Inc., Atlassian or Ratta (Supernote). Trello® is a registered
trademark of Atlassian; Supernote is a trademark of Ratta. Both are used here
only to describe what the plugin works with.
