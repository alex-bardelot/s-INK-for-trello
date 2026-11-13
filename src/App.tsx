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
 * button, card creation from the lasso button); otherwise the user is asked
 * to connect first.
 */
export default function App(): React.JSX.Element {
  const {t} = useTranslation();
  const session = useTrelloSession();
  const intent = useLaunchIntent();
  const {state} = session;
  const [openBoard, setOpenBoard] = useState<TrelloBoard | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
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

  switch (state.status) {
    case 'checking':
      return <StatusScreen message={t('session.checking')} />;
    case 'signedIn':
      if (intent.kind === 'lassoCreateCard') {
        return (
          <CreateCardScreen
            key={intent.requestId}
            lasso={intent.lasso}
            client={state.client}
            store={session.settingsStore}
            onTokenRejected={session.retry}
          />
        );
      }
      if (openBoard) {
        return (
          <BoardScreen
            key={openBoard.id}
            board={openBoard}
            client={state.client}
            store={session.settingsStore}
            memberId={state.member.id}
            onBack={() => setOpenBoard(null)}
            onTokenRejected={session.retry}
          />
        );
      }
      if (settingsOpen) {
        return (
          <SettingsScreen
            member={state.member}
            tokenStorage={state.tokenStorage}
            saveFailed={state.saveFailed}
            showRoadmap={boardsPreferences.showSupernoteRoadmap}
            onShowRoadmapChange={show =>
              updateBoardsPreferences({
                ...boardsPreferences,
                showSupernoteRoadmap: show,
              })
            }
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
          client={state.client}
          showRoadmap={boardsPreferences.showSupernoteRoadmap}
          onOpenBoard={setOpenBoard}
          onOpenSettings={() => setSettingsOpen(true)}
          onTokenRejected={session.retry}
        />
      );
    case 'signedOut':
    case 'connecting':
      return (
        <ConnectScreen
          busy={state.status === 'connecting'}
          error={state.status === 'signedOut' ? state.error : undefined}
          onConnect={session.connect}
          onRetry={session.retry}
        />
      );
  }
}
