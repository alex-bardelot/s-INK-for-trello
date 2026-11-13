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
  boardImageUrl,
  boardShade,
  buildDirectoryRows,
  DirectoryRow,
  DirectorySection,
  directoryColumns,
  paginateRows,
  RowHeights,
} from '../boards/directory';
import {describeLastActivity} from '../boards/activity';
import {Button} from '../components/Button';
import {GearIcon} from '../components/GearIcon';
import {MemberAvatar} from '../components/MemberAvatar';
import {ScreenFrame} from '../components/ScreenFrame';
import {Locale, useTranslation} from '../i18n';
import {toSessionError} from '../session/trelloSession';
import {
  SUPERNOTE_ROADMAP_SHORT_LINK,
  TrelloBoard,
  TrelloClient,
  TrelloMember,
} from '../trello';
import {borders, colors, spacing, typography} from '../theme';
import {APP_VERSION} from '../version';

const SUPERNOTE_LOGO = require('../../assets/supernote-logo.png');
const TRELLO_ICON = require('../../assets/trello-icon.png');

type BoardsState =
  | {status: 'loading'}
  | {status: 'loaded'; boards: TrelloBoard[]}
  | {status: 'failed'};

/** Fixed row heights: pages are computed from them before rendering. */
const ROW_HEIGHTS: RowHeights = {
  header: 44,
  roadmap: 148,
  connect: 340,
  tiles: 148,
  message: 120,
  gap: spacing.md,
};

/** Height of the background part of a board tile, as on Trello's tiles. */
const TILE_BAND_HEIGHT = 88;
const AVATAR_SIZE = 44;

function settingsIcon(color: string, background: string): React.ReactNode {
  return <GearIcon size={24} color={color} holeColor={background} />;
}

export interface BoardsScreenProps {
  /** The connected member, or `null` when no account is connected yet. */
  member: TrelloMember | null;
  /** The member's client, or an anonymous one when signed out. */
  client: TrelloClient;
  /** Shows the roadmap tile. */
  showRoadmap: boolean;
  /** Asks for network access; resolves `false` if refused. */
  ensureNetwork: () => Promise<boolean>;
  onOpenBoard: (board: TrelloBoard) => void;
  onOpenSettings: () => void;
  /** Opens the connection screen (signed out only). */
  onConnect: () => void;
  /** Called when Trello rejects the token while loading. */
  onTokenRejected: () => void;
}

/**
 * Boards page, laid out like Trello's: Supernote's official roadmap, the
 * starred boards, then the other boards, as tiles in a grid. Without a
 * connected account, a large card invites to connect one. The page never
 * scrolls: rows are split into pages turned with the buttons at the bottom
 * or a two-finger swipe.
 */
export function BoardsScreen({
  member,
  client,
  showRoadmap,
  ensureNetwork,
  onOpenBoard,
  onOpenSettings,
  onConnect,
  onTokenRejected,
}: BoardsScreenProps): React.JSX.Element {
  const {t} = useTranslation();
  const {width, height} = useWindowDimensions();
  const signedIn = member !== null;
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
    if (signedIn) {
      load();
    }
  }, [load, signedIn]);

  // Supernote's roadmap is a public board: the user usually is not a member
  // of it, so it is fetched by its short link rather than found in the list.
  // Signed out, network access may not have been granted yet.
  const openRoadmap = useCallback(async () => {
    setRoadmap('opening');
    try {
      if (!(await ensureNetwork())) {
        setRoadmap('failed');
        return;
      }
      const board = await client.getBoard(SUPERNOTE_ROADMAP_SHORT_LINK);
      setRoadmap('idle');
      onOpenBoard(board);
    } catch (error) {
      console.warn('[sINK] Failed to open the Supernote roadmap', error);
      if (signedIn && toSessionError(error) === 'invalidToken') {
        onTokenRejected();
        return;
      }
      setRoadmap('failed');
    }
  }, [client, ensureNetwork, onOpenBoard, onTokenRejected, signedIn]);

  const columns = directoryColumns(width, height);
  const boards = state.status === 'loaded' ? state.boards : null;
  const pages = useMemo(
    () =>
      bodyHeight === null
        ? null
        : paginateRows(
            buildDirectoryRows(boards, columns, showRoadmap, signedIn),
            bodyHeight,
            ROW_HEIGHTS,
          ),
    [boards, columns, showRoadmap, signedIn, bodyHeight],
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
          <View key={row.key} style={styles.tileRow}>
            <RoadmapTile status={roadmap} onPress={openRoadmap} />
            {Array.from({length: columns - 1}, (_, i) => (
              <View key={`spacer:${i}`} style={styles.tileSpacer} />
            ))}
          </View>
        );
      case 'connect':
        return <ConnectCard key={row.key} onPress={onConnect} />;
      case 'tiles':
        return (
          <View key={row.key} style={styles.tileRow}>
            {row.boards.map(board => (
              <BoardTile
                key={board.id}
                board={board}
                imageWidth={Math.round(width / columns)}
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
      subtitle={t('app.version', {version: APP_VERSION})}
      actions={
        <>
          {member && (
            <View style={styles.account}>
              <MemberAvatar
                initials={member.initials}
                avatarUrl={member.avatarUrl}
                size={AVATAR_SIZE}
              />
              <Text style={styles.accountText} numberOfLines={1}>
                {t('boards.loggedInAs', {name: member.fullName})}
              </Text>
            </View>
          )}
          <Button
            label={t('settings.open')}
            onPress={onOpenSettings}
            icon={settingsIcon}
          />
        </>
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

/**
 * Large card with a dashed outline standing for the boards of an account
 * not connected yet; pressing it opens the connection screen.
 */
function ConnectCard({onPress}: {onPress: () => void}): React.JSX.Element {
  const {t} = useTranslation();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({pressed}) => [styles.connect, pressed && styles.pressed]}>
      {({pressed}) => (
        <>
          <Image
            source={TRELLO_ICON}
            style={styles.trelloIcon}
            resizeMode="contain"
            accessibilityIgnoresInvertColors
          />
          <Text style={[styles.connectTitle, pressed && styles.pressedText]}>
            {t('boards.connectTitle')}
          </Text>
          <Text style={[styles.connectHint, pressed && styles.pressedText]}>
            {t('boards.connectHint')}
          </Text>
        </>
      )}
    </Pressable>
  );
}

/**
 * Supernote's roadmap, shown as a board tile with the Supernote logo as its
 * background image.
 */
function RoadmapTile({
  status,
  onPress,
}: {
  status: 'idle' | 'opening' | 'failed';
  onPress: () => void;
}): React.JSX.Element {
  const {t} = useTranslation();
  return (
    <Tile
      name={t('boards.roadmapTitle')}
      detail={
        status === 'opening'
          ? t('boards.roadmapOpening')
          : status === 'failed'
          ? t('boards.roadmapFailedShort')
          : t('boards.roadmapSubtitle')
      }
      disabled={status === 'opening'}
      onPress={onPress}
      background={
        <View style={[styles.band, styles.logoBand]}>
          <Image
            source={SUPERNOTE_LOGO}
            style={styles.logoImage}
            resizeMode="contain"
            accessibilityIgnoresInvertColors
          />
        </View>
      }
    />
  );
}

function BoardTile({
  board,
  imageWidth,
  onPress,
}: {
  board: TrelloBoard;
  /** Width of the tile, to pick the size of the background photo. */
  imageWidth: number;
  onPress: () => void;
}): React.JSX.Element {
  const {t, locale} = useTranslation();
  const [imageFailed, setImageFailed] = useState(false);
  const imageUrl = imageFailed ? null : boardImageUrl(board, imageWidth);
  return (
    <Tile
      name={board.name}
      detail={lastActivityLabel(board.dateLastActivity, t, locale)}
      starred={board.starred}
      onPress={onPress}
      background={
        <View style={[styles.band, {backgroundColor: boardShade(board)}]}>
          {imageUrl && (
            <Image
              source={{uri: imageUrl}}
              style={styles.bandImage}
              resizeMode="cover"
              onError={() => setImageFailed(true)}
            />
          )}
        </View>
      }
    />
  );
}

/**
 * Board tile drawn like Trello's: the background on top, with the star in
 * its corner, and a white footer with the name and a detail line.
 */
function Tile({
  name,
  detail,
  starred = false,
  disabled = false,
  background,
  onPress,
}: {
  name: string;
  detail: string | null;
  starred?: boolean;
  disabled?: boolean;
  background: React.ReactNode;
  onPress: () => void;
}): React.JSX.Element {
  const {t} = useTranslation();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[name, starred ? t('boards.starred') : null, detail]
        .filter(Boolean)
        .join(', ')}
      disabled={disabled}
      onPress={onPress}
      style={({pressed}) => [styles.tile, pressed && styles.pressed]}>
      {({pressed}) => (
        <>
          {background}
          {starred && (
            <View style={styles.star}>
              <Text style={styles.starText}>★</Text>
            </View>
          )}
          <View style={styles.tileFooter}>
            <Text
              style={[styles.tileName, pressed && styles.pressedText]}
              numberOfLines={1}>
              {name}
            </Text>
            {detail && (
              <Text
                style={[styles.tileActivity, pressed && styles.pressedText]}
                numberOfLines={1}>
                {detail}
              </Text>
            )}
          </View>
        </>
      )}
    </Pressable>
  );
}

/** "Modified today", "Modified 3 days ago", "Modified on 12 Oct"… */
function lastActivityLabel(
  iso: string | null | undefined,
  t: ReturnType<typeof useTranslation>['t'],
  locale: Locale,
): string | null {
  const activity = describeLastActivity(iso);
  switch (activity?.kind) {
    case undefined:
      return null;
    case 'today':
      return t('boards.modifiedToday');
    case 'yesterday':
      return t('boards.modifiedYesterday');
    case 'daysAgo':
      return t('boards.modifiedDaysAgo', {days: activity.days});
    case 'date':
      return t('boards.modifiedOn', {
        date: formatDate(activity.date, locale),
      });
  }
}

function formatDate(date: Date, locale: Locale): string {
  const sameYear = date.getFullYear() === new Date().getFullYear();
  try {
    return date.toLocaleDateString(locale.replace('_', '-'), {
      day: 'numeric',
      month: 'short',
      ...(sameYear ? {} : {year: 'numeric'}),
    });
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

const styles = StyleSheet.create({
  account: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flexShrink: 1,
  },
  accountText: {
    color: colors.foreground,
    fontSize: typography.body,
    flexShrink: 1,
  },
  body: {
    flex: 1,
    gap: ROW_HEIGHTS.gap,
    overflow: 'hidden',
  },
  header: {
    height: ROW_HEIGHTS.header,
    justifyContent: 'flex-end',
  },
  headerText: {
    color: colors.foreground,
    fontSize: typography.label,
    fontWeight: '700',
  },
  connect: {
    height: ROW_HEIGHTS.connect,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    borderColor: colors.foreground,
    borderRadius: borders.radius + 2,
    borderStyle: 'dashed',
    borderWidth: borders.width,
    backgroundColor: colors.background,
  },
  trelloIcon: {
    width: 112,
    height: 112,
  },
  connectTitle: {
    color: colors.foreground,
    fontSize: typography.heading,
    fontWeight: '700',
    textAlign: 'center',
  },
  connectHint: {
    color: colors.foreground,
    fontSize: typography.body,
    textAlign: 'center',
  },
  logoBand: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
    borderBottomColor: colors.labelBorder,
    borderBottomWidth: borders.width / 2,
  },
  logoImage: {
    width: TILE_BAND_HEIGHT - spacing.sm,
    height: TILE_BAND_HEIGHT - spacing.sm,
  },
  tileRow: {
    height: ROW_HEIGHTS.tiles,
    flexDirection: 'row',
    gap: spacing.md,
  },
  tileSpacer: {
    flex: 1,
  },
  // Trello's board tile: a colored top with the star in its corner, and a
  // white footer with the name. A thin grey outline replaces Trello's
  // shadow, which E Ink cannot render.
  tile: {
    flex: 1,
    borderColor: colors.labelBorder,
    borderRadius: borders.radius + 2,
    borderWidth: borders.width / 2,
    backgroundColor: colors.background,
    overflow: 'hidden',
  },
  band: {
    height: TILE_BAND_HEIGHT,
    overflow: 'hidden',
  },
  bandImage: {
    ...StyleSheet.absoluteFillObject,
  },
  tileFooter: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    gap: 2,
  },
  tileActivity: {
    color: colors.foreground,
    fontSize: 18,
  },
  star: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
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
    fontWeight: '600',
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
