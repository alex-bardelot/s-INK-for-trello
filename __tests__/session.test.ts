import {
  connectWithToken,
  disconnect,
  restoreSession,
  SessionDeps,
  TOKEN_STORAGE_KEY,
} from '../src/session/trelloSession';
import {createMemoryStore} from '../src/storage/keyValueStore';
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
    store: createMemoryStore(),
    ensureNetwork: async () => true,
    createClient: jest.fn(() => client),
    ...overrides,
  };
  return {deps, client, revokeToken};
}

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

  it('signs in with a stored, valid token', async () => {
    const {deps, client} = makeDeps(async () => MEMBER);
    await deps.store.setItem(TOKEN_STORAGE_KEY, TOKEN);
    expect(await restoreSession(deps)).toEqual({
      status: 'signedIn',
      member: MEMBER,
      client,
    });
    expect(deps.createClient).toHaveBeenCalledWith(TOKEN);
  });

  it('forgets a token rejected by Trello', async () => {
    const {deps} = makeDeps(async () => {
      throw new TrelloApiError('unauthorized', 'invalid token', 401);
    });
    await deps.store.setItem(TOKEN_STORAGE_KEY, TOKEN);
    expect(await restoreSession(deps)).toEqual({
      status: 'signedOut',
      error: 'invalidToken',
    });
    expect(await deps.store.getItem(TOKEN_STORAGE_KEY)).toBeNull();
  });

  it('keeps the token on network failures', async () => {
    const {deps} = makeDeps(async () => {
      throw new TrelloApiError('network', 'offline');
    });
    await deps.store.setItem(TOKEN_STORAGE_KEY, TOKEN);
    expect(await restoreSession(deps)).toEqual({
      status: 'signedOut',
      error: 'network',
    });
    expect(await deps.store.getItem(TOKEN_STORAGE_KEY)).toBe(TOKEN);
  });

  it('stops when network access is refused', async () => {
    const getMe = jest.fn();
    const {deps} = makeDeps(getMe, {ensureNetwork: async () => false});
    await deps.store.setItem(TOKEN_STORAGE_KEY, TOKEN);
    expect(await restoreSession(deps)).toEqual({
      status: 'signedOut',
      error: 'permissionDenied',
    });
    expect(getMe).not.toHaveBeenCalled();
  });
});

describe('connectWithToken', () => {
  it('validates and stores the token', async () => {
    const {deps} = makeDeps(async () => MEMBER);
    const state = await connectWithToken(deps, ` ${TOKEN}\n`);
    expect(state.status).toBe('signedIn');
    expect(await deps.store.getItem(TOKEN_STORAGE_KEY)).toBe(TOKEN);
  });

  it('rejects malformed input without calling Trello', async () => {
    const {deps} = makeDeps(jest.fn());
    expect(await connectWithToken(deps, 'hello')).toEqual({
      status: 'signedOut',
      error: 'malformedToken',
    });
    expect(deps.createClient).not.toHaveBeenCalled();
  });

  it('does not store a token rejected by Trello', async () => {
    const {deps} = makeDeps(async () => {
      throw new TrelloApiError('unauthorized', 'invalid token', 401);
    });
    expect(await connectWithToken(deps, TOKEN)).toEqual({
      status: 'signedOut',
      error: 'invalidToken',
    });
    expect(await deps.store.getItem(TOKEN_STORAGE_KEY)).toBeNull();
  });
});

describe('disconnect', () => {
  it('removes the token and revokes it on Trello', async () => {
    const {deps, client, revokeToken} = makeDeps(async () => MEMBER);
    await deps.store.setItem(TOKEN_STORAGE_KEY, TOKEN);
    expect(await disconnect(deps, client)).toEqual({status: 'signedOut'});
    expect(await deps.store.getItem(TOKEN_STORAGE_KEY)).toBeNull();
    expect(revokeToken).toHaveBeenCalled();
  });
});
