import {KeyValueStore} from '../storage/keyValueStore';
import {
  hasApiKey,
  isTrelloApiError,
  normalizeToken,
  TrelloClient,
  TrelloMember,
} from '../trello';

/** Storage key of the Trello token. */
export const TOKEN_STORAGE_KEY = 'supertrello.trello.token';

/** Reasons why the user is not (or no longer) connected. */
export type SessionErrorCode =
  | 'missingApiKey'
  | 'permissionDenied'
  | 'malformedToken'
  | 'invalidToken'
  | 'network'
  | 'rateLimited'
  | 'unknown';

/**
 * Where the token is kept:
 * - `session`: in memory only, until the tablet restarts;
 * - `device`: also written (unencrypted) to the tablet, with the user's
 *   consent, so it survives a restart.
 */
export type TokenStorage = 'session' | 'device';

export type SessionState =
  | {status: 'checking'}
  | {status: 'signedOut'; error?: SessionErrorCode}
  | {status: 'connecting'}
  | {
      status: 'signedIn';
      member: TrelloMember;
      client: TrelloClient;
      tokenStorage: TokenStorage;
      /** `true` if saving the token on the tablet was asked for but failed. */
      saveFailed?: boolean;
    };

/** Collaborators of the session logic, injected to keep it testable. */
export interface SessionDeps {
  apiKey: string;
  /** Memory store, always holding the token while signed in. */
  sessionStore: KeyValueStore;
  /** Store on the tablet, written only when the user agrees. */
  deviceStore: KeyValueStore;
  /** Resolves `false` if the user refused network access. */
  ensureNetwork: () => Promise<boolean>;
  createClient: (token: string) => TrelloClient;
}

/** Maps any failure to a code the UI can explain. */
export function toSessionError(error: unknown): SessionErrorCode {
  if (!isTrelloApiError(error)) {
    return 'unknown';
  }
  switch (error.kind) {
    case 'unauthorized':
      return 'invalidToken';
    case 'network':
      return 'network';
    case 'rateLimited':
      return 'rateLimited';
    default:
      return 'unknown';
  }
}

async function readToken(store: KeyValueStore): Promise<string | null> {
  try {
    return await store.getItem(TOKEN_STORAGE_KEY);
  } catch (error) {
    console.warn(
      `[SuperTrello] Failed to read the token from ${store.backend}`,
      error,
    );
    return null;
  }
}

async function removeToken(store: KeyValueStore): Promise<boolean> {
  try {
    await store.removeItem(TOKEN_STORAGE_KEY);
    return true;
  } catch (error) {
    console.warn(
      `[SuperTrello] Failed to remove the token from ${store.backend}`,
      error,
    );
    return false;
  }
}

/**
 * Writes the token to the tablet (`remember`) or removes it from there.
 * @returns Where the token ended up, and whether saving failed.
 */
async function applyTokenStorage(
  deps: SessionDeps,
  token: string,
  remember: boolean,
): Promise<{tokenStorage: TokenStorage; saveFailed?: boolean}> {
  if (!remember) {
    await removeToken(deps.deviceStore);
    return {tokenStorage: 'session'};
  }
  try {
    await deps.deviceStore.setItem(TOKEN_STORAGE_KEY, token);
    return {tokenStorage: 'device'};
  } catch (error) {
    console.warn('[SuperTrello] Failed to save the token on the tablet', error);
    return {tokenStorage: 'session', saveFailed: true};
  }
}

async function signIn(
  deps: SessionDeps,
  token: string,
): Promise<
  | {status: 'signedOut'; error: SessionErrorCode}
  | {status: 'signedIn'; member: TrelloMember; client: TrelloClient}
> {
  if (!(await deps.ensureNetwork())) {
    return {status: 'signedOut', error: 'permissionDenied'};
  }
  const client = deps.createClient(token);
  const member = await client.getMe();
  return {status: 'signedIn', member, client};
}

/**
 * Looks for a Trello account linked to the plugin, run each time the plugin
 * view opens: first in memory, then on the tablet. The token is validated
 * against Trello; a token rejected by Trello is forgotten everywhere, while
 * transient failures (network, rate limit) keep it so the user can retry.
 */
export async function restoreSession(deps: SessionDeps): Promise<SessionState> {
  if (!hasApiKey(deps.apiKey)) {
    return {status: 'signedOut', error: 'missingApiKey'};
  }

  const deviceToken = await readToken(deps.deviceStore);
  const token = (await readToken(deps.sessionStore)) ?? deviceToken;
  if (!token) {
    return {status: 'signedOut'};
  }
  const tokenStorage: TokenStorage =
    deviceToken === token ? 'device' : 'session';

  try {
    const state = await signIn(deps, token);
    if (state.status !== 'signedIn') {
      return state;
    }
    await deps.sessionStore.setItem(TOKEN_STORAGE_KEY, token);
    return {...state, tokenStorage};
  } catch (error) {
    const code = toSessionError(error);
    if (code === 'invalidToken') {
      await removeToken(deps.sessionStore);
      await removeToken(deps.deviceStore);
    }
    return {status: 'signedOut', error: code};
  }
}

/**
 * Validates a token entered by the user. On success it is kept in memory
 * and, only if `remember` is set, also saved on the tablet.
 */
export async function connectWithToken(
  deps: SessionDeps,
  rawToken: string,
  remember: boolean,
): Promise<SessionState> {
  if (!hasApiKey(deps.apiKey)) {
    return {status: 'signedOut', error: 'missingApiKey'};
  }
  const token = normalizeToken(rawToken);
  if (!token) {
    return {status: 'signedOut', error: 'malformedToken'};
  }

  try {
    const state = await signIn(deps, token);
    if (state.status !== 'signedIn') {
      return state;
    }
    await deps.sessionStore.setItem(TOKEN_STORAGE_KEY, token);
    return {...state, ...(await applyTokenStorage(deps, token, remember))};
  } catch (error) {
    return {status: 'signedOut', error: toSessionError(error)};
  }
}

/**
 * Saves the current token on the tablet (`remember`) or removes it from
 * there while staying connected for the rest of the session.
 */
export async function setTokenRemembered(
  deps: SessionDeps,
  state: SessionState,
  remember: boolean,
): Promise<SessionState> {
  if (state.status !== 'signedIn') {
    return state;
  }
  const token = await readToken(deps.sessionStore);
  if (!token) {
    return state;
  }
  return {
    ...state,
    saveFailed: undefined,
    ...(await applyTokenStorage(deps, token, remember)),
  };
}

/**
 * Forgets the token (memory and tablet) and, best effort, revokes it on
 * Trello so it disappears from the user's authorized applications.
 */
export async function disconnect(
  deps: SessionDeps,
  client?: TrelloClient,
): Promise<SessionState> {
  await removeToken(deps.sessionStore);
  await removeToken(deps.deviceStore);
  await client
    ?.revokeToken()
    .catch(error =>
      console.warn('[SuperTrello] Failed to revoke the Trello token', error),
    );
  return {status: 'signedOut'};
}
