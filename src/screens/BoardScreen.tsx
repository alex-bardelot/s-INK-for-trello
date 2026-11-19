import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  LayoutChangeEvent,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';

import {
  ColumnSegment,
  DEFAULT_FOCUS_SETTINGS,
  ModeChoice,
  FocusSettings,
  focusBoard,
  ListBlock,
  loadFocusSettings,
  reviewBoard,
  saveFocusSettings,
  stackLists,
} from '../board/focus';
import {
  clampPage,
  DEFAULT_COLUMNS,
  groupCardsByList,
  orientationOf,
  pageCount,
  pageOfItem,
  paginate,
  SwipeDirection,
} from '../board/layout';
import {BoardPreferences, loadBoardPreferences} from '../board/preferences';
import {useTwoFingerSwipe} from '../board/useTwoFingerSwipe';
import {withBoardCardComplete, withBoardCardDetail} from '../cards/completion';
import {formatCardDate} from '../cards/detail';
import {canAddCards, canComment} from '../cards/ordering';
import {
  BIND_TAB_HEIGHT,
  BIND_TAB_ROOM,
  BindSelectionButton,
} from '../components/BindSelectionButton';
import {usePendingBinding} from '../inkLink/lassoBinding';
import {useConnectivity} from '../network/connectivity';
import {CompleteMark} from '../components/CompleteMark';
import {InsertInkLinkButton} from '../components/InsertInkLinkButton';
import {LabelChip} from '../components/LabelChip';
import {MemberAvatar} from '../components/MemberAvatar';
import {RefreshIcon} from '../components/RefreshIcon';
import {Segment, SegmentGroup} from '../components/SegmentedControl';
import {HEADER_ICON_SIZE, ScreenFrame} from '../components/ScreenFrame';
import {useSettingsOpener} from '../components/settingsOpener';
import {SmallButton} from '../components/SmallButton';
import {WaitingBox} from '../components/WaitingBox';
import {Locale, useTranslation} from '../i18n';
import {toSessionError} from '../session/trelloSession';
import {KeyValueStore} from '../storage/keyValueStore';
import {
  isSupernoteRoadmap,
  TrelloBoard,
  TrelloBoardCard,
  TrelloBoardMember,
  TrelloCard,
  TrelloCardDetail,
  TrelloClient,
  TrelloList,
} from '../trello';
import {borders, colors, spacing, typography} from '../theme';
import {CardDetailScreen} from './CardDetailScreen';
import {CreateCardScreen, NewCardPlace} from './CreateCardScreen';
import {
  ArchiveCardPopup,
  ArchiveState,
  CardMenu,
  CardMenuTarget,
  CompleteFailedPopup,
  measureCardRect,
} from './CardMenu';
import {WaitingScreen} from './StatusScreen';

const CARD_GAP = spacing.sm;
/** The round before the name of a complete card. */
const COMPLETE_MARK_SIZE = 24;
const COLUMN_GAP = spacing.lg;
/** Space between two lists stacked in the same column (Focus, Review). */
const LIST_GAP = spacing.lg;
const AVATAR_SIZE = 36;
const MAX_AVATARS = 3;

type MembersById = ReadonlyMap<string, TrelloBoardMember>;
type OpenCard = (card: TrelloBoardCard) => void;
/** A long press on a card: `tile` is the view it is drawn in. */
type PressCardLong = (card: TrelloBoardCard, tile: View) => void;
/** Records the height of the view laid out for `key`. */
type MeasureView = (key: string, event: LayoutChangeEvent) => void;

/**
 * Heights of views laid out in an invisible layer, by key. Each layout
 * event only notes its height; the heights are handed over in one render,
 * once every key of `keys` has one (and again when one changes after
 * that). Storing each height as it came re-rendered the screen, and every
 * card of the layer, once per card: on a board with many cards, Focus
 * mode took seconds to show.
 *
 * @param keys the views to measure; memoize it.
 */
function useMeasuredHeights(
  keys: readonly string[],
): [Readonly<Record<string, number>>, MeasureView] {
  const measured = useRef<Record<string, number>>({});
  const [heights, setHeights] = useState<Readonly<Record<string, number>>>({});
  const keysRef = useRef(keys);
  keysRef.current = keys;

  const commitIfComplete = useCallback(() => {
    const all = measured.current;
    if (keysRef.current.every(key => all[key] !== undefined)) {
      setHeights(current =>
        keysRef.current.every(key => current[key] === all[key])
          ? current
          : {...all},
      );
    }
  }, []);

  const measure = useCallback<MeasureView>(
    (key, event) => {
      const height = Math.ceil(event.nativeEvent.layout.height);
      if (measured.current[key] !== height) {
        measured.current[key] = height;
        commitIfComplete();
      }
    },
    [commitIfComplete],
  );

  // Views dropped from the layer send no event: what is left may already
  // be measured.
  useEffect(commitIfComplete, [commitIfComplete, keys]);

  return [heights, measure];
}

type BoardState =
  | {status: 'loading'}
  | {
      status: 'loaded';
      lists: TrelloList[];
      cardsByList: ReadonlyMap<string, TrelloBoardCard[]>;
      members: MembersById;
    }
  | {status: 'failed'};

export interface BoardScreenProps {
  board: TrelloBoard;
  client: TrelloClient;
  store: KeyValueStore;
  /** Id of the signed-in member, whose cards Focus mode keeps. */
  memberId: string;
  /**
   * Card the board opens at, once loaded: the whole board shows, at the
   * page of its list and at the page of its list's cards where it is.
   */
  initialCardId?: string;
  /** Whether the initial card also opens over the board (s-INK links). */
  openInitialCard?: boolean;
  onBack: () => void;
  /** Called when Trello rejects the token while loading. */
  onTokenRejected: () => void;
  /**
   * A card added from the board went to another board, chosen on the card
   * creation page: that board opens where the card is.
   */
  onOpenCardElsewhere?: (board: TrelloBoard, cardId: string) => void;
}

/**
 * Shows the lists of a board side by side (1 to 3 columns in portrait, 1 to 4 in landscape, chosen per
 * orientation). Lists and cards are browsed page by page, with buttons or a
 * two-finger swipe, rather than by scrolling, which is slow on E Ink.
 */
export function BoardScreen({
  board,
  client,
  store,
  memberId,
  initialCardId,
  openInitialCard = true,
  onBack,
  onTokenRejected,
  onOpenCardElsewhere,
}: BoardScreenProps): React.JSX.Element {
  const {t} = useTranslation();
  const {width, height} = useWindowDimensions();
  const orientation = orientationOf(width, height);

  const [state, setState] = useState<BoardState>({status: 'loading'});
  const [preferences, setPreferences] =
    useState<BoardPreferences>(DEFAULT_COLUMNS);
  const [firstList, setFirstList] = useState(0);
  const [focus, setFocus] = useState<FocusSettings>(DEFAULT_FOCUS_SETTINGS);
  const [openCard, setOpenCard] = useState<TrelloBoardCard | null>(null);
  // Opened at a card, the whole board shows whatever the saved mode, so
  // that the card is there; choosing a mode goes back to it.
  const [wholeBoard, setWholeBoard] = useState(!!initialCardId);

  // Settings opens over the board, which stays mounted (the opener is
  // `null` meanwhile): the columns and the Focus tags chosen there are read
  // again once it closes.
  const settingsClosed = useSettingsOpener() !== null;
  useEffect(() => {
    if (!settingsClosed) {
      return;
    }
    let active = true;
    loadBoardPreferences(store).then(
      loaded => active && setPreferences(loaded),
    );
    loadFocusSettings(store).then(loaded => active && setFocus(loaded));
    return () => {
      active = false;
    };
  }, [settingsClosed, store]);

  // A quiet load keeps the board shown until the new one comes, and keeps
  // it when the load fails.
  const fetchBoard = useCallback(
    async (quiet: boolean) => {
      if (!quiet) {
        setState({status: 'loading'});
      }
      try {
        const [lists, cards, members] = await Promise.all([
          client.getBoardLists(board.id),
          client.getBoardCards(board.id),
          // Avatars are a nicety: the board still shows without them.
          client.getBoardMembers(board.id).catch(error => {
            console.warn('[sINK] Failed to load board members', error);
            return [];
          }),
        ]);
        setState({
          status: 'loaded',
          lists,
          cardsByList: groupCardsByList(cards),
          members: new Map(members.map(member => [member.id, member])),
        });
      } catch (error) {
        console.warn('[sINK] Failed to load board', error);
        if (toSessionError(error) === 'invalidToken') {
          onTokenRejected();
          return;
        }
        if (!quiet) {
          setState({status: 'failed'});
        }
      }
    },
    [board.id, client, onTokenRejected],
  );
  const load = useCallback(() => fetchBoard(false), [fetchBoard]);

  useEffect(() => {
    load();
  }, [load]);

  // Offline, the Offline button stands where the refresh button was. Once
  // the internet is back, a board that failed to load is loaded again.
  const online = useConnectivity() === 'online';
  const failed = state.status === 'failed';
  useEffect(() => {
    if (online && failed) {
      load();
    }
    // Only on the return of the internet, not on each failure.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online]);

  // The board opens at the initial card once, on the first load: its list
  // comes first on the page of lists (its column pages to the card), and an
  // s-INK link also opens the card.
  const [initialCardShown, setInitialCardShown] = useState(false);
  useEffect(() => {
    if (!initialCardId || initialCardShown || state.status !== 'loaded') {
      return;
    }
    setInitialCardShown(true);
    for (const cards of state.cardsByList.values()) {
      const card = cards.find(candidate => candidate.id === initialCardId);
      if (card) {
        const index = state.lists.findIndex(list => list.id === card.idList);
        if (index >= 0) {
          setFirstList(index);
        }
        if (openInitialCard) {
          setOpenCard(card);
        }
        return;
      }
    }
  }, [initialCardId, initialCardShown, openInitialCard, state]);

  const columns = preferences[orientation];

  const updateFocus = useCallback(
    (next: FocusSettings) => {
      setFocus(next);
      saveFocusSettings(store, next);
    },
    [store],
  );
  const changeMode = useCallback(
    (choice: ModeChoice) => {
      updateFocus({...focus, mode: choice === 'all' ? null : choice});
      setWholeBoard(false);
    },
    [focus, updateFocus],
  );
  // Focus and Review are about the user's own cards: they make no sense on
  // Supernote's roadmap, where the board is always shown in full. Turned
  // off in Settings, no board offers them.
  const modesAvailable = focus.enabled && !isSupernoteRoadmap(board);
  const mode = modesAvailable && !wholeBoard ? focus.mode : null;
  const modeChoices: Segment<ModeChoice>[] = [
    {value: 'all', label: t('settings.modeAll')},
    {value: 'focus', label: t('board.focus')},
    {value: 'review', label: t('board.review')},
  ];

  // Focus and Review modes both show a filtered board, stacked.
  const focused = useMemo(() => {
    if (state.status !== 'loaded') {
      return null;
    }
    switch (mode) {
      case 'focus':
        return focusBoard(
          state.lists,
          state.cardsByList,
          memberId,
          focus.focus,
        );
      case 'review':
        return reviewBoard(
          state.lists,
          state.cardsByList,
          memberId,
          focus.review,
        );
      default:
        return null;
    }
  }, [focus.focus, focus.review, mode, memberId, state]);

  const lists = state.status === 'loaded' ? state.lists : [];
  const listPages = pageCount(lists.length, columns);
  const listPage = clampPage(
    Math.floor(firstList / columns),
    lists.length,
    columns,
  );
  const start = listPage * columns;
  const visibleLists = lists.slice(start, start + columns);

  const turnListPage = useCallback(
    (delta: number) => {
      setFirstList(
        clampPage(listPage + delta, lists.length, columns) * columns,
      );
    },
    [columns, listPage, lists.length],
  );

  // Start work from the card menu opens the card, asking to start at once.
  const [startOnOpen, setStartOnOpen] = useState(false);
  const showCard = useCallback((card: TrelloBoardCard) => {
    setStartOnOpen(false);
    setOpenCard(card);
  }, []);
  const closeCard = useCallback(() => {
    setOpenCard(null);
    setStartOnOpen(false);
  }, []);
  // Start changes the card: only for members who may edit the board.
  const canEdit = !!memberId && canAddCards(board, memberId, false);
  // Commenting has its own rule: observers may comment, editors may not.
  const commentAllowed = !!memberId && canComment(board, memberId);

  // The "Add a card" button of a list opens card creation over the board,
  // that board and list already chosen. Once the card is created, the board
  // is read again, quietly, and the list pages to the new card.
  const [newCardPlace, setNewCardPlace] = useState<NewCardPlace | null>(null);
  const [revealCardId, setRevealCardId] = useState(initialCardId);
  const addCard = useCallback(
    (list: TrelloList) => setNewCardPlace({board, list}),
    [board],
  );
  const showCreatedCard = useCallback(
    async (target: TrelloBoard, card: TrelloCard) => {
      setNewCardPlace(null);
      if (target.id !== board.id && onOpenCardElsewhere) {
        onOpenCardElsewhere(target, card.id);
        return;
      }
      // Another list may have been chosen: it comes on the page of lists.
      const known = state.status === 'loaded' ? state.lists : [];
      const index = card.idList
        ? known.findIndex(list => list.id === card.idList)
        : -1;
      if (index >= 0 && (index < start || index >= start + columns)) {
        setFirstList(index);
      }
      await fetchBoard(true);
      setRevealCardId(card.id);
    },
    [board.id, columns, fetchBoard, onOpenCardElsewhere, start, state],
  );
  // Supernote's roadmap only takes cards from Supernote.
  const cardsAddable = canEdit && !isSupernoteRoadmap(board);

  // A long press on a card opens its menu beside it.
  const screenRef = useRef<View>(null);
  const [screenSize, setScreenSize] = useState({width: 0, height: 0});
  const [menu, setMenu] = useState<CardMenuTarget | null>(null);
  const openMenu = useCallback<PressCardLong>((card, tile) => {
    const screen = screenRef.current;
    if (screen) {
      measureCardRect(tile, screen).then(rect => setMenu({card, rect}));
    }
  }, []);
  const closeMenu = useCallback(() => setMenu(null), []);

  // Archiving is confirmed first; once done, the board is loaded again,
  // still shown meanwhile.
  const [archive, setArchive] = useState<ArchiveState | null>(null);
  const archiveCard = useCallback(async () => {
    if (!archive || archive.status === 'busy') {
      return;
    }
    const {card} = archive;
    setArchive({card, status: 'busy'});
    try {
      await client.archiveCard(card.id);
    } catch (error) {
      console.warn('[sINK] Failed to archive the card', error);
      if (toSessionError(error) === 'invalidToken') {
        setArchive(null);
        onTokenRejected();
        return;
      }
      setArchive({card, status: 'failed'});
      return;
    }
    setArchive(null);
    await fetchBoard(true);
  }, [archive, client, fetchBoard, onTokenRejected]);

  // A card marked complete, or not, shows so on the board at once, whether
  // from its menu or from its page; from the menu, it goes back if Trello
  // refuses, and a popup tells so.
  const showComplete = useCallback((cardId: string, complete: boolean) => {
    setState(current =>
      current.status === 'loaded'
        ? {
            ...current,
            cardsByList: withBoardCardComplete(
              current.cardsByList,
              cardId,
              complete,
            ),
          }
        : current,
    );
  }, []);
  // Back from a card's page, its tile shows what the page last showed
  // (labels, members, dates...), at no cost; only a card moved to another
  // list, by Start work, has the board read again, quietly.
  const showLeftCard = useCallback(
    (shown: TrelloCardDetail) => {
      if (state.status !== 'loaded') {
        return;
      }
      const next = withBoardCardDetail(state.cardsByList, shown);
      if (next === null) {
        fetchBoard(true);
      } else if (next !== state.cardsByList) {
        setState({...state, cardsByList: next});
      }
    },
    [fetchBoard, state],
  );
  const [completeFailed, setCompleteFailed] = useState<TrelloBoardCard | null>(
    null,
  );
  const toggleComplete = useCallback(
    async (card: TrelloBoardCard) => {
      const complete = !card.dueComplete;
      setCompleteFailed(null);
      showComplete(card.id, complete);
      try {
        await client.setCardComplete(card.id, complete);
      } catch (error) {
        console.warn('[sINK] Failed to mark the card complete', error);
        showComplete(card.id, !complete);
        if (toSessionError(error) === 'invalidToken') {
          onTokenRejected();
          return;
        }
        setCompleteFailed(card);
      }
    },
    [client, onTokenRejected, showComplete],
  );
  const completeFailedPopup = completeFailed && (
    <CompleteFailedPopup
      card={completeFailed}
      onClose={() => setCompleteFailed(null)}
    />
  );

  const menuOverlay = menu && state.status === 'loaded' && (
    <CardMenu
      key={menu.card.id}
      target={menu}
      page={screenSize}
      canEdit={canEdit}
      onOpen={() => {
        closeMenu();
        showCard(menu.card);
      }}
      onStartWork={() => {
        closeMenu();
        setOpenCard(menu.card);
        setStartOnOpen(true);
      }}
      onToggleComplete={() => {
        closeMenu();
        toggleComplete(menu.card);
      }}
      onArchive={() => {
        closeMenu();
        setArchive({card: menu.card, status: 'confirm'});
      }}
      onClose={closeMenu}
    />
  );
  const archivePopup = archive && (
    <ArchiveCardPopup
      card={archive.card}
      busy={archive.status === 'busy'}
      failed={archive.status === 'failed'}
      onCancel={() => setArchive(null)}
      onConfirm={archiveCard}
    />
  );

  // The card detail is drawn over the board, which stays mounted: going
  // back finds the same lists and card pages, without reloading them.
  const detail = openCard && state.status === 'loaded' && (
    <View style={styles.overlay}>
      <CardDetailScreen
        card={openCard}
        startOnOpen={startOnOpen}
        boardId={board.id}
        boardName={board.name}
        listName={lists.find(list => list.id === openCard.idList)?.name ?? ''}
        members={state.members}
        client={client}
        store={store}
        memberId={memberId}
        canEdit={canEdit}
        canComment={commentAllowed}
        onBack={closeCard}
        onTokenRejected={onTokenRejected}
        onCompleteChanged={showComplete}
        onLeave={showLeftCard}
      />
    </View>
  );

  const newCard = newCardPlace && (
    <View style={styles.overlay}>
      <CreateCardScreen
        place={newCardPlace}
        client={client}
        store={store}
        memberId={memberId}
        onTokenRejected={onTokenRejected}
        onCreated={showCreatedCard}
        onCancel={() => setNewCardPlace(null)}
      />
    </View>
  );

  // A card to open over the board: the "opening" message shown while the
  // link was read stays until the card shows, drawn over the board in the
  // same frame. Showing the board first made it flash on E Ink.
  const awaitingCard =
    openInitialCard &&
    !!initialCardId &&
    !initialCardShown &&
    state.status !== 'failed';
  if (awaitingCard) {
    return <WaitingScreen message={t('inkLink.opening')} onBack={onBack} />;
  }

  return (
    <View
      ref={screenRef}
      style={styles.screen}
      onLayout={event => {
        const {width: w, height: h} = event.nativeEvent.layout;
        setScreenSize(current =>
          current.width === w && current.height === h
            ? current
            : {width: w, height: h},
        );
      }}>
      <ScreenFrame
        title={board.name}
        onBack={onBack}
        settingsCategory="boards"
        actions={
          <>
            {modesAvailable && (
              <SegmentGroup
                label={t('settings.boardMode')}
                segments={modeChoices}
                value={mode ?? 'all'}
                onChange={changeMode}
              />
            )}
            <InsertInkLinkButton
              target={{kind: 'board', shortLink: board.shortLink || board.id}}
              name={board.name}
            />
            {online && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('board.refresh')}
                hitSlop={spacing.md}
                onPress={load}
                style={styles.iconButton}>
                <RefreshIcon
                  size={HEADER_ICON_SIZE}
                  color={colors.foreground}
                />
              </Pressable>
            )}
          </>
        }>
        {state.status === 'loading' && (
          <WaitingBox message={t('board.loading')} />
        )}

        {state.status === 'failed' && (
          <View style={styles.failure}>
            <Text style={styles.message}>{t('board.loadFailed')}</Text>
            <SmallButton
              label={t('common.retry')}
              accessibilityLabel={t('common.retry')}
              onPress={load}
            />
          </View>
        )}

        {state.status === 'loaded' && focused && (
          <StackedBoard
            // Measured heights depend on the column width and on the mode.
            key={`${mode}-${columns}-${width}`}
            lists={focused.lists}
            cardsByList={focused.cardsByList}
            members={state.members}
            columns={columns}
            onOpenCard={showCard}
            onLongPressCard={openMenu}
            emptyMessage={t(
              mode === 'review' ? 'board.reviewEmpty' : 'board.focusEmpty',
            )}
          />
        )}

        {state.status === 'loaded' && !focused && lists.length === 0 && (
          <Text style={styles.message}>{t('board.noLists')}</Text>
        )}

        {state.status === 'loaded' && !focused && lists.length > 0 && (
          <>
            <View style={styles.columns}>
              {visibleLists.map(list => (
                <BoardColumn
                  key={list.id}
                  list={list}
                  cards={state.cardsByList.get(list.id) ?? []}
                  members={state.members}
                  revealCardId={revealCardId}
                  onTurnLists={turnListPage}
                  onOpenCard={showCard}
                  onLongPressCard={openMenu}
                  onAddCard={cardsAddable ? addCard : undefined}
                />
              ))}
              {Array.from({length: columns - visibleLists.length}, (_, i) => (
                <View key={`empty-${i}`} style={styles.emptyColumn} />
              ))}
            </View>

            {listPages > 1 && (
              <View style={styles.footer}>
                <SmallButton
                  label="◀"
                  accessibilityLabel={t('board.previousLists')}
                  disabled={listPage === 0}
                  onPress={() => turnListPage(-1)}
                />
                <Text style={styles.footerText}>
                  {t('board.listsRange', {
                    from: start + 1,
                    to: start + visibleLists.length,
                    total: lists.length,
                  })}
                </Text>
                <SmallButton
                  label="▶"
                  accessibilityLabel={t('board.nextLists')}
                  disabled={listPage >= listPages - 1}
                  onPress={() => turnListPage(1)}
                />
              </View>
            )}
          </>
        )}
      </ScreenFrame>
      {detail}
      {newCard}
      {menuOverlay}
      {archivePopup}
      {completeFailedPopup}
    </View>
  );
}

interface BoardColumnProps {
  list: TrelloList;
  cards: readonly TrelloBoardCard[];
  members: MembersById;
  /**
   * Card to show the page of, once per card, when the list holds it: the
   * card the board opened at, then each card added from the board.
   */
  revealCardId?: string;
  onTurnLists: (delta: number) => void;
  onOpenCard: OpenCard;
  onLongPressCard: PressCardLong;
  /** Opens card creation in this list; unset, no "Add a card" button. */
  onAddCard?: (list: TrelloList) => void;
}

/**
 * A list and one page of its cards. Cards have variable heights (labels,
 * title length, members), so they are first laid out in an invisible layer
 * to measure them; pages then hold only the cards that fit entirely.
 */
function BoardColumn({
  list,
  cards,
  members,
  revealCardId,
  onTurnLists,
  onOpenCard,
  onLongPressCard,
  onAddCard,
}: BoardColumnProps): React.JSX.Element {
  const {t, locale} = useTranslation();
  const [bodyHeight, setBodyHeight] = useState(0);
  const cardIds = useMemo(() => cards.map(card => card.id), [cards]);
  const [heights, measureCard] = useMeasuredHeights(cardIds);
  const [page, setPage] = useState(0);
  // The "Add a card" button follows the last card of the page, so its room
  // (and the gap above it) is kept out of what the cards may fill.
  const [addCardHeight, setAddCardHeight] = useState(0);
  const addCardRoom = onAddCard ? addCardHeight + CARD_GAP : 0;

  const pages = useMemo(() => {
    const measured = cards.map(card => heights[card.id]);
    if (
      bodyHeight <= 0 ||
      (onAddCard && addCardHeight <= 0) ||
      measured.some(h => h === undefined)
    ) {
      return null;
    }
    return paginate(measured as number[], bodyHeight - addCardRoom, CARD_GAP);
  }, [addCardHeight, addCardRoom, bodyHeight, cards, heights, onAddCard]);

  // Once its cards are measured, the list opens at the page of the card
  // the board was opened at, or of a card just added, if it holds it.
  const [revealedId, setRevealedId] = useState<string | undefined>();
  useEffect(() => {
    if (!revealCardId || revealedId === revealCardId || !pages) {
      return;
    }
    setRevealedId(revealCardId);
    const at = pageOfItem(
      pages,
      cards.findIndex(card => card.id === revealCardId),
    );
    if (at !== null) {
      setPage(at);
    }
  }, [cards, pages, revealCardId, revealedId]);

  const pageIndex = pages ? Math.min(page, pages.length - 1) : 0;
  const visibleCards = pages
    ? cards.slice(pages[pageIndex].start, pages[pageIndex].end)
    : [];
  const totalPages = pages?.length ?? 1;

  const turnCards = useCallback(
    (delta: number) => {
      setPage(Math.min(Math.max(0, pageIndex + delta), totalPages - 1));
    },
    [pageIndex, totalPages],
  );

  // Like turning pages in a document: swipe left for the next lists, up for
  // the next cards of this list.
  const swipeHandlers = useTwoFingerSwipe((direction: SwipeDirection) => {
    switch (direction) {
      case 'left':
        return onTurnLists(1);
      case 'right':
        return onTurnLists(-1);
      case 'up':
        return turnCards(1);
      case 'down':
        return turnCards(-1);
    }
  });

  return (
    <View style={styles.column} {...swipeHandlers}>
      <ListHeader name={list.name} count={cards.length} />

      <View
        style={styles.columnBody}
        onLayout={event => setBodyHeight(event.nativeEvent.layout.height)}>
        <CardsMeasureLayer
          cards={cards}
          members={members}
          locale={locale}
          onMeasure={measureCard}
        />
        {cards.length === 0 && (
          <Text style={styles.message}>{t('board.noCards')}</Text>
        )}
        {visibleCards.map(card => (
          <CardTile
            key={card.id}
            card={card}
            members={members}
            locale={locale}
            onPress={onOpenCard}
            onLongPress={onLongPressCard}
          />
        ))}
        {onAddCard && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('board.addCardHint', {list: list.name})}
            hitSlop={{top: spacing.xs, bottom: spacing.xs}}
            onPress={() => onAddCard(list)}
            onLayout={event =>
              setAddCardHeight(event.nativeEvent.layout.height)
            }
            style={({pressed}) => [
              styles.addCard,
              pressed && styles.addCardPressed,
            ]}>
            {({pressed}) => (
              <Text
                numberOfLines={1}
                style={[
                  styles.addCardText,
                  pressed && styles.addCardTextPressed,
                ]}>
                {`+ ${t('board.addCard')}`}
              </Text>
            )}
          </Pressable>
        )}
      </View>

      {/* Always present, so that every column body has the same height. */}
      <View style={styles.columnFooter}>
        {totalPages > 1 && (
          <>
            <SmallButton
              label="▲"
              accessibilityLabel={t('board.previousCards')}
              disabled={pageIndex === 0}
              onPress={() => turnCards(-1)}
            />
            <Text style={styles.footerText}>
              {t('board.cardsPage', {page: pageIndex + 1, total: totalPages})}
            </Text>
            <SmallButton
              label="▼"
              accessibilityLabel={t('board.nextCards')}
              disabled={pageIndex >= totalPages - 1}
              onPress={() => turnCards(1)}
            />
          </>
        )}
      </View>
    </View>
  );
}

function ListHeader({
  name,
  count,
  continued = false,
}: {
  name: string;
  count: number;
  /** The list started in a previous column. */
  continued?: boolean;
}): React.JSX.Element {
  return (
    <View style={styles.columnHeader}>
      <Text style={styles.columnTitle} numberOfLines={2}>
        {continued ? `… ${name}` : name}
      </Text>
      <Text style={styles.columnCount}>{count}</Text>
    </View>
  );
}

interface StackedBoardProps {
  lists: readonly TrelloList[];
  cardsByList: ReadonlyMap<string, TrelloBoardCard[]>;
  members: MembersById;
  columns: number;
  /** Shown when no list is left. */
  emptyMessage: string;
  onOpenCard: OpenCard;
  onLongPressCard: PressCardLong;
}

/**
 * Focus and Review modes view. Lists hold few cards there, so they are stacked one under
 * another in the columns to show as much as possible on one page; what does
 * not fit goes to the next pages. As on the board view, lists and cards are
 * first laid out in an invisible layer to measure them.
 */
function StackedBoard({
  lists,
  cardsByList,
  members,
  columns,
  emptyMessage,
  onOpenCard,
  onLongPressCard,
}: StackedBoardProps): React.JSX.Element {
  const {t, locale} = useTranslation();
  const [area, setArea] = useState({width: 0, height: 0});
  const keys = useMemo(
    () =>
      lists.flatMap(list => [
        `list:${list.id}`,
        ...(cardsByList.get(list.id) ?? []).map(card => `card:${card.id}`),
      ]),
    [cardsByList, lists],
  );
  const [heights, measure] = useMeasuredHeights(keys);
  const [page, setPage] = useState(0);

  const columnWidth =
    area.width > 0 ? (area.width - COLUMN_GAP * (columns - 1)) / columns : 0;

  const pages = useMemo(() => {
    if (columnWidth <= 0 || area.height <= 0) {
      return null;
    }
    const blocks: ListBlock[] = [];
    for (const list of lists) {
      const header = heights[`list:${list.id}`];
      if (header === undefined) {
        return null;
      }
      const cards: {id: string; height: number}[] = [];
      for (const card of cardsByList.get(list.id) ?? []) {
        const height = heights[`card:${card.id}`];
        if (height === undefined) {
          return null;
        }
        cards.push({id: card.id, height});
      }
      blocks.push({listId: list.id, header, cards});
    }
    const stacked = stackLists(blocks, area.height, CARD_GAP, LIST_GAP);
    const result: ColumnSegment[][][] = [];
    for (let i = 0; i < stacked.length; i += columns) {
      result.push(stacked.slice(i, i + columns));
    }
    return result;
  }, [area.height, cardsByList, columnWidth, columns, heights, lists]);

  const totalPages = Math.max(1, pages?.length ?? 1);
  const pageIndex = Math.min(page, totalPages - 1);
  const turnPage = useCallback(
    (delta: number) =>
      setPage(Math.min(Math.max(0, pageIndex + delta), totalPages - 1)),
    [pageIndex, totalPages],
  );
  // Like turning pages in a document: swipe left or up for the next page.
  const swipeHandlers = useTwoFingerSwipe((direction: SwipeDirection) =>
    turnPage(direction === 'left' || direction === 'up' ? 1 : -1),
  );

  if (lists.length === 0) {
    return <Text style={styles.message}>{emptyMessage}</Text>;
  }

  const listsById = new Map(lists.map(list => [list.id, list]));
  const cardsById = new Map(
    Array.from(cardsByList.values())
      .flat()
      .map(card => [card.id, card]),
  );
  const pageColumns = pages?.[pageIndex] ?? [];

  return (
    <View style={styles.focusBoard} {...swipeHandlers}>
      <View
        style={styles.focusArea}
        onLayout={event => {
          const {width, height} = event.nativeEvent.layout;
          setArea(current =>
            current.width === width && current.height === height
              ? current
              : {width, height},
          );
        }}>
        {columnWidth > 0 && (
          <StackMeasureLayer
            lists={lists}
            cardsByList={cardsByList}
            members={members}
            locale={locale}
            width={columnWidth}
            onMeasure={measure}
          />
        )}
        <View style={styles.columns}>
          {Array.from({length: columns}, (_, i) => (
            <View key={i} style={styles.column}>
              {(pageColumns[i] ?? []).map((segment, s) => (
                <View
                  key={`${segment.listId}-${s}`}
                  style={[styles.segment, s > 0 && styles.segmentSpaced]}>
                  <ListHeader
                    name={listsById.get(segment.listId)?.name ?? ''}
                    count={cardsByList.get(segment.listId)?.length ?? 0}
                    continued={segment.continued}
                  />
                  {segment.cardIds.map(id => {
                    const card = cardsById.get(id);
                    return card ? (
                      <CardTile
                        key={id}
                        card={card}
                        members={members}
                        locale={locale}
                        onPress={onOpenCard}
                        onLongPress={onLongPressCard}
                      />
                    ) : null;
                  })}
                </View>
              ))}
            </View>
          ))}
        </View>
      </View>

      {/* Always present, so that the stacking area keeps the same height. */}
      <View style={styles.focusFooter}>
        {totalPages > 1 && (
          <>
            <SmallButton
              label="◀"
              accessibilityLabel={t('board.previousPage')}
              disabled={pageIndex === 0}
              onPress={() => turnPage(-1)}
            />
            <Text style={styles.footerText}>
              {t('board.focusPages', {page: pageIndex + 1, total: totalPages})}
            </Text>
            <SmallButton
              label="▶"
              accessibilityLabel={t('board.nextPage')}
              disabled={pageIndex >= totalPages - 1}
              onPress={() => turnPage(1)}
            />
          </>
        )}
      </View>
    </View>
  );
}

/**
 * The invisible copies of a list's cards, measured by `onMeasure` under
 * their card ids. Memoized, so that turning pages does not draw them again.
 */
const CardsMeasureLayer = React.memo(function CardsMeasureLayer({
  cards,
  members,
  locale,
  onMeasure,
}: {
  cards: readonly TrelloBoardCard[];
  members: MembersById;
  locale: Locale;
  onMeasure: MeasureView;
}): React.JSX.Element {
  return (
    <View style={styles.measureLayer} pointerEvents="none">
      {cards.map(card => (
        <View key={card.id} onLayout={event => onMeasure(card.id, event)}>
          <CardTile card={card} members={members} locale={locale} />
        </View>
      ))}
    </View>
  );
});

/**
 * The invisible copies of the stacked lists, one column wide: each header
 * is measured as `list:<id>`, each card as `card:<id>`. Memoized, so that
 * turning pages does not draw them again.
 */
const StackMeasureLayer = React.memo(function StackMeasureLayer({
  lists,
  cardsByList,
  members,
  locale,
  width,
  onMeasure,
}: {
  lists: readonly TrelloList[];
  cardsByList: ReadonlyMap<string, TrelloBoardCard[]>;
  members: MembersById;
  locale: Locale;
  width: number;
  onMeasure: MeasureView;
}): React.JSX.Element {
  return (
    <View style={[styles.measureLayer, {width}]} pointerEvents="none">
      {lists.map(list => {
        const cards = cardsByList.get(list.id) ?? [];
        return (
          <React.Fragment key={list.id}>
            <View onLayout={event => onMeasure(`list:${list.id}`, event)}>
              <ListHeader name={list.name} count={cards.length} />
            </View>
            {cards.map(card => (
              <View
                key={card.id}
                onLayout={event => onMeasure(`card:${card.id}`, event)}>
                <CardTile card={card} members={members} locale={locale} />
              </View>
            ))}
          </React.Fragment>
        );
      })}
    </View>
  );
});

/**
 * A card of the board. With `onPress`, tapping it opens its detail and a
 * long press opens its menu; the copies laid out only to be measured have
 * neither, and their avatars are empty circles of the same size, so that
 * the pictures are not downloaded twice.
 */
function CardTile({
  card,
  members,
  locale,
  onPress,
  onLongPress,
}: {
  card: TrelloBoardCard;
  members: MembersById;
  locale: Locale;
  onPress?: OpenCard;
  onLongPress?: PressCardLong;
}): React.JSX.Element {
  const {t} = useTranslation();
  const tileRef = useRef<View>(null);
  // A lasso selection waits to be linked: each card shows a "Link" tab.
  const linking = usePendingBinding() !== null;
  const {checkItems, checkItemsChecked, description} = card.badges ?? {};
  const badges: string[] = [];
  if (card.due) {
    const date = formatCardDate(card.due, locale);
    badges.push(card.dueComplete ? `✓ ${date}` : t('board.due', {date}));
  }
  if (checkItems) {
    badges.push(`☐ ${checkItemsChecked ?? 0}/${checkItems}`);
  }
  if (description) {
    badges.push('≡');
  }
  const cardMembers = (card.idMembers ?? [])
    .map(id => members.get(id))
    .filter((member): member is TrelloBoardMember => member !== undefined);
  const labels = card.labels ?? [];

  const content = (
    <>
      {linking && (
        <View style={styles.cardAction}>
          <BindSelectionButton
            target={{kind: 'card', shortLink: card.shortLink || card.id}}
          />
        </View>
      )}
      {labels.length > 0 && (
        <View style={[styles.labels, linking && styles.besideTab]}>
          {labels.map(label => (
            <LabelChip key={label.id} label={label} />
          ))}
        </View>
      )}
      <View
        style={[
          styles.cardTitle,
          // Without labels, the title line runs beside the tab.
          linking && labels.length === 0 && styles.besideTab,
        ]}>
        {card.dueComplete && (
          <View
            style={styles.completeMark}
            accessible
            accessibilityLabel={t('board.complete')}>
            <CompleteMark size={COMPLETE_MARK_SIZE} complete />
          </View>
        )}
        <Text style={styles.cardName} numberOfLines={3}>
          {card.name}
        </Text>
      </View>
      {(badges.length > 0 || cardMembers.length > 0) && (
        <View style={styles.cardFooter}>
          <Text style={styles.cardBadges} numberOfLines={1}>
            {badges.join('   ')}
          </Text>
          <View style={styles.avatars}>
            {cardMembers.slice(0, MAX_AVATARS).map(member =>
              onPress ? (
                <View
                  key={member.id}
                  accessible
                  accessibilityLabel={member.fullName}>
                  <MemberAvatar
                    initials={member.initials}
                    avatarUrl={member.avatarUrl}
                    size={AVATAR_SIZE}
                  />
                </View>
              ) : (
                <View key={member.id} style={styles.avatarSpace} />
              ),
            )}
            {cardMembers.length > MAX_AVATARS && (
              <Text style={styles.cardBadges}>
                +{cardMembers.length - MAX_AVATARS}
              </Text>
            )}
          </View>
        </View>
      )}
    </>
  );

  if (!onPress) {
    return <View style={styles.card}>{content}</View>;
  }
  return (
    <Pressable
      ref={tileRef}
      accessibilityRole="button"
      accessibilityHint={t('board.openCardHint')}
      onPress={() => onPress(card)}
      onLongPress={
        onLongPress &&
        (() => tileRef.current && onLongPress(card, tileRef.current))
      }
      // No inverted look: the whole card would flash on E Ink.
      style={({pressed}) => [styles.card, pressed && styles.cardPressed]}>
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  message: {
    color: colors.foreground,
    fontSize: typography.body,
  },
  failure: {
    gap: spacing.md,
    alignItems: 'flex-start',
  },
  columns: {
    flex: 1,
    flexDirection: 'row',
    gap: COLUMN_GAP,
  },
  emptyColumn: {
    flex: 1,
  },
  column: {
    flex: 1,
    minWidth: 0,
  },
  columnHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borders.radius,
    backgroundColor: colors.listHeader,
  },
  columnTitle: {
    flex: 1,
    color: colors.listHeaderText,
    fontSize: typography.label,
    fontWeight: '700',
  },
  columnCount: {
    color: colors.listHeaderText,
    fontSize: typography.body,
    fontWeight: '600',
  },
  columnBody: {
    flex: 1,
    marginTop: CARD_GAP,
    gap: CARD_GAP,
    overflow: 'hidden',
  },
  measureLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    opacity: 0,
  },
  /** Stands for an avatar in the measured copies of the cards. */
  avatarSpace: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
  },
  // Right under the list's last card, as on Trello, in the dashed frame of
  // the main page's "+" tile; inverted while pressed. The column body's gap
  // spaces it from the card.
  addCard: {
    alignSelf: 'stretch',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    borderColor: colors.foreground,
    borderRadius: borders.radius + 2,
    borderStyle: 'dashed',
    borderWidth: borders.width,
    backgroundColor: colors.background,
  },
  addCardPressed: {
    backgroundColor: colors.foreground,
  },
  addCardText: {
    color: colors.foreground,
    fontSize: typography.body,
    fontWeight: '600',
  },
  addCardTextPressed: {
    color: colors.background,
  },
  columnFooter: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  card: {
    gap: spacing.xs,
    borderColor: colors.foreground,
    borderWidth: borders.width,
    borderRadius: borders.radius,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    backgroundColor: colors.background,
  },
  cardAction: {
    position: 'absolute',
    top: 0,
    right: spacing.sm,
    zIndex: 1,
  },
  besideTab: {
    paddingRight: BIND_TAB_ROOM,
    minHeight: BIND_TAB_HEIGHT - spacing.sm,
  },
  cardPressed: {
    borderWidth: borders.width * 2,
    paddingHorizontal: spacing.sm - borders.width,
    paddingVertical: spacing.sm - borders.width,
  },
  labels: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  cardTitle: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs,
  },
  // Centred on the name's first line.
  completeMark: {
    marginTop: 2,
  },
  cardName: {
    flex: 1,
    color: colors.foreground,
    fontSize: typography.body,
    lineHeight: 28,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  cardBadges: {
    flex: 1,
    color: colors.foreground,
    fontSize: 18,
  },
  avatars: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  focusBoard: {
    flex: 1,
  },
  focusArea: {
    flex: 1,
    overflow: 'hidden',
  },
  focusFooter: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
  },
  segment: {
    gap: CARD_GAP,
  },
  segmentSpaced: {
    marginTop: LIST_GAP,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
    paddingTop: spacing.sm,
  },
  footerText: {
    color: colors.foreground,
    fontSize: typography.body,
  },
  iconButton: {
    padding: spacing.sm,
  },
  screen: {
    flex: 1,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.background,
  },
});
