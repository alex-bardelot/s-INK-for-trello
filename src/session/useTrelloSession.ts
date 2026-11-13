import {useCallback, useEffect, useMemo, useRef, useState} from 'react';

import {i18n} from '../i18n';
import {ensureInternetPermission} from '../plugin/permissions';
import {KeyValueStore} from '../storage/keyValueStore';
import {getDeviceStore, getSessionStore} from '../storage/stores';
import {TRELLO_API_KEY, TrelloClient} from '../trello';
import {
  connectWithToken,
  disconnect,
  restoreSession,
  SessionDeps,
  SessionState,
  setTokenRemembered,
} from './trelloSession';

export interface UseTrelloSessionResult {
  state: SessionState;
  /** Store for non-sensitive plugin settings (kept on the tablet). */
  settingsStore: KeyValueStore;
  /** Client without a token, for public boards while signed out. */
  anonymousClient: TrelloClient;
  /** Asks for network access; resolves `false` if refused. */
  ensureNetwork: () => Promise<boolean>;
  /** Connects; the token is saved on the tablet only if `remember` is set. */
  connect: (rawToken: string, remember: boolean) => Promise<void>;
  /** Saves the token on the tablet, or removes it from there. */
  setRemembered: (remember: boolean) => Promise<void>;
  disconnect: () => Promise<void>;
  /** Checks the stored account again (e.g. after a network error). */
  retry: () => Promise<void>;
}

function createDefaultDeps(): SessionDeps {
  return {
    apiKey: TRELLO_API_KEY,
    sessionStore: getSessionStore(),
    deviceStore: getDeviceStore(),
    ensureNetwork: () =>
      ensureInternetPermission(i18n.t('error.permissionDenied')),
    createClient: token => new TrelloClient({apiKey: TRELLO_API_KEY, token}),
  };
}

/** Holds the Trello connection of the plugin view. */
export function useTrelloSession(): UseTrelloSessionResult {
  const deps = useMemo(createDefaultDeps, []);
  const anonymousClient = useMemo(
    () => new TrelloClient({apiKey: deps.apiKey}),
    [deps],
  );
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
    async (rawToken: string, remember: boolean) => {
      update({status: 'connecting'});
      update(await connectWithToken(deps, rawToken, remember));
    },
    [deps, update],
  );

  const setRemembered = useCallback(
    async (remember: boolean) => {
      update(await setTokenRemembered(deps, state, remember));
    },
    [deps, state, update],
  );

  const signOut = useCallback(async () => {
    const client = state.status === 'signedIn' ? state.client : undefined;
    update(await disconnect(deps, client));
  }, [deps, state, update]);

  return {
    state,
    settingsStore: deps.deviceStore,
    anonymousClient,
    ensureNetwork: deps.ensureNetwork,
    connect,
    setRemembered,
    disconnect: signOut,
    retry,
  };
}
