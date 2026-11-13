import React, {useCallback, useEffect, useRef, useState} from 'react';

import {
  BoardsPreferences,
  DEFAULT_BOARDS_PREFERENCES,
  loadBoardsPreferences,
  saveBoardsPreferences,
} from './boards/preferences';
import {useTranslation} from './i18n';
import {useLaunchIntent} from './plugin/launchIntent';
import {ensureFileReadPermission} from './plugin/permissions';
import {BoardScreen} from './screens/BoardScreen';
import {BoardsScreen} from './screens/BoardsScreen';
import {ConnectScreen} from './screens/ConnectScreen';
import {CreateCardScreen} from './screens/CreateCardScreen';
import {SettingsScreen} from './screens/SettingsScreen';
import {StatusScreen} from './screens/StatusScreen';
import {useTrelloSession} from './session/useTrelloSession';
import {TrelloBoard} from './trello';

/**
 * Root component rendered by the Supernote plugin host when the
 * sINK toolbar button is pressed.
 *
 * On every opening it looks for a linked Trello account: if one is found and
 * still valid, the requested feature is shown (boards from the toolbar
 * button, card creation from the lasso button). Without an account, the
 * boards page still opens, with Supernote's public roadmap and a card
 * leading to the connection screen; card creation asks to connect first.
 */
export default function App(): React.JSX.Element {
  const {t} = useTranslation();
  const session = useTrelloSession();
  const intent = useLaunchIntent();
  const {state} = session;
  const [openBoard, setOpenBoard] = useState<TrelloBoard | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [connectOpen, setConnectOpen] = useState(false);
  const [boardsPreferences, setBoardsPreferences] = useState(
    DEFAULT_BOARDS_PREFERENCES,
  );
  const {settingsStore} = session;

  useEffect(() => {
    let cancelled = false;
    loadBoardsPreferences(settingsStore).then(preferences => {
      if (!cancelled) {
        setBoardsPreferences(preferences);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [settingsStore]);

  const updateBoardsPreferences = useCallback(
    (preferences: BoardsPreferences) => {
      setBoardsPreferences(preferences);
      saveBoardsPreferences(settingsStore, preferences);
    },
    [settingsStore],
  );

  // Ask for note read access while the view is shown, so that the lasso
  // button, which reads the selection before opening the view, already
  // holds it. Choosing "Always allow" avoids being asked again. Waits for
  // the session check, which may itself prompt for network access.
  const sessionChecked = state.status !== 'checking';
  const fileReadRequested = useRef(false);
  useEffect(() => {
    if (sessionChecked && !fileReadRequested.current) {
      fileReadRequested.current = true;
      ensureFileReadPermission(t('card.filePermissionRationale'));
    }
  }, [sessionChecked, t]);

  // The connection screen opens from the boards page, and by itself when
  // a stored account could not be restored (the error is explained there).
  const signedOutError = state.status === 'signedOut' ? state.error : undefined;
  useEffect(() => {
    if (signedOutError) {
      setConnectOpen(true);
    }
  }, [signedOutError]);
  const signedIn = state.status === 'signedIn';
  useEffect(() => {
    if (signedIn) {
      setConnectOpen(false);
    }
  }, [signedIn]);

  if (state.status === 'checking') {
    return <StatusScreen message={t('session.checking')} />;
  }
  const account = state.status === 'signedIn' ? state : null;
  const lasso = intent.kind === 'lassoCreateCard' ? intent : null;

  if (!account && (lasso || connectOpen || state.status === 'connecting')) {
    return (
      <ConnectScreen
        busy={state.status === 'connecting'}
        error={signedOutError}
        onConnect={session.connect}
        onRetry={session.retry}
        // Card creation needs an account: there is no page to go back to.
        onBack={lasso ? undefined : () => setConnectOpen(false)}
      />
    );
  }
  if (account && lasso) {
    return (
      <CreateCardScreen
        key={lasso.requestId}
        lasso={lasso.lasso}
        client={account.client}
        store={session.settingsStore}
        onTokenRejected={session.retry}
      />
    );
  }

  // Signed out, public boards (Supernote's roadmap, the ones added in
  // Settings) are read anonymously.
  const client = account?.client ?? session.anonymousClient;
  if (openBoard) {
    return (
      <BoardScreen
        key={openBoard.id}
        board={openBoard}
        client={client}
        store={session.settingsStore}
        memberId={account?.member.id ?? ''}
        onBack={() => setOpenBoard(null)}
        onTokenRejected={session.retry}
      />
    );
  }
  if (settingsOpen) {
    return (
      <SettingsScreen
        store={session.settingsStore}
        member={account?.member ?? null}
        tokenStorage={account?.tokenStorage}
        saveFailed={account?.saveFailed}
        client={client}
        ensureNetwork={session.ensureNetwork}
        boardsPreferences={boardsPreferences}
        onBoardsPreferencesChange={updateBoardsPreferences}
        onRememberChange={session.setRemembered}
        onDisconnect={() => {
          setSettingsOpen(false);
          session.disconnect();
        }}
        onBack={() => setSettingsOpen(false)}
      />
    );
  }
  return (
    <BoardsScreen
      member={account?.member ?? null}
      client={client}
      showRoadmap={boardsPreferences.showSupernoteRoadmap}
      publicBoards={boardsPreferences.publicBoards}
      ensureNetwork={session.ensureNetwork}
      onOpenBoard={setOpenBoard}
      onOpenSettings={() => setSettingsOpen(true)}
      onConnect={() => setConnectOpen(true)}
      onTokenRejected={session.retry}
    />
  );
}
