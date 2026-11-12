import {TRELLO_APP_NAME, TRELLO_AUTHORIZE_URL, TRELLO_SCOPES} from './config';

export interface AuthorizeUrlOptions {
  apiKey: string;
  appName?: string;
  scopes?: readonly string[];
  expiration?: '1hour' | '1day' | '30days' | 'never';
}

/**
 * Builds the Trello authorization URL for the manual token flow.
 *
 * Without `return_url` / `callback_method`, Trello displays the token on the
 * page once the user presses "Allow", and the user copies it into the app.
 * This is the only flow available to the plugin: the Supernote host offers
 * neither a WebView nor a way to receive a redirect.
 *
 * @see https://developer.atlassian.com/cloud/trello/guides/rest-api/authorization/
 */
export function buildAuthorizeUrl({
  apiKey,
  appName = TRELLO_APP_NAME,
  scopes = TRELLO_SCOPES,
  expiration = 'never',
}: AuthorizeUrlOptions): string {
  const params: Array<[string, string]> = [
    ['key', apiKey.trim()],
    ['name', appName],
    ['scope', scopes.join(',')],
    ['expiration', expiration],
    ['response_type', 'token'],
  ];
  const query = params
    .map(([name, value]) => `${name}=${encodeURIComponent(value)}`)
    .join('&');
  return `${TRELLO_AUTHORIZE_URL}?${query}`;
}

/**
 * Trello tokens are alphanumeric: 64 hex characters for legacy tokens,
 * `ATTA` followed by hex characters for current ones.
 */
const TOKEN_PATTERN = /^[A-Za-z0-9]{32,128}$/;

/**
 * Cleans up a token typed or pasted by the user (surrounding text, spaces,
 * line breaks) and checks that it looks like a Trello token.
 *
 * @returns The normalized token, or `null` if the input cannot be a token.
 */
export function normalizeToken(raw: string): string | null {
  const token = raw.replace(/\s+/g, '');
  return TOKEN_PATTERN.test(token) ? token : null;
}
