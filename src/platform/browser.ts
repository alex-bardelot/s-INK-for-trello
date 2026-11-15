import {AppState, Linking} from 'react-native';

import {logInkLink} from '../inkLink/diagnostics';

/** Past this delay, a browser that did not answer is reported. */
const BROWSER_TIMEOUT_MS = 3000;

/**
 * Opens a web page in the tablet's browser, keeping the plugin open
 * behind it. Resolves `false` if the browser failed or did not answer in
 * time. Each step goes to the Diagnostics log (`browser:` lines, host
 * only).
 */
export function openInBrowser(url: string): Promise<boolean> {
  const host = url.replace(/^[a-z]+:\/\/([^/?#]+).*$/i, '$1');
  logInkLink(`browser: opening ${host} (app ${AppState.currentState})`);
  return new Promise(resolve => {
    let settled = false;
    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true;
        logInkLink(`browser: no answer after ${BROWSER_TIMEOUT_MS} ms`);
        resolve(false);
      }
    }, BROWSER_TIMEOUT_MS);
    Linking.openURL(url)
      .then(result => {
        logInkLink(
          `browser: opened (${String(result)}, app ${AppState.currentState})`,
        );
        if (!settled) {
          settled = true;
          resolve(true);
        }
      })
      .catch(error => {
        console.warn('[sINK] Failed to open the browser', error);
        logInkLink(`browser: failed: ${String(error)}`);
        if (!settled) {
          settled = true;
          resolve(false);
        }
      })
      .finally(() => clearTimeout(timeout));
  });
}

/** `https://ko-fi.com/sink/` → `ko-fi.com/sink`, to print under a QR code. */
export function displayUrl(url: string): string {
  return url.replace(/^[a-z]+:\/\//i, '').replace(/\/$/, '');
}
