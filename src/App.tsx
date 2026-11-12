import React, {useEffect, useRef} from 'react';

import {useTranslation} from './i18n';
import {useLaunchIntent} from './plugin/launchIntent';
import {ensureFileReadPermission} from './plugin/permissions';
import {BoardsScreen} from './screens/BoardsScreen';
import {ConnectScreen} from './screens/ConnectScreen';
import {CreateCardScreen} from './screens/CreateCardScreen';
import {StatusScreen} from './screens/StatusScreen';
import {useTrelloSession} from './session/useTrelloSession';

/**
 * Root component rendered by the Supernote plugin host when the
 * SuperTrello toolbar button is pressed.
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
      return (
        <BoardsScreen
          member={state.member}
          client={state.client}
          tokenStorage={state.tokenStorage}
          saveFailed={state.saveFailed}
          onRememberChange={session.setRemembered}
          onDisconnect={session.disconnect}
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
