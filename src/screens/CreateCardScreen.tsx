import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {PluginManager} from 'sn-plugin-lib';

import {loadBoardsPreferences} from '../boards/preferences';
import {addCardChecklist} from '../cards/checklist';
import {
  checkItemsToCreate,
  defaultChoice,
  FormCheckItem,
  membersMeFirst,
  toggleId,
} from '../cards/newCardForm';
import {
  BoardBadge,
  canAddCards,
  hasHiddenBoards,
  isObserverOf,
  OfferBoardsInput,
  offerBoards,
  orderLists,
  splitCardText,
} from '../cards/ordering';
import {
  CardPreferences,
  EMPTY_PREFERENCES,
  loadCardPreferences,
  mostUsedBoardId,
  rememberCardDestination,
} from '../cards/preferences';
import {Button} from '../components/Button';
import {ChoiceList} from '../components/ChoiceList';
import {CloseIcon} from '../components/CloseIcon';
import {LabelChip} from '../components/LabelChip';
import {MemberAvatar} from '../components/MemberAvatar';
import {ScreenFrame} from '../components/ScreenFrame';
import {SmallButton} from '../components/SmallButton';
import {ToggleChip} from '../components/ToggleChip';
import {TranslationKey, useTranslation} from '../i18n';
import {LassoTextError, LassoTextResult} from '../plugin/lassoText';
import {SessionErrorCode, toSessionError} from '../session/trelloSession';
import {KeyValueStore} from '../storage/keyValueStore';
import {
  isSupernoteRoadmap,
  TrelloBoard,
  TrelloBoardMember,
  TrelloCard,
  TrelloClient,
  TrelloLabel,
  TrelloList,
} from '../trello';
import {borders, colors, spacing, typography} from '../theme';

type Step =
  | {kind: 'recognizing'}
  | {kind: 'noText'; error: LassoTextError; diagnostics: string}
  | {kind: 'loading'}
  | {kind: 'failed'; error: SessionErrorCode; retry: () => void}
  | {kind: 'form'}
  | {kind: 'pickBoard'}
  | {kind: 'pickList'}
  | {kind: 'creating'}
  | {
      kind: 'done';
      board: TrelloBoard;
      list: TrelloList;
      card: TrelloCard;
      /** The card exists, but its checklist could not be added. */
      checklistFailed: boolean;
    };

/** Lists, labels and members of the chosen board. */
type BoardDetails =
  | {status: 'loading'}
  | {status: 'failed'}
  | {
      status: 'ready';
      lists: TrelloList[];
      labels: TrelloLabel[];
      members: TrelloBoardMember[];
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

const AVATAR_SIZE = 28;

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
 * Turns the lasso selection into a Trello card. Once the handwriting is
 * recognized, a single page shows the card: board and list (filled in with
 * the last ones used, or the only ones offered), labels, members, title,
 * description and checklist, all editable before the card is created.
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
  const [board, setBoard] = useState<TrelloBoard | null>(null);
  const [details, setDetails] = useState<BoardDetails | null>(null);
  const [list, setList] = useState<TrelloList | null>(null);
  const [labelIds, setLabelIds] = useState<string[]>([]);
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [items, setItems] = useState<FormCheckItem[]>([]);
  const [createError, setCreateError] = useState<SessionErrorCode | null>(null);
  const preferences = useRef<CardPreferences>(EMPTY_PREFERENCES);
  // Board whose details are awaited: an older answer is dropped.
  const detailsBoardId = useRef<string | null>(null);
  const nextItemKey = useRef(0);

  const makeItems = useCallback(
    (source: readonly {name: string; checked: boolean}[]): FormCheckItem[] =>
      source.map(item => ({...item, key: String(nextItemKey.current++)})),
    [],
  );

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

  const loadBoardDetails = useCallback(
    async (target: TrelloBoard): Promise<void> => {
      detailsBoardId.current = target.id;
      setDetails({status: 'loading'});
      setList(null);
      setLabelIds([]);
      setMemberIds([]);
      try {
        const [lists, labels, members] = await Promise.all([
          client.getBoardLists(target.id),
          client.getBoardLabels(target.id),
          client.getBoardMembers(target.id),
        ]);
        if (detailsBoardId.current !== target.id) {
          return;
        }
        const lastListId = preferences.current.lastListByBoard[target.id];
        setDetails({
          status: 'ready',
          lists: orderLists(lists, lastListId),
          labels,
          members: membersMeFirst(members, memberId),
        });
        setList(defaultChoice(lists, lastListId));
      } catch (error) {
        if (detailsBoardId.current !== target.id) {
          return;
        }
        console.warn('[sINK] Failed to load the board of the new card', error);
        if (toSessionError(error) === 'invalidToken') {
          onTokenRejected();
          return;
        }
        setDetails({status: 'failed'});
      }
    },
    [client, memberId, onTokenRejected],
  );

  const chooseBoard = useCallback(
    (target: TrelloBoard) => {
      setBoard(target);
      loadBoardDetails(target);
    },
    [loadBoardDetails],
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
          b => !isSupernoteRoadmap(b) && !isObserverOf(b, memberId),
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
        setStep({kind: 'form'});
        const initial = defaultChoice(
          [...ownBoards, ...writablePublic],
          prefs.lastBoardId,
        );
        if (initial) {
          chooseBoard(initial);
        }
      } catch (error) {
        fail(error, () => {
          setStep({kind: 'loading'});
          loadBoards(prefs);
        });
      }
    },
    [chooseBoard, client, fail, memberId, store],
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
    setItems(makeItems(split.checkItems));
    setStep({kind: 'loading'});
    await loadBoards(prefs);
  }, [lasso, loadBoards, makeItems, store]);

  /** Continues without recognized text: the user types the card. */
  const writeManually = useCallback(async () => {
    setName('');
    setDesc('');
    setItems([]);
    setStep({kind: 'loading'});
    await loadBoards(preferences.current);
  }, [loadBoards]);

  useEffect(() => {
    start();
  }, [start]);

  const create = useCallback(async () => {
    if (!board || !list || !name.trim()) {
      return;
    }
    setCreateError(null);
    setStep({kind: 'creating'});
    try {
      const card = await client.createCard({
        idList: list.id,
        name: name.trim(),
        desc: desc.trim(),
        idLabels: labelIds,
        idMembers: memberIds,
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
        await addCardChecklist(client, card.id, checkItemsToCreate(items));
      } catch (error) {
        console.warn('[sINK] Failed to add the checklist', error);
        checklistFailed = true;
      }
      setStep({kind: 'done', board, list, card, checklistFailed});
    } catch (error) {
      console.warn('[sINK] Failed to create the card', error);
      const code = toSessionError(error);
      if (code === 'invalidToken') {
        onTokenRejected();
        return;
      }
      setCreateError(code);
      setStep({kind: 'form'});
    }
  }, [
    board,
    client,
    desc,
    items,
    labelIds,
    list,
    memberIds,
    name,
    onTokenRejected,
    store,
  ]);

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

  const updateItem = useCallback(
    (key: string, change: Partial<Omit<FormCheckItem, 'key'>>) =>
      setItems(current =>
        current.map(item => (item.key === key ? {...item, ...change} : item)),
      ),
    [],
  );

  const title = t('card.title');
  const backToForm = () => setStep({kind: 'form'});

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

    case 'pickBoard':
      return (
        <ScreenFrame title={t('card.chooseBoard')} onBack={backToForm}>
          <ChoiceList
            choices={offeredBoards.map(({board: offered, badges}) => ({
              id: offered.id,
              label: offered.starred ? `★ ${offered.name}` : offered.name,
              tag:
                badges.length > 0
                  ? badges.map(badge => badgeLabels[badge]).join(' · ')
                  : undefined,
              highlighted: badges.includes('mostUsed'),
            }))}
            emptyText={t('boards.empty')}
            onSelect={id => {
              const picked = allBoards.find(b => b.id === id);
              if (picked && picked.id !== board?.id) {
                chooseBoard(picked);
              }
              backToForm();
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

    case 'pickList': {
      const lists = details?.status === 'ready' ? details.lists : [];
      const lastListId = board
        ? preferences.current.lastListByBoard[board.id]
        : undefined;
      return (
        <ScreenFrame
          title={t('card.chooseList', {board: board?.name ?? ''})}
          onBack={backToForm}>
          <ChoiceList
            choices={lists.map(l => ({
              id: l.id,
              label: l.name,
              tag: l.id === lastListId ? t('card.lastUsed') : undefined,
            }))}
            emptyText={t('card.noLists')}
            onSelect={id => {
              const picked = lists.find(l => l.id === id);
              if (picked) {
                setList(picked);
              }
              backToForm();
            }}
          />
        </ScreenFrame>
      );
    }

    case 'form': {
      const ready = details?.status === 'ready' ? details : null;
      const missingPlace = !board || !list;
      const missingName = name.trim().length === 0;
      return (
        <ScreenFrame
          title={title}
          dialog={{
            cancelLabel: t('common.cancel'),
            onCancel: close,
            confirmLabel: t('card.create'),
            onConfirm: create,
            confirmDisabled: missingPlace || missingName,
          }}>
          <ScrollView
            contentContainerStyle={styles.form}
            keyboardShouldPersistTaps="handled">
            {createError && (
              <Text accessibilityRole="alert" style={styles.error}>
                {t(SESSION_ERRORS[createError])}
              </Text>
            )}
            {missingPlace ? (
              <Text style={styles.hint}>{t('card.listRequired')}</Text>
            ) : missingName ? (
              <Text style={styles.hint}>{t('card.nameRequired')}</Text>
            ) : null}
            <View style={styles.placeRow}>
              <Text style={styles.placeLabel}>{t('card.board')}</Text>
              <View style={styles.placeValue}>
                <Button
                  primary={!board}
                  label={board ? board.name : t('card.chooseBoard')}
                  onPress={() => setStep({kind: 'pickBoard'})}
                />
              </View>
            </View>
            <View style={styles.placeRow}>
              <Text style={styles.placeLabel}>{t('card.list')}</Text>
              <View style={styles.placeValue}>
                {!board ? (
                  <Button
                    disabled
                    label={t('card.chooseListButton')}
                    onPress={() => {}}
                  />
                ) : details?.status === 'loading' ? (
                  <Text style={styles.message}>{t('card.loading')}</Text>
                ) : ready ? (
                  <Button
                    primary={!list}
                    label={list ? list.name : t('card.chooseListButton')}
                    onPress={() => setStep({kind: 'pickList'})}
                  />
                ) : null}
              </View>
            </View>
            {board && details?.status === 'failed' && (
              <View style={styles.inlineError}>
                <Text accessibilityRole="alert" style={styles.message}>
                  {t('card.detailsFailed')}
                </Text>
                <SmallButton
                  label={t('common.retry')}
                  accessibilityLabel={t('common.retry')}
                  onPress={() => loadBoardDetails(board)}
                />
              </View>
            )}

            <Section title={t('card.labels')}>
              {!board ? (
                <Text style={styles.hint}>{t('card.chooseBoardFirst')}</Text>
              ) : !ready ? null : ready.labels.length === 0 ? (
                <Text style={styles.hint}>{t('card.noLabels')}</Text>
              ) : (
                <View style={styles.chips}>
                  {ready.labels.map(label => {
                    const selected = labelIds.includes(label.id);
                    const labelName = label.name || label.color || '';
                    return (
                      <ToggleChip
                        key={label.id}
                        selected={selected}
                        accessibilityLabel={t(
                          selected ? 'card.remove' : 'card.add',
                          {name: labelName},
                        )}
                        onPress={() =>
                          setLabelIds(ids => toggleId(ids, label.id))
                        }>
                        <LabelChip label={label} />
                      </ToggleChip>
                    );
                  })}
                </View>
              )}
            </Section>

            <Section title={t('card.members')}>
              {!board ? (
                <Text style={styles.hint}>{t('card.chooseBoardFirst')}</Text>
              ) : !ready ? null : (
                <View style={styles.chips}>
                  {ready.members.map(member => {
                    const selected = memberIds.includes(member.id);
                    return (
                      <ToggleChip
                        key={member.id}
                        selected={selected}
                        accessibilityLabel={t(
                          selected ? 'card.remove' : 'card.add',
                          {name: member.fullName},
                        )}
                        onPress={() =>
                          setMemberIds(ids => toggleId(ids, member.id))
                        }>
                        <MemberAvatar
                          initials={member.initials}
                          avatarUrl={member.avatarUrl}
                          size={AVATAR_SIZE}
                        />
                        <Text style={styles.chipText} numberOfLines={1}>
                          {member.fullName}
                        </Text>
                      </ToggleChip>
                    );
                  })}
                </View>
              )}
            </Section>

            <Section title={t('card.name')}>
              <TextInput
                accessibilityLabel={t('card.name')}
                multiline
                onChangeText={setName}
                style={styles.input}
                value={name}
              />
            </Section>

            <Section title={t('card.description')}>
              <TextInput
                accessibilityLabel={t('card.description')}
                multiline
                onChangeText={setDesc}
                style={[styles.input, styles.descInput]}
                textAlignVertical="top"
                value={desc}
              />
            </Section>

            <Section title={t('card.checklist')}>
              {items.map(item => (
                <View key={item.key} style={styles.itemRow}>
                  <Pressable
                    accessibilityRole="checkbox"
                    accessibilityLabel={item.name || t('card.item')}
                    accessibilityState={{checked: item.checked}}
                    hitSlop={spacing.sm}
                    onPress={() =>
                      updateItem(item.key, {checked: !item.checked})
                    }
                    style={[styles.box, item.checked && styles.boxChecked]}>
                    {item.checked && <Text style={styles.boxMark}>✓</Text>}
                  </Pressable>
                  <TextInput
                    accessibilityLabel={t('card.item')}
                    onChangeText={text => updateItem(item.key, {name: text})}
                    style={[styles.input, styles.itemInput]}
                    value={item.name}
                  />
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t('card.remove', {
                      name: item.name || t('card.item'),
                    })}
                    hitSlop={spacing.sm}
                    onPress={() =>
                      setItems(current =>
                        current.filter(other => other.key !== item.key),
                      )
                    }
                    style={styles.box}>
                    <CloseIcon size={20} color={colors.foreground} />
                  </Pressable>
                </View>
              ))}
              <SmallButton
                label={`+ ${t('card.addItem')}`}
                accessibilityLabel={t('card.addItem')}
                onPress={() =>
                  setItems(current => [
                    ...current,
                    ...makeItems([{name: '', checked: false}]),
                  ])
                }
              />
            </Section>
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

/** A titled block of the form, underlined like the sections of a note. */
function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <View style={styles.section}>
      <Text accessibilityRole="header" style={styles.sectionTitle}>
        {title}
      </Text>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
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
    const publicBoard = result.value;
    return !publicBoard.closed &&
      !isSupernoteRoadmap(publicBoard) &&
      canAddCards(publicBoard, memberId, false)
      ? [publicBoard]
      : [];
  });
}

const BOX_SIZE = 36;

const styles = StyleSheet.create({
  stack: {
    gap: spacing.md,
    paddingBottom: spacing.xl,
  },
  form: {
    gap: spacing.lg,
    paddingBottom: spacing.xl,
  },
  message: {
    color: colors.foreground,
    fontSize: typography.body,
  },
  hint: {
    color: colors.foreground,
    fontSize: typography.body,
    fontStyle: 'italic',
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
  placeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  placeLabel: {
    width: 120,
    color: colors.foreground,
    fontSize: typography.label,
    fontWeight: '700',
  },
  placeValue: {
    flex: 1,
  },
  inlineError: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  section: {
    gap: spacing.sm,
  },
  sectionTitle: {
    borderBottomColor: colors.foreground,
    borderBottomWidth: borders.width,
    color: colors.foreground,
    fontSize: typography.label,
    fontWeight: '700',
    paddingBottom: spacing.xs,
  },
  sectionBody: {
    gap: spacing.sm,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chipText: {
    flexShrink: 1,
    color: colors.foreground,
    fontSize: typography.body,
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
    minHeight: 140,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  itemInput: {
    flex: 1,
  },
  box: {
    width: BOX_SIZE,
    height: BOX_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    borderColor: colors.foreground,
    borderWidth: borders.width,
    backgroundColor: colors.background,
  },
  boxChecked: {
    backgroundColor: colors.foreground,
  },
  boxMark: {
    color: colors.background,
    fontSize: typography.label,
    fontWeight: '700',
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
