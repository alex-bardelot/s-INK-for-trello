import {
  clearPendingConnection,
  getPendingConnection,
  setPendingConnection,
} from '../src/relay/pendingConnection';
import {
  createRelaySession,
  RELAY_SESSION_LIFETIME_MS,
} from '../src/relay/relaySession';

describe('pending connection', () => {
  afterEach(clearPendingConnection);

  it('keeps the session and the choice until cleared', () => {
    const session = createRelaySession('https://relay.example');
    setPendingConnection({session, remember: true, startedAt: 1000});

    expect(getPendingConnection(2000)).toEqual({
      session,
      remember: true,
      startedAt: 1000,
    });
    clearPendingConnection();
    expect(getPendingConnection(2000)).toBeNull();
  });

  it('works without a relay', () => {
    setPendingConnection({session: null, remember: false, startedAt: 0});
    expect(getPendingConnection(1)?.session).toBeNull();
  });

  it('is forgotten once the relay session has expired', () => {
    setPendingConnection({session: null, remember: false, startedAt: 0});

    expect(getPendingConnection(RELAY_SESSION_LIFETIME_MS - 1)).not.toBeNull();
    expect(getPendingConnection(RELAY_SESSION_LIFETIME_MS)).toBeNull();
    // Stays forgotten.
    expect(getPendingConnection(0)).toBeNull();
  });
});
