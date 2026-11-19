# Project instructions

## Commits

- Every commit is authored and committed as
  `Alexandre Bardelot <7009756+alex-bardelot@users.noreply.github.com>`.
  This repository's `.git/config` sets it; never commit with another
  e-mail (in particular not the global one) and never override it with
  `--author`, `-c user.email=…` or `GIT_AUTHOR_*` / `GIT_COMMITTER_*`.
- Before committing, if `git config user.email` does not print that
  address, set it with `git config user.email` (repository scope, not
  `--global`) instead of committing.

## Build and deploy

- At the end of every development task (once tests pass and the change is
  committed), build and deploy the plugin with exactly this command:

  ```
  powershell -ExecutionPolicy Bypass -File .\deployPlugin.ps1
  ```

  It runs `buildPlugin.ps1`, checks the package was rebuilt, and copies
  `build\outputs\sINKforTrello.snplg` to the Supernote Partner app's MyStyle folder.
  Use `-SkipBuild` to copy the last package without rebuilding.
- Run it as a single command, without chaining other commands (`;`, `|`) or
  redirecting its output, so it matches the permission allow rule and runs
  without a confirmation prompt.
- Do not build or copy the package by hand (`buildPlugin.ps1` + `Copy-Item`).
- If the deploy fails, report the error output; do not retry in a loop.
