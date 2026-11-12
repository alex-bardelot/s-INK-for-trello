#!/usr/bin/env node
/**
 * Pushes the built plugin package to the `MyStyle` folder of a Supernote
 * tablet, so it can be installed from Settings > Apps > Plugins without
 * copying files by hand.
 *
 * Two transports are supported:
 *
 *  - `wifi` (default): uses the tablet's built-in "Browse & Access" HTTP
 *    server (swipe down > Browse & Access). The popup must stay open on the
 *    tablet during the transfer. This protocol is not officially documented
 *    by Ratta and may change with firmware updates.
 *  - `adb`: uses `adb push` over USB. Requires sideloading / USB debugging to
 *    be enabled on the tablet and Android platform-tools on the PATH.
 *
 * Settings are read, by increasing priority, from `deploy.config.json`,
 * environment variables (SUPERNOTE_METHOD, SUPERNOTE_HOST, SUPERNOTE_PORT)
 * and command-line flags. Run with `--help` for details.
 */

import {execFileSync} from 'node:child_process';
import {existsSync, readFileSync} from 'node:fs';
import {basename, dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CONFIG_FILE = join(PROJECT_ROOT, 'deploy.config.json');
const DEVICE_FOLDER = 'MyStyle';
const ADB_DEVICE_PATH = `/sdcard/${DEVICE_FOLDER}/`;
const DEFAULT_PORT = 8089;
const HTTP_TIMEOUT_MS = 30_000;

const USAGE = `Usage: node scripts/deploy.mjs [options]

Options:
  -m, --method <wifi|adb>  Transport to use (default: wifi)
  -H, --host <address>     Tablet IP address shown by Browse & Access (wifi)
  -p, --port <number>      Browse & Access port (default: ${DEFAULT_PORT})
  -f, --file <path>        Package to send (default: build/outputs/<pluginKey>.snplg)
  -h, --help               Show this help

Defaults can be stored in deploy.config.json (see deploy.config.example.json).`;

class DeployError extends Error {}

/** Reads a JSON file, returning `undefined` when it does not exist. */
function readJson(path) {
  if (!existsSync(path)) {
    return undefined;
  }
  try {
    // Strip the UTF-8 BOM that Windows PowerShell adds when writing files.
    return JSON.parse(readFileSync(path, 'utf8').replace(/^﻿/, ''));
  } catch (error) {
    throw new DeployError(`Invalid JSON in ${path}: ${error.message}`);
  }
}

/** Merges config file, environment variables and CLI flags. */
function loadOptions(argv) {
  const {values} = parseArgs({
    args: argv,
    options: {
      method: {type: 'string', short: 'm'},
      host: {type: 'string', short: 'H'},
      port: {type: 'string', short: 'p'},
      file: {type: 'string', short: 'f'},
      help: {type: 'boolean', short: 'h'},
    },
    strict: true,
  });

  if (values.help) {
    console.log(USAGE);
    process.exit(0);
  }

  const config = readJson(CONFIG_FILE) ?? {};
  const env = process.env;
  const pluginKey = readJson(
    join(PROJECT_ROOT, 'PluginConfig.json'),
  )?.pluginKey;

  const options = {
    method: values.method ?? env.SUPERNOTE_METHOD ?? config.method ?? 'wifi',
    host: values.host ?? env.SUPERNOTE_HOST ?? config.host,
    port: Number(
      values.port ?? env.SUPERNOTE_PORT ?? config.port ?? DEFAULT_PORT,
    ),
    file: resolve(
      PROJECT_ROOT,
      values.file ?? config.file ?? `build/outputs/${pluginKey}.snplg`,
    ),
  };

  if (!['wifi', 'adb'].includes(options.method)) {
    throw new DeployError(
      `Unknown method "${options.method}" (expected wifi or adb).`,
    );
  }
  if (options.method === 'wifi' && !options.host) {
    throw new DeployError(
      'No tablet address. Pass --host <ip>, set SUPERNOTE_HOST or add "host" to deploy.config.json.',
    );
  }
  if (!Number.isInteger(options.port) || options.port <= 0) {
    throw new DeployError(`Invalid port "${options.port}".`);
  }
  if (!existsSync(options.file)) {
    throw new DeployError(
      `Package not found: ${options.file}\nRun "npm run build:plugin" first.`,
    );
  }
  return options;
}

/** Uploads the package through the Browse & Access HTTP server. */
async function deployOverWifi({host, port, file}) {
  const url = `http://${host}:${port}/${DEVICE_FOLDER}`;
  const name = basename(file);
  const form = new FormData();
  form.append(
    'file',
    new Blob([readFileSync(file)], {type: 'application/octet-stream'}),
    name,
  );

  console.log(`Uploading ${name} to ${url} ...`);
  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
    });
  } catch (error) {
    throw new DeployError(
      `Cannot reach the tablet at ${host}:${port} (${
        error.cause?.code ?? error.message
      }).\n` +
        'Check that both devices are on the same Wi-Fi network and that the ' +
        'Browse & Access popup is open on the tablet.',
    );
  }

  if (!response.ok) {
    throw new DeployError(
      `Upload rejected: HTTP ${response.status} ${response.statusText}`,
    );
  }
}

/** Pushes the package over USB with adb. */
function deployOverAdb({file}) {
  const run = args => execFileSync('adb', args, {encoding: 'utf8'});

  let devices;
  try {
    devices = run(['devices'])
      .split(/\r?\n/)
      .slice(1)
      .filter(line => /\tdevice$/.test(line));
  } catch {
    throw new DeployError(
      'adb not found. Install Android platform-tools and add them to the PATH.',
    );
  }
  if (devices.length === 0) {
    throw new DeployError(
      'No authorized device. Connect the tablet over USB and enable sideloading / USB debugging.',
    );
  }
  if (devices.length > 1) {
    throw new DeployError(
      'Several adb devices connected; set ANDROID_SERIAL to pick one.',
    );
  }

  console.log(`Pushing ${basename(file)} to ${ADB_DEVICE_PATH} ...`);
  run(['push', file, ADB_DEVICE_PATH]);
}

async function main() {
  const options = loadOptions(process.argv.slice(2));
  if (options.method === 'adb') {
    deployOverAdb(options);
  } else {
    await deployOverWifi(options);
  }
  console.log(
    `Done. On the tablet: Settings > Apps > Plugins > Add Plugin > ${basename(
      options.file,
    )}`,
  );
}

main().catch(error => {
  console.error(
    error instanceof DeployError ? `Error: ${error.message}` : error,
  );
  process.exit(1);
});
