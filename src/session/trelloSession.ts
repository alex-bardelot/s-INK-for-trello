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

export type SessionState =
  | {status: 'checking'}
  | {status: 'signedOut'; error?: SessionErrorCode}
  | {status: 'connecting'}
  | {
      status: 'signedIn';
      member: TrelloMember;
      client: TrelloClient;
    };

/** Collaborators of the session logic, injected to keep it testable. */
export interface SessionDeps {
  apiKey: string;
  store: KeyValueStore;
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

async function signIn(deps: SessionDeps, token: string): Promise<SessionState> {
  if (!(await deps.ensureNetwork())) {
    return {status: 'signedOut', error: 'permissionDenied'};
  }
  const client = deps.createClient(token);
  const member = await client.getMe();
  return {status: 'signedIn', member, client};
}

/**
 * Looks for a Trello account linked to the plugin, run each time the plugin
 * view opens. A stored token is validated against Trello; a token rejected by
 * Trello is forgotten, while transient failures (network, rate limit) keep it
 * so the user can simply retry.
 */
export async function restoreSession(deps: SessionDeps): Promise<SessionState> {
  if (!hasApiKey(deps.apiKey)) {
    return {status: 'signedOut', error: 'missingApiKey'};
  }

  let token: string | null;
  try {
    token = await deps.store.getItem(TOKEN_STORAGE_KEY);
  } catch (error) {
    console.warn('[SuperTrello] Failed to read the stored token', error);
    token = null;
  }
  if (!token) {
    return {status: 'signedOut'};
  }

  try {
    return await signIn(deps, token);
  } catch (error) {
    const code = toSessionError(error);
    if (code === 'invalidToken') {
      await deps.store.removeItem(TOKEN_STORAGE_KEY).catch(() => undefined);
    }
    return {status: 'signedOut', error: code};
  }
}

/** Validates a token entered by the user and stores it on success. */
export async function connectWithToken(
  deps: SessionDeps,
  rawToken: string,
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
    if (state.status === 'signedIn') {
      await deps.store.setItem(TOKEN_STORAGE_KEY, token);
    }
    return state;
  } catch (error) {
    return {status: 'signedOut', error: toSessionError(error)};
  }
}

/**
 * Forgets the local token and, best effort, revokes it on Trello so it
 * disappears from the user's authorized applications.
 */
export async function disconnect(
  deps: SessionDeps,
  client?: TrelloClient,
): Promise<SessionState> {
  await deps.store
    .removeItem(TOKEN_STORAGE_KEY)
    .catch(error =>
      console.warn('[SuperTrello] Failed to remove the stored token', error),
    );
  await client
    ?.revokeToken()
    .catch(error =>
      console.warn('[SuperTrello] Failed to revoke the Trello token', error),
    );
  return {status: 'signedOut'};
}
