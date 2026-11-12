import React, {useCallback, useEffect, useState} from 'react';
import {
  LayoutChangeEvent,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';

import {
  cardsPerPage,
  clampPage,
  DEFAULT_COLUMNS,
  groupCardsByList,
  nextColumnCount,
  orientationOf,
  pageCount,
  SwipeDirection,
} from '../board/layout';
import {
  BoardPreferences,
  loadBoardPreferences,
  saveBoardPreferences,
} from '../board/preferences';
import {useTwoFingerSwipe} from '../board/useTwoFingerSwipe';
import {ScreenFrame} from '../components/ScreenFrame';
import {Locale, useTranslation} from '../i18n';
import {toSessionError} from '../session/trelloSession';
import {KeyValueStore} from '../storage/keyValueStore';
import {TrelloBoard, TrelloBoardCard, TrelloClient, TrelloList} from '../trello';
import {borders, colors, spacing, typography} from '../theme';

/**
 * Cards have a fixed height so that the number of cards per page can be
 * computed from the column height: a card is never drawn partially, nor
 * under the page controls of its column.
 */
const CARD_HEIGHT = 104;
const CARD_GAP = spacing.sm;
const BODY_PADDING = spacing.sm;

type BoardState =
  | {status: 'loading'}
  | {
      status: 'loaded';
      lists: TrelloList[];
      cardsByList: ReadonlyMap<string, TrelloBoardCard[]>;
    }
  | {status: 'failed'};

export interface BoardScreenProps {
  board: TrelloBoard;
  client: TrelloClient;
  store: KeyValueStore;
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
  onBack,
  onTokenRejected,
}: BoardScreenProps): React.JSX.Element {
  const {t, locale} = useTranslation();
  const {width, height} = useWindowDimensions();
  const orientation = orientationOf(width, height);

  const [state, setState] = useState<BoardState>({status: 'loading'});
  const [preferences, setPreferences] =
    useState<BoardPreferences>(DEFAULT_COLUMNS);
  const [firstList, setFirstList] = useState(0);
  const [cardPages, setCardPages] = useState<Readonly<Record<string, number>>>(
    {},
  );
  const [bodyHeight, setBodyHeight] = useState(0);

  useEffect(() => {
    let active = true;
    loadBoardPreferences(store).then(loaded => active && setPreferences(loaded));
    return () => {
      active = false;
    };
  }, [store]);

  const load = useCallback(async () => {
    setState({status: 'loading'});
    try {
      const [lists, cards] = await Promise.all([
        client.getBoardLists(board.id),
        client.getBoardCards(board.id),
      ]);
      setState({status: 'loaded', lists, cardsByList: groupCardsByList(cards)});
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

  const lists = state.status === 'loaded' ? state.lists : [];
  const listPages = pageCount(lists.length, columns);
  const listPage = clampPage(Math.floor(firstList / columns), lists.length, columns);
  const start = listPage * columns;
  const visibleLists = lists.slice(start, start + columns);
  const perPage = cardsPerPage(bodyHeight - 2 * BODY_PADDING, CARD_HEIGHT, CARD_GAP);

  const turnListPage = useCallback(
    (delta: number) => {
      const target = clampPage(listPage + delta, lists.length, columns);
      setFirstList(target * columns);
    },
    [columns, listPage, lists.length],
  );

  const turnCardPage = useCallback(
    (listId: string, cardCount: number, delta: number) => {
      setCardPages(pages => {
        const current = clampPage(pages[listId] ?? 0, cardCount, perPage);
        return {
          ...pages,
          [listId]: clampPage(current + delta, cardCount, perPage),
        };
      });
    },
    [perPage],
  );

  const handleBodyLayout = useCallback((event: LayoutChangeEvent) => {
    setBodyHeight(event.nativeEvent.layout.height);
  }, []);

  return (
    <ScreenFrame
      title={board.starred ? `★ ${board.name}` : board.name}
      onBack={onBack}
      actions={
        <>
          <HeaderButton
            label={t('board.columns', {count: columns})}
            accessibilityLabel={t('board.columnsHint', {count: columns})}
            onPress={cycleColumns}
          />
          <HeaderButton
            label="⟳"
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
          <HeaderButton
            label={t('common.retry')}
            accessibilityLabel={t('common.retry')}
            onPress={load}
          />
        </View>
      )}

      {state.status === 'loaded' && lists.length === 0 && (
        <Text style={styles.message}>{t('board.noLists')}</Text>
      )}

      {state.status === 'loaded' && lists.length > 0 && (
        <>
          <View style={styles.columns}>
            {visibleLists.map(list => {
              const cards = state.cardsByList.get(list.id) ?? [];
              return (
                <BoardColumn
                  key={list.id}
                  list={list}
                  cards={cards}
                  page={clampPage(cardPages[list.id] ?? 0, cards.length, perPage)}
                  perPage={perPage}
                  locale={locale}
                  onBodyLayout={handleBodyLayout}
                  onTurnCards={delta => turnCardPage(list.id, cards.length, delta)}
                  onTurnLists={turnListPage}
                />
              );
            })}
            {Array.from({length: columns - visibleLists.length}, (_, i) => (
              <View key={`empty-${i}`} style={styles.emptyColumn} />
            ))}
          </View>

          {listPages > 1 && (
            <View style={styles.footer}>
              <PageButton
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
              <PageButton
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
  page: number;
  perPage: number;
  locale: Locale;
  onBodyLayout: (event: LayoutChangeEvent) => void;
  onTurnCards: (delta: number) => void;
  onTurnLists: (delta: number) => void;
}

function BoardColumn({
  list,
  cards,
  page,
  perPage,
  locale,
  onBodyLayout,
  onTurnCards,
  onTurnLists,
}: BoardColumnProps): React.JSX.Element {
  const {t} = useTranslation();
  const pages = pageCount(cards.length, perPage);
  const visibleCards = cards.slice(page * perPage, (page + 1) * perPage);

  // Like turning pages in a document: swipe left for the next lists, up for
  // the next cards of this list.
  const swipeHandlers = useTwoFingerSwipe((direction: SwipeDirection) => {
    switch (direction) {
      case 'left':
        return onTurnLists(1);
      case 'right':
        return onTurnLists(-1);
      case 'up':
        return onTurnCards(1);
      case 'down':
        return onTurnCards(-1);
    }
  });

  return (
    <View style={styles.column} {...swipeHandlers}>
      <View style={styles.columnHeader}>
        <Text style={styles.columnTitle} numberOfLines={1}>
          {list.name}
        </Text>
        <Text style={styles.columnCount}>{cards.length}</Text>
      </View>

      <View style={styles.columnBody} onLayout={onBodyLayout}>
        {cards.length === 0 && (
          <Text style={styles.message}>{t('board.noCards')}</Text>
        )}
        {visibleCards.map(card => (
          <CardTile key={card.id} card={card} locale={locale} />
        ))}
      </View>

      {/* Always present, so that every column body has the same height. */}
      <View style={styles.columnFooter}>
        {pages > 1 && (
          <>
            <PageButton
              label="▲"
              accessibilityLabel={t('board.previousCards')}
              disabled={page === 0}
              onPress={() => onTurnCards(-1)}
            />
            <Text style={styles.footerText}>
              {t('board.cardsPage', {page: page + 1, total: pages})}
            </Text>
            <PageButton
              label="▼"
              accessibilityLabel={t('board.nextCards')}
              disabled={page >= pages - 1}
              onPress={() => onTurnCards(1)}
            />
          </>
        )}
      </View>
    </View>
  );
}

function CardTile({
  card,
  locale,
}: {
  card: TrelloBoardCard;
  locale: Locale;
}): React.JSX.Element {
  const {t} = useTranslation();
  const {checkItems, checkItemsChecked, description} = card.badges ?? {};
  const meta: string[] = [];
  if (card.due) {
    const date = formatDueDate(card.due, locale);
    meta.push(
      card.dueComplete ? `✓ ${date}` : t('board.due', {date}),
    );
  }
  if (checkItems) {
    meta.push(`☐ ${checkItemsChecked ?? 0}/${checkItems}`);
  }
  if (description) {
    meta.push('≡');
  }

  return (
    <View style={styles.card}>
      <Text style={styles.cardName} numberOfLines={2}>
        {card.name}
      </Text>
      <Text style={styles.cardMeta} numberOfLines={1}>
        {meta.join('   ')}
      </Text>
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
}

function HeaderButton({
  label,
  accessibilityLabel,
  onPress,
}: SmallButtonProps): React.JSX.Element {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={spacing.sm}
      onPress={onPress}
      style={({pressed}) => [styles.smallButton, pressed && styles.pressed]}>
      {({pressed}) => (
        <Text style={[styles.smallButtonLabel, pressed && styles.pressedLabel]}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

function PageButton({
  label,
  accessibilityLabel,
  onPress,
  disabled = false,
}: SmallButtonProps): React.JSX.Element {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{disabled}}
      disabled={disabled}
      hitSlop={spacing.sm}
      onPress={onPress}
      style={({pressed}) => [
        styles.smallButton,
        disabled && styles.disabled,
        pressed && styles.pressed,
      ]}>
      {({pressed}) => (
        <Text style={[styles.smallButtonLabel, pressed && styles.pressedLabel]}>
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
    gap: spacing.md,
  },
  emptyColumn: {
    flex: 1,
  },
  column: {
    flex: 1,
    minWidth: 0,
    borderColor: colors.foreground,
    borderWidth: borders.width,
    borderRadius: borders.radius,
  },
  columnHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomColor: colors.foreground,
    borderBottomWidth: borders.width,
  },
  columnTitle: {
    flex: 1,
    color: colors.foreground,
    fontSize: typography.label,
    fontWeight: '700',
  },
  columnCount: {
    color: colors.foreground,
    fontSize: typography.body,
  },
  columnBody: {
    flex: 1,
    padding: BODY_PADDING,
    gap: CARD_GAP,
    overflow: 'hidden',
  },
  columnFooter: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.sm,
    borderTopColor: colors.foreground,
    borderTopWidth: borders.width,
  },
  card: {
    height: CARD_HEIGHT,
    overflow: 'hidden',
    justifyContent: 'space-between',
    borderColor: colors.foreground,
    borderWidth: borders.width,
    borderRadius: borders.radius,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm - 2,
  },
  cardName: {
    color: colors.foreground,
    fontSize: typography.body,
    lineHeight: 28,
  },
  cardMeta: {
    color: colors.foreground,
    fontSize: 18,
    lineHeight: 24,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
    paddingTop: spacing.md,
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
