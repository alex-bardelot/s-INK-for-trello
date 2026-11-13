# Contributing to sINK

Thanks for your interest in improving sINK!

## Workflow

1. Fork the repository and create a branch from `main`.
2. Install dependencies with `npm ci`.
3. Make your change, with tests when relevant.
4. Run `npm run typecheck`, `npm run lint` and `npm test`; all must pass.
5. Add an entry to [RELEASE_NOTES.md](RELEASE_NOTES.md).
6. Open a pull request describing the change and how you tested it on a device.

## Conventions

- Code, comments and documentation are written in English.
- TypeScript for all source files under `src/`.
- Never hard-code user-facing text: add a key to every catalog in
  `src/i18n/locales/` and use `useTranslation()` / `i18n.t()`.
- Keep the UI e-ink friendly: black on white, no animations, large touch targets.
- Never change `pluginID` in `PluginConfig.json` or reuse a button id from
  `src/plugin/constants.ts`.
- Commit messages follow [Conventional Commits](https://www.conventionalcommits.org)
  (`feat:`, `fix:`, `docs:`, `chore:`...).
