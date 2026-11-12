import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {
  Image,
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
  toggleMode,
} from '../board/focus';
import {labelShade} from '../board/labels';
import {
  clampPage,
  DEFAULT_COLUMNS,
  groupCardsByList,
  nextColumnCount,
  orientationOf,
  pageCount,
  paginate,
  SwipeDirection,
} from '../board/layout';
import {
  BoardPreferences,
  loadBoardPreferences,
  saveBoardPreferences,
} from '../board/preferences';
import {useTwoFingerSwipe} from '../board/useTwoFingerSwipe';
import {Checkbox} from '../components/Checkbox';
import {ScreenFrame} from '../components/ScreenFrame';
import {Locale, useTranslation} from '../i18n';
import {toSessionError} from '../session/trelloSession';
import {KeyValueStore} from '../storage/keyValueStore';
import {
  TrelloBoard,
  TrelloBoardCard,
  TrelloBoardMember,
  TrelloClient,
  TrelloLabel,
  TrelloList,
} from '../trello';
import {borders, colors, spacing, typography} from '../theme';

const CARD_GAP = spacing.sm;
const COLUMN_GAP = spacing.lg;
/** Space between two lists stacked in the same column (Focus, Review). */
const LIST_GAP = spacing.lg;
const AVATAR_SIZE = 36;
const MAX_AVATARS = 3;

type MembersById = ReadonlyMap<string, TrelloBoardMember>;

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
  onBack: () => void;
  /** Called when Trello rejects the token while loading. */
  onTokenRejected: () => void;
}

/**
 * Shows the lists of a board side by side (1 to 3 columns, chosen per
 * orientation). Lists and cards are browsed page by page, with buttons or a
 * two-finger swipe, rather than by scrolling, which is slow on E Ink.
 */
export function BoardScreen({
  board,
  client,
  store,
  memberId,
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
          console.warn('[SuperTrello] Failed to load board members', error);
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
      console.warn('[SuperTrello] Failed to load board', error);
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

  const columns = preferences[orientation];
  const cycleColumns = useCallback(() => {
    const next = {...preferences, [orientation]: nextColumnCount(columns)};
    setPreferences(next);
    saveBoardPreferences(store, next);
  }, [columns, orientation, preferences, store]);

  const updateFocus = useCallback(
    (next: FocusSettings) => {
      setFocus(next);
      saveFocusSettings(store, next);
    },
    [store],
  );
  const toggleFocus = useCallback(() => {
    updateFocus(toggleMode(focus, 'focus'));
    setTagsOpen(false);
  }, [focus, updateFocus]);
  const toggleReview = useCallback(() => {
    updateFocus(toggleMode(focus, 'review'));
    setTagsOpen(false);
  }, [focus, updateFocus]);
  const focusOn = focus.mode === 'focus';
  const reviewOn = focus.mode === 'review';

  // Focus and Review modes both show a filtered board, stacked.
  const focused = useMemo(() => {
    if (state.status !== 'loaded') {
      return null;
    }
    switch (focus.mode) {
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
  }, [focus.labels, focus.mode, memberId, state]);
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

  return (
    <ScreenFrame
      title={board.starred ? `★ ${board.name}` : board.name}
      onBack={onBack}
      actions={
        <>
          <SmallButton
            label={t('board.columns', {count: columns})}
            accessibilityLabel={t('board.columnsHint', {count: columns})}
            onPress={cycleColumns}
          />
          <SmallButton
            label={t('board.focus')}
            accessibilityLabel={t(
              focusOn ? 'board.focusOnHint' : 'board.focusOffHint',
            )}
            active={focusOn}
            onPress={toggleFocus}
          />
          {focusOn && (
            <SmallButton
              label={t('board.focusTags')}
              accessibilityLabel={t('board.focusTagsHint')}
              active={tagsOpen}
              onPress={() => setTagsOpen(open => !open)}
            />
          )}
          <SmallButton
            label={t('board.review')}
            accessibilityLabel={t(
              reviewOn ? 'board.reviewOnHint' : 'board.reviewOffHint',
            )}
            active={reviewOn}
            onPress={toggleReview}
          />
          <SmallButton
            label={t('board.refresh')}
            accessibilityLabel={t('board.refresh')}
            onPress={load}
          />
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
          key={`${focus.mode}-${columns}-${width}`}
          lists={focused.lists}
          cardsByList={focused.cardsByList}
          members={state.members}
          columns={columns}
          emptyMessage={t(reviewOn ? 'board.reviewEmpty' : 'board.focusEmpty')}
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
                onTurnLists={turnListPage}
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
  );
}

interface BoardColumnProps {
  list: TrelloList;
  cards: readonly TrelloBoardCard[];
  members: MembersById;
  onTurnLists: (delta: number) => void;
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
  onTurnLists,
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

function CardTile({
  card,
  members,
  locale,
}: {
  card: TrelloBoardCard;
  members: MembersById;
  locale: Locale;
}): React.JSX.Element {
  const {t} = useTranslation();
  const {checkItems, checkItemsChecked, description} = card.badges ?? {};
  const badges: string[] = [];
  if (card.due) {
    const date = formatDueDate(card.due, locale);
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

  return (
    <View style={styles.card}>
      {labels.length > 0 && (
        <View style={styles.labels}>
          {labels.map(label => (
            <LabelChip key={label.id} label={label} />
          ))}
        </View>
      )}
      <View style={styles.cardTitle}>
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
              <Avatar key={member.id} member={member} />
            ))}
            {cardMembers.length > MAX_AVATARS && (
              <Text style={styles.cardBadges}>
                +{cardMembers.length - MAX_AVATARS}
              </Text>
            )}
          </View>
        </View>
      )}
    </View>
  );
}

function LabelChip({label}: {label: TrelloLabel}): React.JSX.Element {
  const shade = labelShade(label.color);
  return (
    <View
      style={[
        styles.label,
        !label.name && styles.labelUnnamed,
        {backgroundColor: shade.background},
      ]}>
      {!!label.name && (
        <Text style={[styles.labelText, {color: shade.text}]} numberOfLines={1}>
          {label.name}
        </Text>
      )}
    </View>
  );
}

function Avatar({member}: {member: TrelloBoardMember}): React.JSX.Element {
  const [imageFailed, setImageFailed] = useState(false);
  return (
    <View style={styles.avatar} accessible accessibilityLabel={member.fullName}>
      <Text style={styles.avatarInitials}>{member.initials}</Text>
      {member.avatarUrl && !imageFailed && (
        <Image
          source={{uri: `${member.avatarUrl}/50.png`}}
          style={styles.avatarImage}
          onError={() => setImageFailed(true)}
        />
      )}
    </View>
  );
}

function formatDueDate(iso: string, locale: Locale): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  try {
    return date.toLocaleDateString(locale.replace('_', '-'), {
      day: 'numeric',
      month: 'short',
    });
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

interface SmallButtonProps {
  label: string;
  accessibilityLabel: string;
  onPress: () => void;
  disabled?: boolean;
  /** Shown inverted, for a switch that is on. */
  active?: boolean;
}

function SmallButton({
  label,
  accessibilityLabel,
  onPress,
  disabled = false,
  active = false,
}: SmallButtonProps): React.JSX.Element {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{disabled, selected: active}}
      disabled={disabled}
      hitSlop={spacing.sm}
      onPress={onPress}
      style={({pressed}) => [
        styles.smallButton,
        disabled && styles.disabled,
        (pressed || active) && styles.pressed,
      ]}>
      {({pressed}) => (
        <Text
          style={[
            styles.smallButtonLabel,
            (pressed || active) && styles.pressedLabel,
          ]}>
          {label}
        </Text>
      )}
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
  labels: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  label: {
    minHeight: 26,
    maxWidth: '100%',
    justifyContent: 'center',
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: colors.labelBorder,
    paddingHorizontal: spacing.sm,
  },
  labelUnnamed: {
    minHeight: 12,
    width: 48,
  },
  labelText: {
    fontSize: 16,
    fontWeight: '700',
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
  avatar: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.avatar,
  },
  avatarInitials: {
    color: colors.foreground,
    fontSize: 15,
    fontWeight: '700',
  },
  avatarImage: {
    ...StyleSheet.absoluteFillObject,
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
  smallButton: {
    borderColor: colors.foreground,
    borderWidth: borders.width,
    borderRadius: borders.radius,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    backgroundColor: colors.background,
  },
  disabled: {
    borderStyle: 'dashed',
  },
  pressed: {
    backgroundColor: colors.foreground,
  },
  smallButtonLabel: {
    color: colors.foreground,
    fontSize: typography.label,
    fontWeight: '600',
  },
  pressedLabel: {
    color: colors.background,
  },
});
