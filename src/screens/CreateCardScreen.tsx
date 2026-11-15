import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {ScrollView, StyleSheet, Text, TextInput, View} from 'react-native';
import {PluginManager} from 'sn-plugin-lib';

import {loadBoardsPreferences} from '../boards/preferences';
import {
  CardPreferences,
  EMPTY_PREFERENCES,
  loadCardPreferences,
  mostUsedBoardId,
  rememberCardDestination,
} from '../cards/preferences';
import {
  BoardBadge,
  canAddCards,
  hasHiddenBoards,
  isObserverOf,
  formatCheckItems,
  OfferBoardsInput,
  offerBoards,
  orderLists,
  parseCheckItemsText,
  splitCardText,
} from '../cards/ordering';
import {addCardChecklist} from '../cards/checklist';
import {Button} from '../components/Button';
import {ChoiceList} from '../components/ChoiceList';
import {ScreenFrame} from '../components/ScreenFrame';
import {TranslationKey, useTranslation} from '../i18n';
import {LassoTextError, LassoTextResult} from '../plugin/lassoText';
import {SessionErrorCode, toSessionError} from '../session/trelloSession';
import {KeyValueStore} from '../storage/keyValueStore';
import {
  isSupernoteRoadmap,
  TrelloBoard,
  TrelloCard,
  TrelloClient,
  TrelloList,
} from '../trello';
import {borders, colors, spacing, typography} from '../theme';

type Step =
  | {kind: 'recognizing'}
  | {kind: 'loading'}
  | {kind: 'noText'; error: LassoTextError; diagnostics: string}
  | {kind: 'failed'; error: SessionErrorCode; retry: () => void}
  | {kind: 'board'}
  | {kind: 'loadingLists'; board: TrelloBoard}
  | {kind: 'list'; board: TrelloBoard; lists: TrelloList[]}
  | {kind: 'confirm'; board: TrelloBoard; list: TrelloList; lists: TrelloList[]}
  | {kind: 'creating'; board: TrelloBoard; list: TrelloList}
  | {
      kind: 'done';
      board: TrelloBoard;
      list: TrelloList;
      card: TrelloCard;
      /** The card exists, but its checklist could not be added. */
      checklistFailed: boolean;
    };

const LASSO_ERRORS: Record<LassoTextError, TranslationKey> = {
  noSelection: 'card.noSelection',
  recognitionFailed: 'card.recognitionFailed',
  permissionDenied: 'card.filePermissionDenied',
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
  /** Text of the lasso selection, read when the button was pressed. */
  lasso: Promise<LassoTextResult>;
  client: TrelloClient;
  store: KeyValueStore;
  /** Id of the connected member, to tell which boards accept new cards. */
  memberId: string;
  /** Called when Trello rejects the token. */
  onTokenRejected: () => void;
}

/**
 * Turns the lasso selection into a Trello card:
 * read the text → pick a board → pick a list → review → create.
 */
export function CreateCardScreen({
  lasso,
  client,
  store,
  memberId,
  onTokenRejected,
}: CreateCardScreenProps): React.JSX.Element {
  const {t} = useTranslation();
  const [step, setStep] = useState<Step>({kind: 'recognizing'});
  const [boards, setBoards] = useState<TrelloBoard[]>([]);
  const [publicBoards, setPublicBoards] = useState<TrelloBoard[]>([]);
  const [showAllBoards, setShowAllBoards] = useState(false);
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  // Checklist items, one per line, as edited on the review page.
  const [checklist, setChecklist] = useState('');
  const preferences = useRef<CardPreferences>(EMPTY_PREFERENCES);

  const fail = useCallback(
    (error: unknown, retry: () => void) => {
      console.warn('[sINK] Card creation step failed', error);
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
        const [myBoards, writablePublic] = await Promise.all([
          client.getMyBoards(),
          loadWritablePublicBoards(client, store, memberId),
        ]);
        // Supernote's roadmap is read only, even for its members, and
        // observers cannot add cards.
        const ownBoards = myBoards.filter(
          board => !isSupernoteRoadmap(board) && !isObserverOf(board, memberId),
        );
        setBoards(ownBoards);
        setPublicBoards(writablePublic);
        // Without any suggestion, the default selection would be empty.
        setShowAllBoards(
          offerBoards({
            ...boardsInput(ownBoards, writablePublic, prefs),
            showAll: false,
          }).length === 0,
        );
        setStep({kind: 'board'});
      } catch (error) {
        fail(error, () => {
          setStep({kind: 'loading'});
          loadBoards(prefs);
        });
      }
    },
    [client, fail, memberId, store],
  );

  const start = useCallback(async () => {
    setStep({kind: 'recognizing'});
    const [lassoText, prefs] = await Promise.all([
      lasso,
      loadCardPreferences(store),
    ]);
    preferences.current = prefs;
    if (!lassoText.ok) {
      setStep({
        kind: 'noText',
        error: lassoText.error,
        diagnostics: lassoText.diagnostics,
      });
      return;
    }
    const split = splitCardText(lassoText.text);
    setName(split.name);
    setDesc(split.desc);
    setChecklist(formatCheckItems(split.checkItems));
    setStep({kind: 'loading'});
    await loadBoards(prefs);
  }, [lasso, loadBoards, store]);

  /** Continues without recognized text: the user types the card. */
  const writeManually = useCallback(async () => {
    setName('');
    setDesc('');
    setChecklist('');
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
        // The card exists: a failure here must not offer to create it again.
        let checklistFailed = false;
        try {
          await addCardChecklist(
            client,
            card.id,
            parseCheckItemsText(checklist),
          );
        } catch (error) {
          console.warn('[sINK] Failed to add the checklist', error);
          checklistFailed = true;
        }
        setStep({kind: 'done', board, list, card, checklistFailed});
      } catch (error) {
        fail(error, () => setStep({kind: 'confirm', board, list, lists}));
      }
    },
    [checklist, client, desc, fail, name, store],
  );

  const allBoards = useMemo(
    () => [...boards, ...publicBoards],
    [boards, publicBoards],
  );
  const offeredBoards = useMemo(
    () =>
      offerBoards({
        ...boardsInput(boards, publicBoards, preferences.current),
        showAll: showAllBoards,
      }),
    [boards, publicBoards, showAllBoards],
  );
  const badgeLabels: Record<BoardBadge, string> = {
    mostUsed: t('card.mostUsed'),
    lastUsed: t('card.lastUsed'),
    public: t('card.publicBoard'),
  };

  const close = useCallback(() => {
    PluginManager.closePluginView().catch(error =>
      console.warn('[sINK] Failed to close plugin view', error),
    );
  }, []);

  const title = t('card.title');
  const lastUsed = t('card.lastUsed');

  switch (step.kind) {
    case 'recognizing':
      // Popup shown from the opening of the view until the handwriting
      // recognition is done.
      return (
        <ScreenFrame title={title}>
          <View style={styles.popupArea}>
            <View accessibilityRole="progressbar" style={styles.popup}>
              <Text style={styles.popupText}>{t('card.recognizing')}</Text>
            </View>
          </View>
        </ScreenFrame>
      );

    case 'loading':
      return (
        <ScreenFrame title={title}>
          <Text style={styles.message}>{t('card.loading')}</Text>
        </ScreenFrame>
      );

    case 'noText':
      return (
        <ScreenFrame title={title}>
          <ScrollView contentContainerStyle={styles.stack}>
            <Text style={styles.message}>{t(LASSO_ERRORS[step.error])}</Text>
            <Text style={styles.message}>{t('card.selectAgain')}</Text>
            <Button
              primary
              label={t('card.writeManually')}
              onPress={writeManually}
            />
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
            choices={offeredBoards.map(({board, badges}) => ({
              id: board.id,
              label: board.starred ? `★ ${board.name}` : board.name,
              tag:
                badges.length > 0
                  ? badges.map(badge => badgeLabels[badge]).join(' · ')
                  : undefined,
              highlighted: badges.includes('mostUsed'),
            }))}
            emptyText={t('boards.empty')}
            onSelect={id => {
              const board = allBoards.find(b => b.id === id);
              if (board) {
                selectBoard(board);
              }
            }}
            footer={
              hasHiddenBoards(
                boardsInput(boards, publicBoards, preferences.current),
              ) ? (
                <Button
                  label={
                    showAllBoards
                      ? t('card.showSuggestedBoards')
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
            <Text style={styles.label}>{t('card.checklist')}</Text>
            <TextInput
              accessibilityLabel={t('card.checklist')}
              multiline
              onChangeText={setChecklist}
              style={[styles.input, styles.checklistInput]}
              textAlignVertical="top"
              value={checklist}
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
            {step.checklistFailed && (
              <Text accessibilityRole="alert" style={styles.error}>
                {t('card.checklistFailed')}
              </Text>
            )}
            <Button primary label={t('common.close')} onPress={close} />
          </View>
        </ScreenFrame>
      );
  }
}

/** Board picker input, without the "show all" switch. */
function boardsInput(
  boards: readonly TrelloBoard[],
  publicBoards: readonly TrelloBoard[],
  preferences: CardPreferences,
): Omit<OfferBoardsInput, 'showAll'> {
  return {
    boards,
    publicBoards,
    mostUsedId: mostUsedBoardId(preferences),
    lastUsedId: preferences.lastBoardId,
  };
}

/**
 * The public boards added in Settings that the member can add cards to.
 * A board that cannot be read is skipped rather than failing the picker.
 */
async function loadWritablePublicBoards(
  client: TrelloClient,
  store: KeyValueStore,
  memberId: string,
): Promise<TrelloBoard[]> {
  const {publicBoards} = await loadBoardsPreferences(store);
  const results = await Promise.allSettled(
    publicBoards.map(ref => client.getBoard(ref.shortLink)),
  );
  return results.flatMap(result => {
    if (result.status === 'rejected') {
      console.warn('[sINK] Failed to read a public board', result.reason);
      return [];
    }
    const board = result.value;
    return !board.closed &&
      !isSupernoteRoadmap(board) &&
      canAddCards(board, memberId, false)
      ? [board]
      : [];
  });
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
  checklistInput: {
    minHeight: 120,
  },
  popupArea: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    padding: spacing.xl,
  },
  popup: {
    backgroundColor: colors.background,
    borderColor: colors.foreground,
    borderRadius: borders.radius,
    borderWidth: borders.width * 2,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
  },
  popupText: {
    color: colors.foreground,
    fontSize: typography.body,
    fontWeight: '700',
    textAlign: 'center',
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
