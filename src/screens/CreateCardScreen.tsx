import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {ScrollView, StyleSheet, Text, TextInput, View} from 'react-native';
import {PluginManager} from 'sn-plugin-lib';

import {
  CardPreferences,
  EMPTY_PREFERENCES,
  loadCardPreferences,
  rememberCardDestination,
} from '../cards/preferences';
import {
  hasHiddenBoards,
  orderBoards,
  orderLists,
  splitCardText,
} from '../cards/ordering';
import {Button} from '../components/Button';
import {ChoiceList} from '../components/ChoiceList';
import {ScreenFrame} from '../components/ScreenFrame';
import {TranslationKey, useTranslation} from '../i18n';
import {LassoTextError, readLassoText} from '../plugin/lassoText';
import {SessionErrorCode, toSessionError} from '../session/trelloSession';
import {KeyValueStore} from '../storage/keyValueStore';
import {TrelloBoard, TrelloCard, TrelloClient, TrelloList} from '../trello';
import {borders, colors, spacing, typography} from '../theme';

type Step =
  | {kind: 'loading'}
  | {kind: 'noText'; error: LassoTextError; diagnostics: string}
  | {kind: 'failed'; error: SessionErrorCode; retry: () => void}
  | {kind: 'board'}
  | {kind: 'loadingLists'; board: TrelloBoard}
  | {kind: 'list'; board: TrelloBoard; lists: TrelloList[]}
  | {kind: 'confirm'; board: TrelloBoard; list: TrelloList; lists: TrelloList[]}
  | {kind: 'creating'; board: TrelloBoard; list: TrelloList}
  | {kind: 'done'; board: TrelloBoard; list: TrelloList; card: TrelloCard};

const LASSO_ERRORS: Record<LassoTextError, TranslationKey> = {
  noSelection: 'card.noSelection',
  recognitionFailed: 'card.recognitionFailed',
};

const SESSION_ERRORS: Record<SessionErrorCode, TranslationKey> = {
  missingApiKey: 'error.missingApiKey',
  permissionDenied: 'error.permissionDenied',
  malformedToken: 'error.malformedToken',
  invalidToken: 'error.invalidToken',
  network: 'error.network',
  rateLimited: 'error.rateLimited',
  unknown: 'error.unknown',
};

export interface CreateCardScreenProps {
  client: TrelloClient;
  store: KeyValueStore;
  /** Called when Trello rejects the token. */
  onTokenRejected: () => void;
}

/**
 * Turns the lasso selection into a Trello card:
 * read the text → pick a board → pick a list → review → create.
 */
export function CreateCardScreen({
  client,
  store,
  onTokenRejected,
}: CreateCardScreenProps): React.JSX.Element {
  const {t} = useTranslation();
  const [step, setStep] = useState<Step>({kind: 'loading'});
  const [boards, setBoards] = useState<TrelloBoard[]>([]);
  const [showAllBoards, setShowAllBoards] = useState(false);
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const preferences = useRef<CardPreferences>(EMPTY_PREFERENCES);

  const fail = useCallback(
    (error: unknown, retry: () => void) => {
      console.warn('[SuperTrello] Card creation step failed', error);
      const code = toSessionError(error);
      if (code === 'invalidToken') {
        onTokenRejected();
        return;
      }
      setStep({kind: 'failed', error: code, retry});
    },
    [onTokenRejected],
  );

  const loadBoards = useCallback(
    async (prefs: CardPreferences): Promise<void> => {
      try {
        const allBoards = await client.getMyBoards();
        setBoards(allBoards);
        // Without any favorite, the default selection would be empty.
        setShowAllBoards(
          orderBoards(allBoards, prefs.lastBoardId, false).length === 0,
        );
        setStep({kind: 'board'});
      } catch (error) {
        fail(error, () => {
          setStep({kind: 'loading'});
          loadBoards(prefs);
        });
      }
    },
    [client, fail],
  );

  const start = useCallback(async () => {
    setStep({kind: 'loading'});
    const [lasso, prefs] = await Promise.all([
      readLassoText(),
      loadCardPreferences(store),
    ]);
    preferences.current = prefs;
    if (!lasso.ok) {
      setStep({
        kind: 'noText',
        error: lasso.error,
        diagnostics: lasso.diagnostics,
      });
      return;
    }
    const split = splitCardText(lasso.text);
    setName(split.name);
    setDesc(split.desc);
    await loadBoards(prefs);
  }, [loadBoards, store]);

  /** Continues without recognized text: the user types the card. */
  const writeManually = useCallback(async () => {
    setName('');
    setDesc('');
    setStep({kind: 'loading'});
    await loadBoards(preferences.current);
  }, [loadBoards]);

  useEffect(() => {
    start();
  }, [start]);

  const selectBoard = useCallback(
    async (board: TrelloBoard) => {
      setStep({kind: 'loadingLists', board});
      try {
        const lists = orderLists(
          await client.getBoardLists(board.id),
          preferences.current.lastListByBoard[board.id],
        );
        setStep({kind: 'list', board, lists});
      } catch (error) {
        fail(error, () => selectBoard(board));
      }
    },
    [client, fail],
  );

  const create = useCallback(
    async (board: TrelloBoard, list: TrelloList, lists: TrelloList[]) => {
      setStep({kind: 'creating', board, list});
      try {
        const card = await client.createCard({
          idList: list.id,
          name: name.trim(),
          desc: desc.trim(),
        });
        preferences.current = await rememberCardDestination(
          store,
          preferences.current,
          board.id,
          list.id,
        );
        setStep({kind: 'done', board, list, card});
      } catch (error) {
        fail(error, () => setStep({kind: 'confirm', board, list, lists}));
      }
    },
    [client, desc, fail, name, store],
  );

  const offeredBoards = useMemo(
    () => orderBoards(boards, preferences.current.lastBoardId, showAllBoards),
    [boards, showAllBoards],
  );

  const close = useCallback(() => {
    PluginManager.closePluginView().catch(error =>
      console.warn('[SuperTrello] Failed to close plugin view', error),
    );
  }, []);

  const title = t('card.title');
  const lastUsed = t('card.lastUsed');

  switch (step.kind) {
    case 'loading':
      return (
        <ScreenFrame title={title}>
          <Text style={styles.message}>{t('card.reading')}</Text>
        </ScreenFrame>
      );

    case 'noText':
      return (
        <ScreenFrame title={title}>
          <ScrollView contentContainerStyle={styles.stack}>
            <Text style={styles.message}>{t(LASSO_ERRORS[step.error])}</Text>
            <Button
              primary
              label={t('card.writeManually')}
              onPress={writeManually}
            />
            <Button label={t('common.retry')} onPress={start} />
            <Button label={t('common.close')} onPress={close} />
            {step.diagnostics ? (
              <View style={styles.diagnostics}>
                <Text style={styles.diagnosticsTitle}>
                  {t('card.diagnostics')}
                </Text>
                <Text selectable style={styles.diagnosticsText}>
                  {step.diagnostics}
                </Text>
              </View>
            ) : null}
          </ScrollView>
        </ScreenFrame>
      );

    case 'failed':
      return (
        <ScreenFrame title={title}>
          <View style={styles.stack}>
            <Text accessibilityRole="alert" style={styles.error}>
              {t(SESSION_ERRORS[step.error])}
            </Text>
            <Button label={t('common.retry')} onPress={step.retry} />
          </View>
        </ScreenFrame>
      );

    case 'board':
      return (
        <ScreenFrame title={t('card.chooseBoard')}>
          <Text style={styles.preview} numberOfLines={2}>
            {name}
          </Text>
          <ChoiceList
            choices={offeredBoards.map(board => ({
              id: board.id,
              label: board.starred ? `★ ${board.name}` : board.name,
              tag:
                board.id === preferences.current.lastBoardId
                  ? lastUsed
                  : undefined,
            }))}
            emptyText={t('boards.empty')}
            onSelect={id => {
              const board = boards.find(b => b.id === id);
              if (board) {
                selectBoard(board);
              }
            }}
            footer={
              hasHiddenBoards(boards, preferences.current.lastBoardId) ? (
                <Button
                  label={
                    showAllBoards
                      ? t('card.showFavoriteBoards')
                      : t('card.showAllBoards')
                  }
                  onPress={() => setShowAllBoards(value => !value)}
                />
              ) : undefined
            }
          />
        </ScreenFrame>
      );

    case 'loadingLists':
      return (
        <ScreenFrame
          title={step.board.name}
          onBack={() => setStep({kind: 'board'})}>
          <Text style={styles.message}>{t('card.loading')}</Text>
        </ScreenFrame>
      );

    case 'list': {
      const {board, lists} = step;
      const lastListId = preferences.current.lastListByBoard[board.id];
      return (
        <ScreenFrame
          title={t('card.chooseList', {board: board.name})}
          onBack={() => setStep({kind: 'board'})}>
          <ChoiceList
            choices={lists.map(list => ({
              id: list.id,
              label: list.name,
              tag: list.id === lastListId ? lastUsed : undefined,
            }))}
            emptyText={t('card.noLists')}
            onSelect={id => {
              const list = lists.find(l => l.id === id);
              if (list) {
                setStep({kind: 'confirm', board, list, lists});
              }
            }}
          />
        </ScreenFrame>
      );
    }

    case 'confirm': {
      const {board, list, lists} = step;
      const canCreate = name.trim().length > 0;
      return (
        <ScreenFrame
          title={t('card.confirmTitle')}
          onBack={() => setStep({kind: 'list', board, lists})}>
          <ScrollView
            contentContainerStyle={styles.stack}
            keyboardShouldPersistTaps="handled">
            <Text style={styles.destination}>
              {t('card.destination', {board: board.name, list: list.name})}
            </Text>
            <Text style={styles.label}>{t('card.name')}</Text>
            <TextInput
              accessibilityLabel={t('card.name')}
              multiline
              onChangeText={setName}
              style={styles.input}
              value={name}
            />
            <Text style={styles.label}>{t('card.description')}</Text>
            <TextInput
              accessibilityLabel={t('card.description')}
              multiline
              onChangeText={setDesc}
              style={[styles.input, styles.descInput]}
              textAlignVertical="top"
              value={desc}
            />
            {!canCreate && (
              <Text style={styles.message}>{t('card.nameRequired')}</Text>
            )}
            <Button
              primary
              disabled={!canCreate}
              label={t('card.create')}
              onPress={() => create(board, list, lists)}
            />
          </ScrollView>
        </ScreenFrame>
      );
    }

    case 'creating':
      return (
        <ScreenFrame title={title}>
          <Text style={styles.message}>{t('card.creating')}</Text>
        </ScreenFrame>
      );

    case 'done':
      return (
        <ScreenFrame title={title}>
          <View style={styles.stack}>
            <Text style={styles.message}>
              {t('card.created', {
                board: step.board.name,
                list: step.list.name,
              })}
            </Text>
            <Text style={styles.preview}>{step.card.name}</Text>
            <Button primary label={t('common.close')} onPress={close} />
          </View>
        </ScreenFrame>
      );
  }
}

const styles = StyleSheet.create({
  stack: {
    gap: spacing.md,
    paddingBottom: spacing.xl,
  },
  message: {
    color: colors.foreground,
    fontSize: typography.body,
  },
  error: {
    color: colors.foreground,
    fontSize: typography.body,
    fontWeight: '700',
    borderColor: colors.foreground,
    borderWidth: borders.width,
    padding: spacing.md,
  },
  preview: {
    color: colors.foreground,
    fontSize: typography.body,
    fontStyle: 'italic',
    marginBottom: spacing.md,
  },
  destination: {
    color: colors.foreground,
    fontSize: typography.label,
    fontWeight: '700',
  },
  label: {
    color: colors.foreground,
    fontSize: typography.body,
    fontWeight: '600',
  },
  input: {
    color: colors.foreground,
    borderColor: colors.foreground,
    borderRadius: borders.radius,
    borderWidth: borders.width,
    fontSize: typography.body,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  descInput: {
    minHeight: 160,
  },
  diagnostics: {
    borderColor: colors.foreground,
    borderStyle: 'dashed',
    borderWidth: borders.width,
    gap: spacing.xs,
    padding: spacing.sm,
  },
  diagnosticsTitle: {
    color: colors.foreground,
    fontSize: typography.body,
    fontWeight: '600',
  },
  diagnosticsText: {
    color: colors.foreground,
    fontFamily: 'monospace',
    fontSize: 18,
  },
});
