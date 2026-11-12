# SuperTrello

A [Supernote](https://supernote.com) plugin that brings Trello boards to your
e-ink tablet.

> **Status:** early development. The current build only installs the plugin
> and displays a localized greeting. See [RELEASE_NOTES.md](RELEASE_NOTES.md).

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

### Build the plugin package

```bash
npm run build:plugin        # Windows
npm run build:plugin:unix   # Linux / macOS
```

The package is written to `build/outputs/SuperTrello.snplg`.

### Install on the tablet

1. Connect the tablet over USB (or use Supernote Partner / Browse & Access).
2. Copy `SuperTrello.snplg` into the `MyStyle` folder of the device.
3. On the tablet, open **Settings → Apps → Plugins → Add Plugin** and pick
   `SuperTrello.snplg`.
4. Open a note or a document: the SuperTrello button appears in the toolbar.

To update, bump `versionCode` / `versionName` in `PluginConfig.json`, rebuild
and install the new package the same way.

## Project layout

```text
.
├── index.js                 # Plugin entry (jsMainPath), registers the root component
├── PluginConfig.json        # Plugin manifest read by the Supernote host
├── assets/                  # Icons and static assets
├── src/
│   ├── App.tsx              # Root component shown in the plugin view
│   ├── i18n/                # Localization (catalogs, locale resolution, hook)
│   │   └── locales/         # One JSON catalog per language
│   ├── plugin/              # Supernote SDK integration (init, buttons)
│   ├── screens/             # Screens
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
