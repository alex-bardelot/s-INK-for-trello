import React, {useCallback, useEffect, useState} from 'react';
import {FlatList, Pressable, StyleSheet, Text, View} from 'react-native';

import {Button} from '../components/Button';
import {ScreenFrame} from '../components/ScreenFrame';
import {TokenStorageNotice} from '../components/TokenStorageNotice';
import {useTranslation} from '../i18n';
import {TokenStorage, toSessionError} from '../session/trelloSession';
import {TrelloBoard, TrelloClient, TrelloMember} from '../trello';
import {borders, colors, spacing, typography} from '../theme';

type BoardsState =
  | {status: 'loading'}
  | {status: 'loaded'; boards: TrelloBoard[]}
  | {status: 'failed'};

export interface BoardsScreenProps {
  member: TrelloMember;
  client: TrelloClient;
  tokenStorage: TokenStorage;
  saveFailed?: boolean;
  /** Saves the token on the tablet, or removes it from there. */
  onRememberChange: (remember: boolean) => void;
  onDisconnect: () => void;
  onOpenBoard: (board: TrelloBoard) => void;
  /** Called when Trello rejects the token while loading. */
  onTokenRejected: () => void;
}

/** Lists the open boards of the connected Trello account. */
export function BoardsScreen({
  member,
  client,
  tokenStorage,
  saveFailed,
  onRememberChange,
  onDisconnect,
  onOpenBoard,
  onTokenRejected,
}: BoardsScreenProps): React.JSX.Element {
  const {t} = useTranslation();
  const [state, setState] = useState<BoardsState>({status: 'loading'});

  const load = useCallback(async () => {
    setState({status: 'loading'});
    try {
      setState({status: 'loaded', boards: await client.getMyBoards()});
    } catch (error) {
      console.warn('[sINK] Failed to load boards', error);
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
      <TokenStorageNotice
        tokenStorage={tokenStorage}
        saveFailed={saveFailed}
        onChange={onRememberChange}
      />

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
            <Pressable
              accessibilityRole="button"
              onPress={() => onOpenBoard(item)}
              style={({pressed}) => [styles.board, pressed && styles.pressed]}>
              {({pressed}) => (
                <Text
                  style={[styles.boardName, pressed && styles.pressedName]}
                  numberOfLines={2}>
                  {item.starred ? `★ ${item.name}` : item.name}
                </Text>
              )}
            </Pressable>
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
    paddingHorizontal: spacing.sm,
  },
  pressed: {
    backgroundColor: colors.foreground,
  },
  pressedName: {
    color: colors.background,
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
