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

import {labelShade} from '../board/labels';
import {loadBoardsPreferences} from '../boards/preferences';
import {addCardChecklist} from '../cards/checklist';
import {
  cardShortLink,
  checkItemsToCreate,
  chipIds,
  defaultChoice,
  FormCheckItem,
  membersMeFirst,
  toggleId,
} from '../cards/newCardForm';
import {
  DEFAULT_NEW_CARD_SETTINGS,
  loadNewCardSettings,
  NewCardSettings,
} from '../cards/newCardSettings';
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
  mostUsedIds,
  rememberCardDestination,
} from '../cards/preferences';
import {Button} from '../components/Button';
import {ChoiceList} from '../components/ChoiceList';
import {CloseIcon} from '../components/CloseIcon';
import {MemberAvatar} from '../components/MemberAvatar';
import {ScreenFrame} from '../components/ScreenFrame';
import {SmallButton} from '../components/SmallButton';
import {
  CHIP_BORDER_WIDTH,
  CHIP_HEIGHT,
  ToggleChip,
} from '../components/ToggleChip';
import {TranslationKey, useTranslation} from '../i18n';
import {logInkLink} from '../inkLink/diagnostics';
import {bindSelection} from '../inkLink/lassoBinding';
import {
  LassoSelection,
  LassoTextError,
  LassoTextResult,
} from '../plugin/lassoText';
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
      /** Whether the lasso selection was linked to the card, if asked. */
      link: 'off' | 'linked' | 'failed';
    };

/** Which list the floating picker shows, and where, under its button. */
type Picker = {
  kind: 'labels' | 'members';
  /** Position in the form, kept inside it. */
  left: number;
  top: number;
  maxHeight: number;
};

const PICKER_WIDTH = 440;
const PICKER_MIN_HEIGHT = 240;

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
/** The "+" that opens the full list: a short pill, easy to hit. */
const PICKER_BUTTON_WIDTH = 64;

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
  const [picker, setPicker] = useState<Picker | null>(null);
  const preferences = useRef<CardPreferences>(EMPTY_PREFERENCES);
  const settings = useRef<NewCardSettings>(DEFAULT_NEW_CARD_SETTINGS);
  // Where the card was circled, to link it to the card once created.
  const selection = useRef<LassoSelection | undefined>(undefined);
  // The form and the + buttons, to place the floating picker under them.
  const formRef = useRef<View>(null);
  const labelsButton = useRef<View>(null);
  const membersButton = useRef<View>(null);
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
          // Labels without a name are only a color: not offered.
          labels: labels.filter(label => label.name.trim().length > 0),
          members: membersMeFirst(members, memberId),
        });
        setList(defaultChoice(lists, lastListId));
        if (
          settings.current.assignMe &&
          members.some(member => member.id === memberId)
        ) {
          setMemberIds([memberId]);
        }
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
    const [lassoText, prefs, loadedSettings] = await Promise.all([
      lasso,
      loadCardPreferences(store),
      loadNewCardSettings(store),
    ]);
    preferences.current = prefs;
    settings.current = loadedSettings;
    if (!lassoText.ok) {
      setStep({
        kind: 'noText',
        error: lassoText.error,
        diagnostics: lassoText.diagnostics,
      });
      return;
    }
    selection.current = lassoText.selection;
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
        {labelIds, memberIds, at: Date.now()},
      );
      // The card exists: a failure here must not offer to create it again.
      let checklistFailed = false;
      try {
        await addCardChecklist(client, card.id, checkItemsToCreate(items));
      } catch (error) {
        console.warn('[sINK] Failed to add the checklist', error);
        checklistFailed = true;
      }
      const link = await linkCardToSelection(
        card,
        selection.current,
        settings.current.linkSelection,
      );
      setStep({kind: 'done', board, list, card, checklistFailed, link});
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

  /** Opens the list of all labels or members under its button. */
  const openPicker = useCallback(
    (kind: Picker['kind'], button: React.RefObject<View | null>) => {
      const form = formRef.current;
      if (!button.current || !form) {
        return;
      }
      button.current.measureInWindow((bx, by, _bw, bh) =>
        form.measureInWindow((fx, fy, fw, fh) => {
          const top = by - fy + bh + spacing.xs;
          setPicker({
            kind,
            left: Math.max(0, Math.min(bx - fx, fw - PICKER_WIDTH)),
            top,
            maxHeight: Math.max(PICKER_MIN_HEIGHT, fh - top - spacing.md),
          });
        }),
      );
    },
    [],
  );

  const title = t('card.title');
  const backToForm = () => setStep({kind: 'form'});

  const labelContent = (label: TrelloLabel) => (
    <>
      <View
        style={[
          styles.swatch,
          {backgroundColor: labelShade(label.color).background},
        ]}
      />
      <Text style={styles.chipText} numberOfLines={1}>
        {label.name}
      </Text>
    </>
  );

  const memberContent = (member: TrelloBoardMember) => (
    <>
      <MemberAvatar
        initials={member.initials}
        avatarUrl={member.avatarUrl}
        size={AVATAR_SIZE}
      />
      <Text style={styles.chipText} numberOfLines={1}>
        {member.fullName}
      </Text>
    </>
  );

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
      // The most used labels and members of the board, then those added
      // from the floating list; all of them are in that list.
      const count = settings.current.suggestionCount;
      const pick = <T extends {id: string}>(
        all: readonly T[],
        stats: Parameters<typeof mostUsedIds>[0],
        selected: readonly string[],
      ): T[] => {
        const ids = all.map(item => item.id);
        return chipIds(ids, mostUsedIds(stats, ids, count), selected)
          .map(id => all.find(item => item.id === id))
          .filter((item): item is T => !!item);
      };
      const shownLabels =
        ready && board
          ? pick(
              ready.labels,
              preferences.current.labelUseByBoard?.[board.id],
              labelIds,
            )
          : [];
      const shownMembers =
        ready && board
          ? pick(
              ready.members,
              preferences.current.memberUseByBoard?.[board.id],
              memberIds,
            )
          : [];
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
          <View ref={formRef} collapsable={false} style={styles.formArea}>
            <ScrollView
              contentContainerStyle={styles.form}
              keyboardShouldPersistTaps="handled"
              // The floating list stays under its button: it closes on scroll.
              onScrollBeginDrag={() => setPicker(null)}>
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
              <View style={styles.placeBlock}>
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
                  {/* Elbow from under the board down to the list: the list
                    belongs to the board. */}
                  <View style={styles.connector}>
                    <View style={styles.connectorGap} />
                    <View style={styles.connectorElbow} />
                    <View style={styles.connectorRest} />
                  </View>
                  <View style={styles.connectorDot} />
                  <View style={[styles.placeValue, styles.listValue]}>
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
                    {shownLabels.map(label => {
                      const selected = labelIds.includes(label.id);
                      return (
                        <ToggleChip
                          key={label.id}
                          selected={selected}
                          accessibilityLabel={t(
                            selected ? 'card.remove' : 'card.add',
                            {name: label.name},
                          )}
                          onPress={() =>
                            setLabelIds(ids => toggleId(ids, label.id))
                          }>
                          {labelContent(label)}
                        </ToggleChip>
                      );
                    })}
                    <PickerButton
                      buttonRef={labelsButton}
                      label={t('card.pickLabel')}
                      onPress={() => openPicker('labels', labelsButton)}
                    />
                  </View>
                )}
              </Section>

              <Section title={t('card.members')}>
                {!board ? (
                  <Text style={styles.hint}>{t('card.chooseBoardFirst')}</Text>
                ) : !ready ? null : (
                  <View style={styles.chips}>
                    {shownMembers.map(member => {
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
                          {memberContent(member)}
                        </ToggleChip>
                      );
                    })}
                    <PickerButton
                      buttonRef={membersButton}
                      label={t('card.pickMember')}
                      onPress={() => openPicker('members', membersButton)}
                    />
                  </View>
                )}
              </Section>

              <Section plain title={t('card.name')}>
                <TextInput
                  accessibilityLabel={t('card.name')}
                  multiline
                  onChangeText={setName}
                  style={styles.input}
                  value={name}
                />
              </Section>

              <Section plain title={t('card.description')}>
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
            {picker && ready && (
              <FloatingPicker
                picker={picker}
                closeLabel={t('common.close')}
                onClose={() => setPicker(null)}
                rows={
                  picker.kind === 'labels'
                    ? ready.labels.map(label => ({
                        id: label.id,
                        name: label.name,
                        selected: labelIds.includes(label.id),
                        content: labelContent(label),
                      }))
                    : ready.members.map(member => ({
                        id: member.id,
                        name: member.fullName,
                        selected: memberIds.includes(member.id),
                        content: memberContent(member),
                      }))
                }
                onToggle={id =>
                  picker.kind === 'labels'
                    ? setLabelIds(ids => toggleId(ids, id))
                    : setMemberIds(ids => toggleId(ids, id))
                }
              />
            )}
          </View>
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
            {step.link === 'linked' && (
              <Text style={styles.message}>{t('card.linked')}</Text>
            )}
            {step.link === 'failed' && (
              <Text accessibilityRole="alert" style={styles.error}>
                {t('card.linkFailed')}
              </Text>
            )}
            <Button primary label={t('common.close')} onPress={close} />
          </View>
        </ScreenFrame>
      );
  }
}

/**
 * A titled block of the form, underlined like the sections of a note.
 * `plain` leaves the line out, for a block that is a single framed field.
 */
function Section({
  title,
  plain = false,
  children,
}: {
  title: string;
  plain?: boolean;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <View style={styles.section}>
      <Text
        accessibilityRole="header"
        style={[styles.sectionTitle, plain && styles.sectionTitlePlain]}>
        {title}
      </Text>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

/**
 * The dashed "+" after the suggestions that opens the list of all of them,
 * as high as the chips. `label` is read by accessibility services.
 */
function PickerButton({
  buttonRef,
  label,
  onPress,
}: {
  buttonRef: React.RefObject<View | null>;
  label: string;
  onPress: () => void;
}): React.JSX.Element {
  return (
    <View ref={buttonRef} collapsable={false}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        hitSlop={spacing.xs}
        onPress={onPress}
        style={({pressed}) => [
          styles.pickerButton,
          pressed && styles.pickerButtonPressed,
        ]}>
        {({pressed}) => (
          <Text
            style={[
              styles.pickerButtonText,
              pressed && styles.pickerButtonTextPressed,
            ]}>
            +
          </Text>
        )}
      </Pressable>
    </View>
  );
}

interface PickerRow {
  id: string;
  name: string;
  selected: boolean;
  content: React.ReactNode;
}

/**
 * List of all the labels or members of the board, floating under the
 * button that opened it. A tap adds or removes one and leaves it open;
 * a tap anywhere else closes it.
 */
function FloatingPicker({
  picker,
  rows,
  closeLabel,
  onToggle,
  onClose,
}: {
  picker: Picker;
  rows: readonly PickerRow[];
  closeLabel: string;
  onToggle: (id: string) => void;
  onClose: () => void;
}): React.JSX.Element {
  return (
    <>
      <Pressable
        accessibilityLabel={closeLabel}
        onPress={onClose}
        style={StyleSheet.absoluteFill}
      />
      <View
        accessibilityViewIsModal
        style={[
          styles.pickerCard,
          {left: picker.left, top: picker.top, maxHeight: picker.maxHeight},
        ]}>
        <ScrollView keyboardShouldPersistTaps="handled">
          {rows.map(row => (
            <Pressable
              key={row.id}
              accessibilityRole="checkbox"
              accessibilityLabel={row.name}
              accessibilityState={{checked: row.selected}}
              onPress={() => onToggle(row.id)}
              style={({pressed}) => [
                styles.pickerRow,
                pressed && styles.pickerRowPressed,
              ]}>
              <View style={[styles.box, row.selected && styles.boxChecked]}>
                {row.selected && <Text style={styles.boxMark}>✓</Text>}
              </View>
              <View style={styles.pickerRowContent}>{row.content}</View>
            </Pressable>
          ))}
        </ScrollView>
      </View>
    </>
  );
}

/**
 * Links the lasso selection the card was made from to the new card, when
 * the setting asks for it, as the Insert Trello Link button does.
 */
async function linkCardToSelection(
  card: TrelloCard,
  lassoSelection: LassoSelection | undefined,
  enabled: boolean,
): Promise<'off' | 'linked' | 'failed'> {
  if (!enabled || !lassoSelection) {
    return 'off';
  }
  const shortLink = cardShortLink(card);
  if (!shortLink) {
    logInkLink('card: no short link to link the selection to');
    return 'failed';
  }
  try {
    const bound = await bindSelection(lassoSelection, {
      kind: 'card',
      shortLink,
    });
    return bound ? 'linked' : 'failed';
  } catch (error) {
    logInkLink(`card: linking the selection failed: ${String(error)}`);
    return 'failed';
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
    const publicBoard = result.value;
    return !publicBoard.closed &&
      !isSupernoteRoadmap(publicBoard) &&
      canAddCards(publicBoard, memberId, false)
      ? [publicBoard]
      : [];
  });
}

const BOX_SIZE = 36;
/** Space between the board row and the list row, spanned by the elbow. */
const PLACE_GAP = spacing.md;
const PLACE_LABEL_WIDTH = 120;
const CONNECTOR_DOT = 14;

const styles = StyleSheet.create({
  stack: {
    gap: spacing.md,
    paddingBottom: spacing.xl,
  },
  form: {
    gap: spacing.lg,
    paddingBottom: spacing.xl,
  },
  formArea: {
    flex: 1,
  },
  pickerButton: {
    width: PICKER_BUTTON_WIDTH,
    height: CHIP_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    borderColor: colors.foreground,
    borderRadius: 999,
    borderStyle: 'dashed',
    borderWidth: CHIP_BORDER_WIDTH,
    backgroundColor: colors.background,
  },
  pickerButtonPressed: {
    backgroundColor: colors.foreground,
  },
  pickerButtonText: {
    color: colors.foreground,
    fontSize: typography.label,
    fontWeight: '700',
  },
  pickerButtonTextPressed: {
    color: colors.background,
  },
  pickerCard: {
    position: 'absolute',
    width: PICKER_WIDTH,
    backgroundColor: colors.background,
    borderColor: colors.foreground,
    borderRadius: borders.radius,
    borderWidth: borders.width * 1.5,
    paddingVertical: spacing.xs,
  },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  pickerRowPressed: {
    backgroundColor: colors.avatar,
  },
  pickerRowContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
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
  placeBlock: {
    gap: PLACE_GAP,
  },
  placeRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  placeLabel: {
    width: PLACE_LABEL_WIDTH,
    marginRight: spacing.md,
    color: colors.foreground,
    fontSize: typography.label,
    fontWeight: '700',
  },
  placeValue: {
    flex: 1,
    alignItems: 'flex-start',
  },
  listValue: {
    marginLeft: spacing.sm,
  },
  // Starts under the board button, from its bottom edge (the negative
  // margin spans the gap between the rows), and turns at the middle of
  // the list row: gap, then two equal halves of the row.
  connector: {
    alignSelf: 'stretch',
    marginTop: -PLACE_GAP,
    marginLeft: spacing.lg,
    width: spacing.xl,
  },
  connectorGap: {
    height: PLACE_GAP,
    borderLeftColor: colors.foreground,
    borderLeftWidth: borders.width,
  },
  connectorElbow: {
    flex: 1,
    borderLeftColor: colors.foreground,
    borderLeftWidth: borders.width,
    borderBottomColor: colors.foreground,
    borderBottomWidth: borders.width,
  },
  connectorRest: {
    flex: 1,
  },
  connectorDot: {
    width: CONNECTOR_DOT,
    height: CONNECTOR_DOT,
    // Centered on the end of the line.
    marginLeft: -CONNECTOR_DOT / 2,
    borderRadius: CONNECTOR_DOT / 2,
    backgroundColor: colors.foreground,
  },
  swatch: {
    width: 22,
    height: 22,
    borderRadius: 4,
    borderColor: colors.labelBorder,
    borderWidth: 1.5,
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
  sectionTitlePlain: {
    borderBottomWidth: 0,
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
