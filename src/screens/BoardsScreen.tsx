import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';

import {SwipeDirection} from '../board/layout';
import {useTwoFingerSwipe} from '../board/useTwoFingerSwipe';
import {
  boardShade,
  buildDirectoryRows,
  DirectoryRow,
  DirectorySection,
  directoryColumns,
  paginateRows,
  RowHeights,
} from '../boards/directory';
import {Button} from '../components/Button';
import {ScreenFrame} from '../components/ScreenFrame';
import {useTranslation} from '../i18n';
import {toSessionError} from '../session/trelloSession';
import {
  SUPERNOTE_ROADMAP_SHORT_LINK,
  TrelloBoard,
  TrelloClient,
} from '../trello';
import {borders, colors, spacing, typography} from '../theme';

const SUPERNOTE_LOGO = require('../../assets/supernote-logo.png');

type BoardsState =
  | {status: 'loading'}
  | {status: 'loaded'; boards: TrelloBoard[]}
  | {status: 'failed'};

/** Fixed row heights: pages are computed from them before rendering. */
const ROW_HEIGHTS: RowHeights = {
  header: 44,
  roadmap: 136,
  tiles: 128,
  message: 120,
  gap: spacing.md,
};

const TILE_BAND_HEIGHT = 44;

export interface BoardsScreenProps {
  client: TrelloClient;
  /** Shows the Supernote section with the roadmap card. */
  showRoadmap: boolean;
  onOpenBoard: (board: TrelloBoard) => void;
  onOpenSettings: () => void;
  /** Called when Trello rejects the token while loading. */
  onTokenRejected: () => void;
}

/**
 * Boards page, laid out like Trello's: a Supernote section with the
 * official roadmap, the starred boards, then all the boards, as tiles in a
 * grid. The page never scrolls: rows are split into pages turned with the
 * buttons at the bottom or a two-finger swipe.
 */
export function BoardsScreen({
  client,
  showRoadmap,
  onOpenBoard,
  onOpenSettings,
  onTokenRejected,
}: BoardsScreenProps): React.JSX.Element {
  const {t} = useTranslation();
  const {width, height} = useWindowDimensions();
  const [state, setState] = useState<BoardsState>({status: 'loading'});
  const [roadmap, setRoadmap] = useState<'idle' | 'opening' | 'failed'>('idle');
  const [bodyHeight, setBodyHeight] = useState<number | null>(null);
  const [page, setPage] = useState(0);

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

  // Supernote's roadmap is a public board: the user usually is not a member
  // of it, so it is fetched by its short link rather than found in the list.
  const openRoadmap = useCallback(async () => {
    setRoadmap('opening');
    try {
      const board = await client.getBoard(SUPERNOTE_ROADMAP_SHORT_LINK);
      setRoadmap('idle');
      onOpenBoard(board);
    } catch (error) {
      console.warn('[sINK] Failed to open the Supernote roadmap', error);
      if (toSessionError(error) === 'invalidToken') {
        onTokenRejected();
        return;
      }
      setRoadmap('failed');
    }
  }, [client, onOpenBoard, onTokenRejected]);

  const columns = directoryColumns(width, height);
  const boards = state.status === 'loaded' ? state.boards : null;
  const pages = useMemo(
    () =>
      bodyHeight === null
        ? null
        : paginateRows(
            buildDirectoryRows(boards, columns, showRoadmap),
            bodyHeight,
            ROW_HEIGHTS,
          ),
    [boards, columns, showRoadmap, bodyHeight],
  );
  const totalPages = pages?.length ?? 1;
  const pageIndex = Math.min(page, totalPages - 1);

  const turn = useCallback(
    (delta: number) =>
      setPage(Math.min(Math.max(0, pageIndex + delta), totalPages - 1)),
    [pageIndex, totalPages],
  );
  // Like turning pages in a document: swipe left or up for the next page.
  const swipeHandlers = useTwoFingerSwipe((direction: SwipeDirection) =>
    turn(direction === 'left' || direction === 'up' ? 1 : -1),
  );

  const renderRow = (row: DirectoryRow) => {
    switch (row.kind) {
      case 'header':
        return <SectionHeader key={row.key} section={row.section} />;
      case 'roadmap':
        return (
          <RoadmapCard key={row.key} status={roadmap} onPress={openRoadmap} />
        );
      case 'tiles':
        return (
          <View key={row.key} style={styles.tileRow}>
            {row.boards.map(board => (
              <BoardTile
                key={board.id}
                board={board}
                onPress={() => onOpenBoard(board)}
              />
            ))}
            {Array.from({length: columns - row.boards.length}, (_, i) => (
              <View key={`spacer:${i}`} style={styles.tileSpacer} />
            ))}
          </View>
        );
      case 'message':
        return (
          <View key={row.key} style={styles.messageRow}>
            <Text style={styles.message}>
              {state.status === 'loading'
                ? t('boards.loading')
                : state.status === 'failed'
                ? t('boards.loadFailed')
                : t('boards.empty')}
            </Text>
            {state.status === 'failed' && (
              <Button label={t('common.retry')} onPress={load} />
            )}
          </View>
        );
    }
  };

  return (
    <ScreenFrame
      title={t('boards.title')}
      actions={
        <Button label={t('settings.open')} onPress={onOpenSettings} />
      }>
      <View
        style={styles.body}
        onLayout={event => setBodyHeight(event.nativeEvent.layout.height)}
        {...swipeHandlers}>
        {(pages?.[pageIndex] ?? []).map(renderRow)}
      </View>

      {totalPages > 1 && (
        <View style={styles.pager}>
          <Button
            label="‹"
            disabled={pageIndex === 0}
            onPress={() => turn(-1)}
          />
          <Text style={styles.pagerText}>
            {t('boards.page', {page: pageIndex + 1, total: totalPages})}
          </Text>
          <Button
            label="›"
            disabled={pageIndex >= totalPages - 1}
            onPress={() => turn(1)}
          />
        </View>
      )}
    </ScreenFrame>
  );
}

function SectionHeader({
  section,
}: {
  section: DirectorySection;
}): React.JSX.Element {
  const {t} = useTranslation();
  const label = {
    supernote: t('boards.sectionSupernote'),
    starred: `★ ${t('boards.sectionStarred')}`,
    all: t('boards.sectionAll'),
  }[section];
  return (
    <View style={styles.header}>
      <Text accessibilityRole="header" style={styles.headerText}>
        {label}
      </Text>
    </View>
  );
}

function RoadmapCard({
  status,
  onPress,
}: {
  status: 'idle' | 'opening' | 'failed';
  onPress: () => void;
}): React.JSX.Element {
  const {t} = useTranslation();
  return (
    <Pressable
      accessibilityRole="button"
      disabled={status === 'opening'}
      onPress={onPress}
      style={({pressed}) => [styles.roadmap, pressed && styles.pressed]}>
      {({pressed}) => (
        <>
          <View style={styles.roadmapLogo}>
            <Image
              source={SUPERNOTE_LOGO}
              style={styles.logoImage}
              resizeMode="contain"
              accessibilityIgnoresInvertColors
            />
          </View>
          <View style={styles.roadmapText}>
            <Text
              style={[styles.roadmapTitle, pressed && styles.pressedText]}
              numberOfLines={1}>
              {t('boards.roadmapTitle')}
            </Text>
            <Text
              style={[styles.roadmapSubtitle, pressed && styles.pressedText]}
              numberOfLines={2}>
              {status === 'opening'
                ? t('boards.roadmapOpening')
                : status === 'failed'
                ? t('boards.roadmapFailed')
                : t('boards.roadmapSubtitle')}
            </Text>
          </View>
        </>
      )}
    </Pressable>
  );
}

function BoardTile({
  board,
  onPress,
}: {
  board: TrelloBoard;
  onPress: () => void;
}): React.JSX.Element {
  const {t} = useTranslation();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        board.starred ? `${board.name}, ${t('boards.starred')}` : board.name
      }
      onPress={onPress}
      style={({pressed}) => [styles.tile, pressed && styles.pressed]}>
      {({pressed}) => (
        <>
          <View style={[styles.band, {backgroundColor: boardShade(board)}]}>
            {board.starred && (
              <View style={styles.star}>
                <Text style={styles.starText}>★</Text>
              </View>
            )}
          </View>
          <Text
            style={[styles.tileName, pressed && styles.pressedText]}
            numberOfLines={2}>
            {board.name}
          </Text>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  body: {
    flex: 1,
    gap: ROW_HEIGHTS.gap,
    overflow: 'hidden',
  },
  header: {
    height: ROW_HEIGHTS.header,
    justifyContent: 'flex-end',
    borderBottomColor: colors.foreground,
    borderBottomWidth: borders.width / 2,
  },
  headerText: {
    color: colors.foreground,
    fontSize: typography.label,
    fontWeight: '700',
  },
  roadmap: {
    height: ROW_HEIGHTS.roadmap,
    flexDirection: 'row',
    borderColor: colors.foreground,
    borderRadius: borders.radius,
    borderWidth: borders.width,
    backgroundColor: colors.background,
    overflow: 'hidden',
  },
  roadmapLogo: {
    width: ROW_HEIGHTS.roadmap,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
    borderRightColor: colors.foreground,
    borderRightWidth: borders.width,
  },
  logoImage: {
    width: ROW_HEIGHTS.roadmap - spacing.md * 2,
    height: ROW_HEIGHTS.roadmap - spacing.md * 2,
  },
  roadmapText: {
    flex: 1,
    justifyContent: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
  },
  roadmapTitle: {
    color: colors.foreground,
    fontSize: typography.label,
    fontWeight: '700',
  },
  roadmapSubtitle: {
    color: colors.foreground,
    fontSize: typography.body,
  },
  tileRow: {
    height: ROW_HEIGHTS.tiles,
    flexDirection: 'row',
    gap: spacing.md,
  },
  tileSpacer: {
    flex: 1,
  },
  tile: {
    flex: 1,
    borderColor: colors.foreground,
    borderRadius: borders.radius,
    borderWidth: borders.width,
    backgroundColor: colors.background,
    overflow: 'hidden',
  },
  band: {
    height: TILE_BAND_HEIGHT,
    borderBottomColor: colors.foreground,
    borderBottomWidth: borders.width / 2,
    alignItems: 'flex-end',
    padding: spacing.xs,
  },
  star: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
    borderColor: colors.foreground,
    borderRadius: borders.radius / 2,
    borderWidth: borders.width / 2,
  },
  starText: {
    color: colors.foreground,
    fontSize: typography.body,
  },
  tileName: {
    color: colors.foreground,
    fontSize: typography.body,
    lineHeight: 28,
    fontWeight: '600',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  pressed: {
    backgroundColor: colors.foreground,
  },
  pressedText: {
    color: colors.background,
  },
  messageRow: {
    height: ROW_HEIGHTS.message,
    gap: spacing.md,
    justifyContent: 'center',
  },
  message: {
    color: colors.foreground,
    fontSize: typography.body,
  },
  pager: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
    borderTopColor: colors.foreground,
    borderTopWidth: borders.width / 2,
    paddingTop: spacing.md,
    marginTop: spacing.md,
  },
  pagerText: {
    color: colors.foreground,
    fontSize: typography.body,
  },
});
