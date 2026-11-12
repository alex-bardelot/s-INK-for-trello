import {
  connectWithToken,
  disconnect,
  restoreSession,
  SessionDeps,
  setTokenRemembered,
  TOKEN_STORAGE_KEY,
} from '../src/session/trelloSession';
import {createMemoryStore, KeyValueStore} from '../src/storage/keyValueStore';
import {TrelloApiError, TrelloClient, TrelloMember} from '../src/trello';

const TOKEN = 'a'.repeat(64);
const MEMBER: TrelloMember = {
  id: 'm1',
  username: 'ada',
  fullName: 'Ada Lovelace',
  initials: 'AL',
  url: 'https://trello.com/ada',
};

function makeDeps(
  getMe: () => Promise<TrelloMember>,
  overrides: Partial<SessionDeps> = {},
) {
  const revokeToken = jest.fn().mockResolvedValue(undefined);
  const client = {getMe, revokeToken} as unknown as TrelloClient;
  const deps: SessionDeps = {
    apiKey: 'key',
    sessionStore: createMemoryStore(),
    deviceStore: createMemoryStore(),
    ensureNetwork: async () => true,
    createClient: jest.fn(() => client),
    ...overrides,
  };
  return {deps, client, revokeToken};
}

function failingStore(): KeyValueStore {
  const fail = async () => {
    throw new Error('read-only');
  };
  return {
    persistent: true,
    backend: 'failing',
    getItem: async () => null,
    setItem: fail,
    removeItem: fail,
  };
}

const unauthorized = async (): Promise<TrelloMember> => {
  throw new TrelloApiError('unauthorized', 'invalid token', 401);
};

describe('restoreSession', () => {
  it('asks to connect when no account is linked', async () => {
    const getMe = jest.fn();
    const {deps} = makeDeps(getMe);
    expect(await restoreSession(deps)).toEqual({status: 'signedOut'});
    expect(getMe).not.toHaveBeenCalled();
  });

  it('reports a missing API key before anything else', async () => {
    const {deps} = makeDeps(jest.fn(), {apiKey: ' '});
    expect(await restoreSession(deps)).toEqual({
      status: 'signedOut',
      error: 'missingApiKey',
    });
  });

  it('signs in with a token saved on the tablet', async () => {
    const {deps, client} = makeDeps(async () => MEMBER);
    await deps.deviceStore.setItem(TOKEN_STORAGE_KEY, TOKEN);
    expect(await restoreSession(deps)).toEqual({
      status: 'signedIn',
      member: MEMBER,
      client,
      tokenStorage: 'device',
    });
    expect(deps.createClient).toHaveBeenCalledWith(TOKEN);
    expect(await deps.sessionStore.getItem(TOKEN_STORAGE_KEY)).toBe(TOKEN);
  });

  it('signs in with a token kept in memory only', async () => {
    const {deps} = makeDeps(async () => MEMBER);
    await deps.sessionStore.setItem(TOKEN_STORAGE_KEY, TOKEN);
    const state = await restoreSession(deps);
    expect(state).toMatchObject({status: 'signedIn', tokenStorage: 'session'});
  });

  it('forgets a token rejected by Trello everywhere', async () => {
    const {deps} = makeDeps(unauthorized);
    await deps.sessionStore.setItem(TOKEN_STORAGE_KEY, TOKEN);
    await deps.deviceStore.setItem(TOKEN_STORAGE_KEY, TOKEN);
    expect(await restoreSession(deps)).toEqual({
      status: 'signedOut',
      error: 'invalidToken',
    });
    expect(await deps.sessionStore.getItem(TOKEN_STORAGE_KEY)).toBeNull();
    expect(await deps.deviceStore.getItem(TOKEN_STORAGE_KEY)).toBeNull();
  });

  it('keeps the token on network failures', async () => {
    const {deps} = makeDeps(async () => {
      throw new TrelloApiError('network', 'offline');
    });
    await deps.deviceStore.setItem(TOKEN_STORAGE_KEY, TOKEN);
    expect(await restoreSession(deps)).toEqual({
      status: 'signedOut',
      error: 'network',
    });
    expect(await deps.deviceStore.getItem(TOKEN_STORAGE_KEY)).toBe(TOKEN);
  });

  it('stops when network access is refused', async () => {
    const getMe = jest.fn();
    const {deps} = makeDeps(getMe, {ensureNetwork: async () => false});
    await deps.deviceStore.setItem(TOKEN_STORAGE_KEY, TOKEN);
    expect(await restoreSession(deps)).toEqual({
      status: 'signedOut',
      error: 'permissionDenied',
    });
    expect(getMe).not.toHaveBeenCalled();
  });
});

describe('connectWithToken', () => {
  it('keeps the token in memory only unless asked to save it', async () => {
    const {deps} = makeDeps(async () => MEMBER);
    const state = await connectWithToken(deps, ` ${TOKEN}\n`, false);
    expect(state).toMatchObject({status: 'signedIn', tokenStorage: 'session'});
    expect(await deps.sessionStore.getItem(TOKEN_STORAGE_KEY)).toBe(TOKEN);
    expect(await deps.deviceStore.getItem(TOKEN_STORAGE_KEY)).toBeNull();
  });

  it('saves the token on the tablet when the user agrees', async () => {
    const {deps} = makeDeps(async () => MEMBER);
    const state = await connectWithToken(deps, TOKEN, true);
    expect(state).toMatchObject({status: 'signedIn', tokenStorage: 'device'});
    expect(await deps.deviceStore.getItem(TOKEN_STORAGE_KEY)).toBe(TOKEN);
  });

  it('stays connected for the session when saving fails', async () => {
    const {deps} = makeDeps(async () => MEMBER, {deviceStore: failingStore()});
    const state = await connectWithToken(deps, TOKEN, true);
    expect(state).toMatchObject({
      status: 'signedIn',
      tokenStorage: 'session',
      saveFailed: true,
    });
  });

  it('rejects malformed input without calling Trello', async () => {
    const {deps} = makeDeps(jest.fn());
    expect(await connectWithToken(deps, 'hello', true)).toEqual({
      status: 'signedOut',
      error: 'malformedToken',
    });
    expect(deps.createClient).not.toHaveBeenCalled();
  });

  it('does not store a token rejected by Trello', async () => {
    const {deps} = makeDeps(unauthorized);
    expect(await connectWithToken(deps, TOKEN, true)).toEqual({
      status: 'signedOut',
      error: 'invalidToken',
    });
    expect(await deps.sessionStore.getItem(TOKEN_STORAGE_KEY)).toBeNull();
    expect(await deps.deviceStore.getItem(TOKEN_STORAGE_KEY)).toBeNull();
  });
});

describe('setTokenRemembered', () => {
  it('saves the token on the tablet, then forgets it there', async () => {
    const {deps} = makeDeps(async () => MEMBER);
    const connected = await connectWithToken(deps, TOKEN, false);

    const saved = await setTokenRemembered(deps, connected, true);
    expect(saved).toMatchObject({status: 'signedIn', tokenStorage: 'device'});
    expect(await deps.deviceStore.getItem(TOKEN_STORAGE_KEY)).toBe(TOKEN);

    const forgotten = await setTokenRemembered(deps, saved, false);
    expect(forgotten).toMatchObject({
      status: 'signedIn',
      tokenStorage: 'session',
    });
    expect(await deps.deviceStore.getItem(TOKEN_STORAGE_KEY)).toBeNull();
    expect(await deps.sessionStore.getItem(TOKEN_STORAGE_KEY)).toBe(TOKEN);
  });
});

describe('disconnect', () => {
  it('removes the token everywhere and revokes it on Trello', async () => {
    const {deps, client, revokeToken} = makeDeps(async () => MEMBER);
    await connectWithToken(deps, TOKEN, true);
    expect(await disconnect(deps, client)).toEqual({status: 'signedOut'});
    expect(await deps.sessionStore.getItem(TOKEN_STORAGE_KEY)).toBeNull();
    expect(await deps.deviceStore.getItem(TOKEN_STORAGE_KEY)).toBeNull();
    expect(revokeToken).toHaveBeenCalled();
  });
});
