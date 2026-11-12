import {useCallback, useEffect, useMemo, useRef, useState} from 'react';

import {i18n} from '../i18n';
import {ensureInternetPermission} from '../plugin/permissions';
import {getDefaultStore} from '../storage/keyValueStore';
import {TRELLO_API_KEY, TrelloClient} from '../trello';
import {
  connectWithToken,
  disconnect,
  restoreSession,
  SessionDeps,
  SessionState,
} from './trelloSession';

export interface UseTrelloSessionResult {
  state: SessionState;
  /** `true` if the token survives a restart of the tablet. */
  persistentStorage: boolean;
  connect: (rawToken: string) => Promise<void>;
  disconnect: () => Promise<void>;
  /** Checks the stored account again (e.g. after a network error). */
  retry: () => Promise<void>;
}

function createDefaultDeps(): SessionDeps {
  return {
    apiKey: TRELLO_API_KEY,
    store: getDefaultStore(),
    ensureNetwork: () =>
      ensureInternetPermission(i18n.t('error.permissionDenied')),
    createClient: token => new TrelloClient({apiKey: TRELLO_API_KEY, token}),
  };
}

/** Holds the Trello connection of the plugin view. */
export function useTrelloSession(): UseTrelloSessionResult {
  const deps = useMemo(createDefaultDeps, []);
  const [state, setState] = useState<SessionState>({status: 'checking'});
  const mounted = useRef(true);

  const update = useCallback((next: SessionState) => {
    if (mounted.current) {
      setState(next);
    }
  }, []);

  const retry = useCallback(async () => {
    update({status: 'checking'});
    update(await restoreSession(deps));
  }, [deps, update]);

  useEffect(() => {
    mounted.current = true;
    retry();
    return () => {
      mounted.current = false;
    };
  }, [retry]);

  const connect = useCallback(
    async (rawToken: string) => {
      update({status: 'connecting'});
      update(await connectWithToken(deps, rawToken));
    },
    [deps, update],
  );

  const signOut = useCallback(async () => {
    const client = state.status === 'signedIn' ? state.client : undefined;
    update(await disconnect(deps, client));
  }, [deps, state, update]);

  return {
    state,
    persistentStorage: deps.store.persistent,
    connect,
    disconnect: signOut,
    retry,
  };
}
