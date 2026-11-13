# Project instructions

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
