import React, {useCallback, useEffect, useMemo, useState} from 'react';
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
  focusLabelChoices,
  labelKey,
  ListBlock,
  loadFocusSettings,
  reviewBoard,
  saveFocusSettings,
  stackLists,
  toggleFocusLabel,
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
import {formatCardDate} from '../cards/detail';
import {canAddCards} from '../cards/ordering';
import {
  BIND_TAB_HEIGHT,
  BIND_TAB_ROOM,
  BindSelectionButton,
} from '../components/BindSelectionButton';
import {usePendingBinding} from '../inkLink/lassoBinding';
import {useConnectivity} from '../network/connectivity';
import {Checkbox} from '../components/Checkbox';
import {InsertInkLinkButton} from '../components/InsertInkLinkButton';
import {LabelChip} from '../components/LabelChip';
import {MemberAvatar} from '../components/MemberAvatar';
import {RefreshIcon} from '../components/RefreshIcon';
import {Segment, SegmentGroup} from '../components/SegmentedControl';
import {HEADER_ICON_SIZE, ScreenFrame} from '../components/ScreenFrame';
import {SmallButton} from '../components/SmallButton';
import {Locale, useTranslation} from '../i18n';
import {toSessionError} from '../session/trelloSession';
import {KeyValueStore} from '../storage/keyValueStore';
import {
  isSupernoteRoadmap,
  TrelloBoard,
  TrelloBoardCard,
  TrelloBoardMember,
  TrelloClient,
  TrelloList,
} from '../trello';
import {borders, colors, spacing, typography} from '../theme';
import {CardDetailScreen} from './CardDetailScreen';

const CARD_GAP = spacing.sm;
const COLUMN_GAP = spacing.lg;
/** Space between two lists stacked in the same column (Focus, Review). */
const LIST_GAP = spacing.lg;
const AVATAR_SIZE = 36;
const MAX_AVATARS = 3;

type MembersById = ReadonlyMap<string, TrelloBoardMember>;
type OpenCard = (card: TrelloBoardCard) => void;

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
}: BoardScreenProps): React.JSX.Element {
  const {t} = useTranslation();
  const {width, height} = useWindowDimensions();
  const orientation = orientationOf(width, height);

  const [state, setState] = useState<BoardState>({status: 'loading'});
  const [preferences, setPreferences] =
    useState<BoardPreferences>(DEFAULT_COLUMNS);
  const [firstList, setFirstList] = useState(0);
  const [focus, setFocus] = useState<FocusSettings>(DEFAULT_FOCUS_SETTINGS);
  const [tagsOpen, setTagsOpen] = useState(false);
  const [openCard, setOpenCard] = useState<TrelloBoardCard | null>(null);
  // Opened at a card, the whole board shows whatever the saved mode, so
  // that the card is there; choosing a mode goes back to it.
  const [wholeBoard, setWholeBoard] = useState(!!initialCardId);

  useEffect(() => {
    let active = true;
    loadBoardPreferences(store).then(
      loaded => active && setPreferences(loaded),
    );
    loadFocusSettings(store).then(loaded => active && setFocus(loaded));
    return () => {
      active = false;
    };
  }, [store]);

  const load = useCallback(async () => {
    setState({status: 'loading'});
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
      setState({status: 'failed'});
    }
  }, [board.id, client, onTokenRejected]);

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
      setTagsOpen(false);
    },
    [focus, updateFocus],
  );
  // Focus and Review are about the user's own cards: they make no sense on
  // Supernote's roadmap, where the board is always shown in full.
  const modesAvailable = !isSupernoteRoadmap(board);
  const mode = modesAvailable && !wholeBoard ? focus.mode : null;
  const focusOn = mode === 'focus';
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
          focus.labels,
        );
      case 'review':
        return reviewBoard(state.lists, state.cardsByList);
      default:
        return null;
    }
  }, [focus.labels, mode, memberId, state]);
  const tagChoices = useMemo(
    () =>
      state.status === 'loaded'
        ? focusLabelChoices(
            Array.from(state.cardsByList.values()).flat(),
            focus.labels,
          )
        : [],
    [focus.labels, state],
  );

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

  const closeCard = useCallback(() => setOpenCard(null), []);

  // The card detail is drawn over the board, which stays mounted: going
  // back finds the same lists and card pages, without reloading them.
  const detail = openCard && state.status === 'loaded' && (
    <View style={styles.overlay}>
      <CardDetailScreen
        card={openCard}
        boardName={board.name}
        listName={lists.find(list => list.id === openCard.idList)?.name ?? ''}
        members={state.members}
        client={client}
        store={store}
        memberId={memberId}
        // Start changes the card: only for members who may edit the board.
        canEdit={!!memberId && canAddCards(board, memberId, false)}
        onBack={closeCard}
        onTokenRejected={onTokenRejected}
      />
    </View>
  );

  return (
    <View style={styles.screen}>
      <ScreenFrame
        title={board.starred ? `★ ${board.name}` : board.name}
        onBack={onBack}
        actions={
          <>
            {focusOn && (
              <SmallButton
                label={t('board.focusTags')}
                accessibilityLabel={t('board.focusTagsHint')}
                active={tagsOpen}
                onPress={() => setTagsOpen(open => !open)}
              />
            )}
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
          <Text style={styles.message}>{t('board.loading')}</Text>
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

        {state.status === 'loaded' && tagsOpen && focusOn && (
          <FocusTagsPanel
            choices={tagChoices}
            selected={focus.labels}
            onToggle={name =>
              updateFocus({
                ...focus,
                labels: toggleFocusLabel(focus.labels, name),
              })
            }
            onClose={() => setTagsOpen(false)}
          />
        )}

        {state.status === 'loaded' && !tagsOpen && focused && (
          <StackedBoard
            // Measured heights depend on the column width and on the mode.
            key={`${mode}-${columns}-${width}`}
            lists={focused.lists}
            cardsByList={focused.cardsByList}
            members={state.members}
            columns={columns}
            onOpenCard={setOpenCard}
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
                  revealCardId={initialCardId}
                  onTurnLists={turnListPage}
                  onOpenCard={setOpenCard}
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
    </View>
  );
}

interface BoardColumnProps {
  list: TrelloList;
  cards: readonly TrelloBoardCard[];
  members: MembersById;
  /** Card to show the page of, once, when the list holds it. */
  revealCardId?: string;
  onTurnLists: (delta: number) => void;
  onOpenCard: OpenCard;
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
}: BoardColumnProps): React.JSX.Element {
  const {t, locale} = useTranslation();
  const [bodyHeight, setBodyHeight] = useState(0);
  const [heights, setHeights] = useState<Readonly<Record<string, number>>>({});
  const [page, setPage] = useState(0);

  const pages = useMemo(() => {
    const measured = cards.map(card => heights[card.id]);
    if (bodyHeight <= 0 || measured.some(h => h === undefined)) {
      return null;
    }
    return paginate(measured as number[], bodyHeight, CARD_GAP);
  }, [bodyHeight, cards, heights]);

  // Once its cards are measured, the list opens at the page of the card
  // the board was opened at, if it holds it.
  const [revealed, setRevealed] = useState(false);
  useEffect(() => {
    if (!revealCardId || revealed || !pages) {
      return;
    }
    setRevealed(true);
    const at = pageOfItem(
      pages,
      cards.findIndex(card => card.id === revealCardId),
    );
    if (at !== null) {
      setPage(at);
    }
  }, [cards, pages, revealCardId, revealed]);

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

  const measureCard = useCallback((id: string, event: LayoutChangeEvent) => {
    const measured = Math.ceil(event.nativeEvent.layout.height);
    setHeights(current =>
      current[id] === measured ? current : {...current, [id]: measured},
    );
  }, []);

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
        <View style={styles.measureLayer} pointerEvents="none">
          {cards.map(card => (
            <View key={card.id} onLayout={event => measureCard(card.id, event)}>
              <CardTile card={card} members={members} locale={locale} />
            </View>
          ))}
        </View>
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
          />
        ))}
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
}: StackedBoardProps): React.JSX.Element {
  const {t, locale} = useTranslation();
  const [area, setArea] = useState({width: 0, height: 0});
  const [heights, setHeights] = useState<Readonly<Record<string, number>>>({});
  const [page, setPage] = useState(0);

  const columnWidth =
    area.width > 0 ? (area.width - COLUMN_GAP * (columns - 1)) / columns : 0;

  const measure = useCallback((key: string, event: LayoutChangeEvent) => {
    const measured = Math.ceil(event.nativeEvent.layout.height);
    setHeights(current =>
      current[key] === measured ? current : {...current, [key]: measured},
    );
  }, []);

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
          <View
            style={[styles.measureLayer, {width: columnWidth}]}
            pointerEvents="none">
            {lists.map(list => {
              const cards = cardsByList.get(list.id) ?? [];
              return (
                <React.Fragment key={list.id}>
                  <View onLayout={event => measure(`list:${list.id}`, event)}>
                    <ListHeader name={list.name} count={cards.length} />
                  </View>
                  {cards.map(card => (
                    <View
                      key={card.id}
                      onLayout={event => measure(`card:${card.id}`, event)}>
                      <CardTile card={card} members={members} locale={locale} />
                    </View>
                  ))}
                </React.Fragment>
              );
            })}
          </View>
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

/** Picks the label names Focus mode keeps, among those used on the board. */
function FocusTagsPanel({
  choices,
  selected,
  onToggle,
  onClose,
}: {
  choices: readonly string[];
  selected: readonly string[];
  onToggle: (name: string) => void;
  onClose: () => void;
}): React.JSX.Element {
  const {t} = useTranslation();
  const selectedKeys = new Set(selected.map(labelKey));
  return (
    <View style={styles.panel}>
      <Text style={styles.panelTitle}>{t('board.focusTagsTitle')}</Text>
      <Text style={styles.message}>{t('board.focusTagsHelp')}</Text>
      {choices.length === 0 ? (
        <Text style={styles.message}>{t('board.focusTagsNone')}</Text>
      ) : (
        <View style={styles.tagGrid}>
          {choices.map(name => (
            <View key={labelKey(name)} style={styles.tagCell}>
              <Checkbox
                label={name}
                checked={selectedKeys.has(labelKey(name))}
                onChange={() => onToggle(name)}
              />
            </View>
          ))}
        </View>
      )}
      <View style={styles.panelActions}>
        <SmallButton
          label={t('common.close')}
          accessibilityLabel={t('common.close')}
          onPress={onClose}
        />
      </View>
    </View>
  );
}

/**
 * A card of the board. With `onPress`, tapping it opens its detail; the
 * copies laid out only to be measured have none.
 */
function CardTile({
  card,
  members,
  locale,
  onPress,
}: {
  card: TrelloBoardCard;
  members: MembersById;
  locale: Locale;
  onPress?: OpenCard;
}): React.JSX.Element {
  const {t} = useTranslation();
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
            <Text style={styles.completeMarkText}>✓</Text>
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
            {cardMembers.slice(0, MAX_AVATARS).map(member => (
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
            ))}
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
      accessibilityRole="button"
      accessibilityHint={t('board.openCardHint')}
      onPress={() => onPress(card)}
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
  completeMark: {
    width: 24,
    height: 24,
    marginTop: 2,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.foreground,
  },
  completeMarkText: {
    color: colors.background,
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 20,
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
  panel: {
    gap: spacing.md,
  },
  panelTitle: {
    color: colors.foreground,
    fontSize: typography.label,
    fontWeight: '700',
  },
  tagGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  tagCell: {
    width: '50%',
    paddingRight: spacing.md,
  },
  panelActions: {
    alignItems: 'flex-start',
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
