# SuperTrello

A [Supernote](https://supernote.com) plugin that brings Trello boards to your
e-ink tablet.

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
- **Add a Trello card** lasso button in NOTE: circle handwriting or text,
  press the button, pick a board (favorites, the last used one on top, or all
  boards on demand), pick a list (the last used one on top), review the
  recognized title and description, and create the card. The first line
  becomes the card title, the rest its description.
- UI follows the tablet's system language: English, French, Japanese,
  Simplified Chinese and Traditional Chinese. Unsupported languages fall back
  to English.

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

SuperTrello talks to the [Trello REST API](https://developer.atlassian.com/cloud/trello/rest/)
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

The package is written to `build/outputs/SuperTrello.snplg`.

### Install on the tablet

1. Get `SuperTrello.snplg` into the `MyStyle` folder of the device, either:
   - with the official **Supernote Partner** desktop app: copy the package
     into its local `Supernote/MyStyle` sync folder and let it sync, or
   - by copying it over USB.
2. On the tablet, sync if needed, then open **Settings → Apps → Plugins → Add Plugin** and pick
   `SuperTrello.snplg`.
3. Open a note or a document: the SuperTrello button appears in the toolbar.

### Connect a Trello account

1. Press the SuperTrello button and allow Internet access when asked.
2. Open the displayed address in a browser (the tablet's, or any other
   device's), sign in to Trello and press **Allow**.
3. Trello displays a token: copy it and press **Paste token** in the plugin
   (or type it and press **Connect**).

How the connection works and why:

- Trello's redirect-based flows need a WebView or a registered callback URL,
  which the Supernote host does not provide, so the manual token flow
  (`response_type=token` without `return_url`) is used.
- By default the token is only kept in memory: it survives closing the plugin
  view, but must be pasted again after the tablet restarts.
- Saving it on the tablet is opt-in: tick **Save the token on this tablet**
  when connecting, or press **Save on this tablet** on the boards screen. The
  plugin warns first that the token is then stored unencrypted, readable by
  anyone (or any plugin) with access to the tablet's files. **Forget on this
  tablet** removes it again while staying connected.
- The Supernote SDK has no file-writing or key/value API and plugins cannot
  ship native modules without a custom build. The token therefore goes to the
  host's AsyncStorage module when it is present; otherwise it is encoded into
  the names of empty directories under `<plugin directory>/state/`, the only
  persistent write the SDK allows (`FileUtils.makeDir` / `listFiles`). Board
  and list choices of the card flow are stored the same way.
- **Disconnect** forgets the token and revokes it on Trello. A token revoked
  from Trello's side is detected on the next opening.

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
│   ├── cards/               # Card creation logic (ordering, remembered choices)
│   ├── components/          # Shared UI components
│   ├── i18n/                # Localization (catalogs, locale resolution, hook)
│   │   └── locales/         # One JSON catalog per language
│   ├── platform/            # Host capability wrappers (clipboard)
│   ├── plugin/              # Supernote SDK integration (buttons, permissions, lasso text)
│   ├── screens/             # Screens
│   ├── session/             # Trello account lifecycle (restore, connect, disconnect)
│   ├── storage/             # Key/value storage with runtime backend detection
│   ├── trello/              # Trello REST client, authorization URL, types
│   └── theme.ts             # E-ink oriented design tokens
├── __tests__/               # Jest unit tests
├── android/                 # Native Android project (only used for native modules)
├── buildPlugin.ps1 / .sh    # Official packaging scripts (from the SDK template)
└── RELEASE_NOTES.md
```

## Localization

All user-facing strings live in `src/i18n/locales/<code>.json`. Codes match
those sent by the Supernote firmware (`en`, `fr`, `ja`, `zh_CN`, `zh_TW`).

- The initial language is read from the Android locale at startup.
- Language changes on the tablet are received through
  `PluginManager.registerLangListener`; open views re-render and the toolbar
  button label is refreshed.
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

SuperTrello is an independent community project. It is not affiliated with,
endorsed by or sponsored by Ratta (Supernote) or Atlassian (Trello).
Supernote and Trello are trademarks of their respective owners.
