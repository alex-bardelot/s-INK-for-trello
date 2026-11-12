/**
 * Trello application settings.
 *
 * The API key identifies SuperTrello to Trello. Per the Trello documentation
 * it is meant to be public: on its own it grants no access to any user data
 * (only a user-issued token does), so it is safe to ship in the bundle.
 *
 * To get one: create a Power-Up at https://trello.com/apps/admin, open its
 * "Trello Auth" tab and select "Generate a new API Key". Then paste it below.
 *
 * @see https://developer.atlassian.com/cloud/trello/guides/rest-api/authorization/
 */
export const TRELLO_API_KEY = '1dd2751a51e6e9b628f86a3063078cb5';

/** Application name shown to the user on the Trello authorization page. */
export const TRELLO_APP_NAME = 'SuperTrello';

/**
 * Permissions requested from the user. `write` is requested up front so that
 * upcoming card features do not force everyone to authorize again.
 */
export const TRELLO_SCOPES = ['read', 'write'] as const;

/** Base URL of the Trello REST API (version 1). */
export const TRELLO_API_BASE_URL = 'https://api.trello.com/1';

/** Base URL of the Trello authorization page. */
export const TRELLO_AUTHORIZE_URL = 'https://trello.com/1/authorize';

/** Maximum duration of a single API request, in milliseconds. */
export const TRELLO_REQUEST_TIMEOUT_MS = 15_000;

/** Returns `true` when an API key has been configured for this build. */
export function hasApiKey(apiKey: string = TRELLO_API_KEY): boolean {
  return apiKey.trim().length > 0;
}
