import React, {useCallback, useEffect, useRef, useState} from 'react';
import {StyleSheet, View} from 'react-native';

import {
  BoardsPreferences,
  DEFAULT_BOARDS_PREFERENCES,
  loadBoardsPreferences,
  saveBoardsPreferences,
} from './boards/preferences';
import {PendingBindingBanner} from './components/PendingBindingBanner';
import {SettingsOpenerContext} from './components/settingsOpener';
import {language, loadLanguageChoice, useTranslation} from './i18n';
import {loadLinkTrigger, setLinkTrigger} from './inkLink/trigger';
import {connectivity, useConnectivity} from './network/connectivity';
import {openBoardsIntent, useLaunchIntent} from './plugin/launchIntent';
import {
  ensureFileReadPermission,
  hasInternetPermission,
} from './plugin/permissions';
import {BoardScreen} from './screens/BoardScreen';
import {BoardsScreen} from './screens/BoardsScreen';
import {ConnectScreen} from './screens/ConnectScreen';
import {CreateCardScreen} from './screens/CreateCardScreen';
import {OfflineScreen} from './screens/OfflineScreen';
import {SettingsCategory, SettingsScreen} from './screens/SettingsScreen';
import {StatusScreen, WaitingScreen} from './screens/StatusScreen';
import {useTrelloSession} from './session/useTrelloSession';
import {colors} from './theme';
import {TrelloBoard} from './trello';

/**
 * Root component rendered by the Supernote plugin host when the
 * s-INK toolbar button is pressed.
 *
 * On every opening it looks for a linked Trello account: if one is found and
 * still valid, the requested feature is shown (boards from the toolbar
 * button, card creation from the lasso button). Without an account, the
 * boards page still opens, with Supernote's public roadmap and a card
 * leading to the connection screen; card creation asks to connect first.
 * Without internet, a linked account is kept: an offline page says so and
 * the plugin goes on by itself once the connection is back.
 */
export default function App(): React.JSX.Element {
  const {t} = useTranslation();
  const session = useTrelloSession();
  const intent = useLaunchIntent();
  const {state} = session;
  const [openBoard, setOpenBoard] = useState<TrelloBoard | null>(null);
  // Card the board opens at, and key of the request that asked for it. A
  // tapped s-INK link also opens the card over the board; a card just
  // created is only shown on its page.
  const [linkedCard, setLinkedCard] = useState<{
    requestId: number;
    cardId?: string;
    openDetail: boolean;
  } | null>(null);
  const [linkStatus, setLinkStatus] = useState<'idle' | 'opening' | 'failed'>(
    'idle',
  );
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Kept here so that Settings comes back to the same category after the
  // connection screen opened over it.
  const [settingsCategory, setSettingsCategory] =
    useState<SettingsCategory>('general');
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
    // The tap listener starts before the view and cannot always read it.
    loadLinkTrigger(settingsStore).then(setLinkTrigger);
    // Same for the language, read at startup only with file access.
    loadLanguageChoice(settingsStore).then(choice =>
      language.setChoice(choice),
    );
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
  // The tablet's internet access is checked on every opening, signed in or
  // not, so the offline strip shows at once. Not before network access is
  // granted: the check must not prompt for it.
  useEffect(() => {
    hasInternetPermission().then(granted => {
      if (granted) {
        connectivity.probe();
      }
    });
  }, []);

  // Opened without internet: the account is checked again as soon as the
  // connection is back.
  const online = useConnectivity() === 'online';
  const offline = state.status === 'offline';
  const {retry} = session;
  useEffect(() => {
    if (offline && online) {
      retry();
    }
  }, [offline, online, retry]);

  const signedIn = state.status === 'signedIn';
  useEffect(() => {
    if (signedIn) {
      setConnectOpen(false);
    }
  }, [signedIn]);

  // An s-INK link tapped in a note opens its board, and its card if any.
  const linkIntent = intent.kind === 'inkLink' ? intent : null;
  const linkClient =
    state.status === 'signedIn' ? state.client : session.anonymousClient;
  const {ensureNetwork} = session;
  useEffect(() => {
    if (!linkIntent || !sessionChecked) {
      return;
    }
    let cancelled = false;
    const {requestId, target} = linkIntent;
    setSettingsOpen(false);
    setConnectOpen(false);
    setLinkStatus('opening');
    (async () => {
      try {
        if (!(await ensureNetwork())) {
          throw new Error('No network access');
        }
        const location =
          target.kind === 'card'
            ? await linkClient.getCardLocation(target.shortLink)
            : null;
        const board = await linkClient.getBoard(
          location ? location.idBoard : target.shortLink,
        );
        if (!cancelled) {
          setOpenBoard(board);
          setLinkedCard({requestId, cardId: location?.id, openDetail: true});
          setLinkStatus('idle');
        }
      } catch (error) {
        console.warn('[sINK] Failed to open an s-INK link', error);
        if (!cancelled) {
          setLinkStatus('failed');
        }
      }
    })();
    return () => {
      cancelled = true;
      // Another intent (the lasso "Insert Trello Link" button, say) replaced
      // this one: the opening screen must not stay up.
      setLinkStatus('idle');
    };
    // Runs once per tap: the request id changes on every tap.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkIntent?.requestId, sessionChecked]);

  const account = state.status === 'signedIn' ? state : null;
  const lasso = intent.kind === 'lassoCreateCard' ? intent : null;
  // Signed out, public boards (Supernote's roadmap, the ones added in
  // Settings) are read anonymously.
  const client = account?.client ?? session.anonymousClient;

  // Settings opens over the page, from the button of its title bar, at the
  // page's own category, and closes back to the page as it was. The
  // connection screen, which Settings can open, shows over Settings.
  const settingsShown = settingsOpen && !connectOpen;
  const openSettings = (category: SettingsCategory) => {
    setSettingsCategory(category);
    setSettingsOpen(true);
  };

  return (
    <View style={styles.app}>
      <SettingsOpenerContext.Provider
        value={settingsOpen ? null : openSettings}>
        {renderPage()}
      </SettingsOpenerContext.Provider>
      {settingsShown && (
        <View style={styles.overlay}>
          <SettingsScreen
            category={settingsCategory}
            onCategoryChange={setSettingsCategory}
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
            // The connection screen opens over Settings and comes back to it.
            onConnect={() => setConnectOpen(true)}
            onBack={() => setSettingsOpen(false)}
          />
        </View>
      )}
    </View>
  );

  /** The page the plugin is on, under Settings when it is open. */
  function renderPage(): React.JSX.Element {
    if (state.status === 'checking') {
      return <WaitingScreen message={t('session.checking')} />;
    }
    if (linkStatus === 'opening') {
      return (
        <WaitingScreen
          message={t('inkLink.opening')}
          onBack={() => setLinkStatus('idle')}
        />
      );
    }
    if (linkStatus === 'failed') {
      return (
        <StatusScreen
          message={t('inkLink.openFailed')}
          onBack={() => setLinkStatus('idle')}
        />
      );
    }
    if (offline) {
      return <OfflineScreen onRetry={retry} />;
    }
    return renderSignedInPage();
  }

  function renderSignedInPage(): React.JSX.Element {
    if (!account && (lasso || connectOpen || state.status === 'connecting')) {
      return (
        <ConnectScreen
          busy={state.status === 'connecting'}
          error={signedOutError}
          onConnect={session.connect}
          onRetry={session.retry}
          ensureNetwork={session.ensureNetwork}
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
          memberId={account.member.id}
          onTokenRejected={session.retry}
          onCreated={(board, card) => {
            setOpenBoard(board);
            setLinkedCard({
              requestId: Date.now(),
              cardId: card.id,
              openDetail: false,
            });
            // Leaves card creation for the board.
            openBoardsIntent();
          }}
        />
      );
    }

    if (openBoard) {
      return (
        <PendingBindingBanner>
          <BoardScreen
            key={`${openBoard.id}:${linkedCard?.requestId ?? 0}`}
            board={openBoard}
            client={client}
            store={session.settingsStore}
            memberId={account?.member.id ?? ''}
            initialCardId={linkedCard?.cardId}
            openInitialCard={linkedCard?.openDetail ?? false}
            onBack={() => {
              setOpenBoard(null);
              setLinkedCard(null);
            }}
            onTokenRejected={session.retry}
          />
        </PendingBindingBanner>
      );
    }
    return (
      <PendingBindingBanner>
        <BoardsScreen
          member={account?.member ?? null}
          client={client}
          preferences={boardsPreferences}
          onPreferencesChange={updateBoardsPreferences}
          ensureNetwork={session.ensureNetwork}
          onOpenBoard={setOpenBoard}
          onConnect={() => setConnectOpen(true)}
          onTokenRejected={session.retry}
        />
      </PendingBindingBanner>
    );
  }
}

const styles = StyleSheet.create({
  app: {
    flex: 1,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.background,
  },
});
