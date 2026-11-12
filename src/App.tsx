import React from 'react';

import {useTranslation} from './i18n';
import {useLaunchIntent} from './plugin/launchIntent';
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
            store={session.store}
            onTokenRejected={session.retry}
          />
        );
      }
      return (
        <BoardsScreen
          member={state.member}
          client={state.client}
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
          persistentStorage={session.persistentStorage}
          onConnect={session.connect}
          onRetry={session.retry}
        />
      );
  }
}
