import React, {useCallback, useEffect, useState} from 'react';
import {FlatList, StyleSheet, Text, View} from 'react-native';

import {Button} from '../components/Button';
import {ScreenFrame} from '../components/ScreenFrame';
import {useTranslation} from '../i18n';
import {toSessionError} from '../session/trelloSession';
import {TrelloBoard, TrelloClient, TrelloMember} from '../trello';
import {borders, colors, spacing, typography} from '../theme';

type BoardsState =
  | {status: 'loading'}
  | {status: 'loaded'; boards: TrelloBoard[]}
  | {status: 'failed'};

export interface BoardsScreenProps {
  member: TrelloMember;
  client: TrelloClient;
  onDisconnect: () => void;
  /** Called when Trello rejects the token while loading. */
  onTokenRejected: () => void;
}

/** Lists the open boards of the connected Trello account. */
export function BoardsScreen({
  member,
  client,
  onDisconnect,
  onTokenRejected,
}: BoardsScreenProps): React.JSX.Element {
  const {t} = useTranslation();
  const [state, setState] = useState<BoardsState>({status: 'loading'});

  const load = useCallback(async () => {
    setState({status: 'loading'});
    try {
      setState({status: 'loaded', boards: await client.getMyBoards()});
    } catch (error) {
      console.warn('[SuperTrello] Failed to load boards', error);
      if (toSessionError(error) === 'invalidToken') {
        onTokenRejected();
        return;
      }
      setState({status: 'failed'});
    }
  }, [client, onTokenRejected]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <ScreenFrame title={t('boards.title')}>
      <View style={styles.account}>
        <Text style={styles.accountText}>
          {t('boards.signedInAs', {
            name: member.fullName,
            username: member.username,
          })}
        </Text>
        <Button label={t('boards.disconnect')} onPress={onDisconnect} />
      </View>

      {state.status === 'loading' && (
        <Text style={styles.message}>{t('boards.loading')}</Text>
      )}

      {state.status === 'failed' && (
        <View style={styles.failure}>
          <Text style={styles.message}>{t('boards.loadFailed')}</Text>
          <Button label={t('common.retry')} onPress={load} />
        </View>
      )}

      {state.status === 'loaded' && (
        <FlatList
          data={state.boards}
          keyExtractor={board => board.id}
          ItemSeparatorComponent={Separator}
          ListEmptyComponent={
            <Text style={styles.message}>{t('boards.empty')}</Text>
          }
          renderItem={({item}) => (
            <View style={styles.board}>
              <Text style={styles.boardName} numberOfLines={2}>
                {item.starred ? `★ ${item.name}` : item.name}
              </Text>
            </View>
          )}
        />
      )}
    </ScreenFrame>
  );
}

function Separator(): React.JSX.Element {
  return <View style={styles.separator} />;
}

const styles = StyleSheet.create({
  account: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  accountText: {
    flex: 1,
    color: colors.foreground,
    fontSize: typography.body,
  },
  failure: {
    gap: spacing.md,
  },
  message: {
    color: colors.foreground,
    fontSize: typography.body,
  },
  board: {
    paddingVertical: spacing.md,
  },
  boardName: {
    color: colors.foreground,
    fontSize: typography.label,
    fontWeight: '600',
  },
  separator: {
    height: borders.width / 2,
    backgroundColor: colors.foreground,
  },
});
