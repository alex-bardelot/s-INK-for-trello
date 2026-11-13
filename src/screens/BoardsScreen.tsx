import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
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
import {PublicBoardRef} from '../boards/preferences';
import {Button} from '../components/Button';
import {GearIcon} from '../components/GearIcon';
import {ScreenFrame} from '../components/ScreenFrame';
import {Locale, useTranslation} from '../i18n';
import {toSessionError} from '../session/trelloSession';
import {
  organizationLogoUrl,
  SUPERNOTE_ROADMAP_SHORT_LINK,
  TrelloBoard,
  TrelloClient,
  TrelloMember,
  TrelloOrganization,
} from '../trello';
import {borders, colors, spacing, typography} from '../theme';

const SUPERNOTE_ROUND_LOGO = require('../../assets/supernote-logo.png');
const SUPERNOTE_WORDMARK = require('../../assets/supernote-wordmark.png');
const TRELLO_ICON = require('../../assets/trello-icon.png');

type BoardsState =
  | {status: 'loading'}
  | {status: 'loaded'; boards: TrelloBoard[]}
  | {status: 'failed'};

/** Fixed row heights: pages are computed from them before rendering. */
const ROW_HEIGHTS: RowHeights = {
  header: 44,
  connect: 340,
  tiles: 148,
  message: 120,
  gap: spacing.md,
};

/** Height of the background part of a board tile, as on Trello's tiles. */
const TILE_BAND_HEIGHT = 88;
/** Workspace logo in the corner of a tile, the size of a card avatar. */
const BADGE_SIZE = 40;
const ROUND_LOGO_WIDTH = 340;

function settingsIcon(color: string, background: string): React.ReactNode {
  return <GearIcon size={24} color={color} holeColor={background} />;
}

export interface BoardsScreenProps {
  /** The connected member, or `null` when no account is connected yet. */
  member: TrelloMember | null;
  /** The member's client, or an anonymous one when signed out. */
  client: TrelloClient;
  /** Shows the roadmap tile in the Public section. */
  showRoadmap: boolean;
  /** Public boards added in Settings, shown after the roadmap. */
  publicBoards: readonly PublicBoardRef[];
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
 * Boards page, laid out like Trello's: the Public section (Supernote's
 * roadmap and the public boards added in Settings), the starred boards,
 * then the other boards, as tiles in a grid. Without a connected account, a
 * large card invites to connect one. The page never scrolls: rows are split
 * into pages turned with the buttons at the bottom or a two-finger swipe.
 */
export function BoardsScreen({
  member,
  client,
  showRoadmap,
  publicBoards,
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

  // Public boards (Supernote's roadmap and the ones added in Settings) are
  // not in the user's list: they are read by their short link. Signed in,
  // they are read upfront to show their background and last change; signed
  // out, network access may not have been granted, so a board is only read
  // when its tile is pressed. Read boards are kept for later openings.
  const [publicDetails, setPublicDetails] = useState<
    ReadonlyMap<string, TrelloBoard>
  >(new Map());
  const [opening, setOpening] = useState<
    ReadonlyMap<string, 'opening' | 'failed'>
  >(new Map());
  const keepPublicBoard = useCallback((shortLink: string, board: TrelloBoard) => {
    setPublicDetails(previous => new Map(previous).set(shortLink, board));
  }, []);

  useEffect(() => {
    if (!signedIn) {
      return;
    }
    let cancelled = false;
    for (const {shortLink} of publicBoards) {
      client
        .getBoard(shortLink)
        .then(board => !cancelled && keepPublicBoard(shortLink, board))
        .catch(error =>
          console.warn(`[sINK] Failed to read public board ${shortLink}`, error),
        );
    }
    return () => {
      cancelled = true;
    };
  }, [client, keepPublicBoard, publicBoards, signedIn]);

  const openPublicBoard = useCallback(
    async (shortLink: string) => {
      const known = publicDetails.get(shortLink);
      if (known) {
        onOpenBoard(known);
        return;
      }
      const setStatus = (status: 'opening' | 'failed' | null) =>
        setOpening(previous => {
          const next = new Map(previous);
          if (status) {
            next.set(shortLink, status);
          } else {
            next.delete(shortLink);
          }
          return next;
        });
      setStatus('opening');
      try {
        if (!(await ensureNetwork())) {
          setStatus('failed');
          return;
        }
        const board = await client.getBoard(shortLink);
        keepPublicBoard(shortLink, board);
        setStatus(null);
        onOpenBoard(board);
      } catch (error) {
        console.warn(`[sINK] Failed to open public board ${shortLink}`, error);
        if (signedIn && toSessionError(error) === 'invalidToken') {
          onTokenRejected();
          return;
        }
        setStatus('failed');
      }
    },
    [
      client,
      ensureNetwork,
      keepPublicBoard,
      onOpenBoard,
      onTokenRejected,
      publicDetails,
      signedIn,
    ],
  );

  const columns = directoryColumns(width, height);
  const boards = state.status === 'loaded' ? state.boards : null;
  const publicTiles = useMemo(
    () =>
      publicBoards.map(
        ref => publicDetails.get(ref.shortLink) ?? placeholderBoard(ref),
      ),
    [publicBoards, publicDetails],
  );
  const organizations = useOrganizations(
    client,
    signedIn,
    useMemo(
      () => [...(boards ?? []), ...publicTiles],
      [boards, publicTiles],
    ),
  );
  const pages = useMemo(
    () =>
      bodyHeight === null
        ? null
        : paginateRows(
            buildDirectoryRows({
              boards,
              publicBoards: publicTiles,
              showRoadmap,
              signedIn,
              columns,
            }),
            bodyHeight,
            ROW_HEIGHTS,
          ),
    [boards, publicTiles, columns, showRoadmap, signedIn, bodyHeight],
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
      case 'connect':
        return <ConnectCard key={row.key} onPress={onConnect} />;
      case 'tiles':
        return (
          <View key={row.key} style={styles.tileRow}>
            {row.tiles.map(tile => {
              if (tile.kind === 'roadmap') {
                return (
                  <RoadmapTile
                    key="roadmap"
                    status={opening.get(SUPERNOTE_ROADMAP_SHORT_LINK)}
                    onPress={() => openPublicBoard(SUPERNOTE_ROADMAP_SHORT_LINK)}
                  />
                );
              }
              const {board} = tile;
              const isPublic = row.key.startsWith('public:');
              return (
                <BoardTile
                  key={board.id}
                  board={board}
                  organization={
                    board.idOrganization
                      ? organizations.get(board.idOrganization)
                      : undefined
                  }
                  status={isPublic ? opening.get(board.shortLink) : undefined}
                  imageWidth={Math.round(width / columns)}
                  onPress={() =>
                    isPublic
                      ? openPublicBoard(board.shortLink)
                      : onOpenBoard(board)
                  }
                />
              );
            })}
            {Array.from({length: columns - row.tiles.length}, (_, i) => (
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
        <Button
          label={t('settings.open')}
          onPress={onOpenSettings}
          icon={settingsIcon}
        />
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
    public: t('boards.sectionPublic'),
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

type OpenStatus = 'opening' | 'failed' | undefined;

/** Status line of a public board tile while it is being opened. */
function openStatusLabel(
  status: OpenStatus,
  t: ReturnType<typeof useTranslation>['t'],
): string | null {
  return status === 'opening'
    ? t('boards.roadmapOpening')
    : status === 'failed'
    ? t('boards.roadmapFailedShort')
    : null;
}

/**
 * Supernote's roadmap tile. Its background is drawn from the Supernote
 * logos: the round logo, much larger than the band and cut by it, on both
 * sides of the SUPERNOTE wordmark.
 */
function RoadmapTile({
  status,
  onPress,
}: {
  status: OpenStatus;
  onPress: () => void;
}): React.JSX.Element {
  const {t} = useTranslation();
  return (
    <Tile
      name={t('boards.roadmapTile')}
      detail={openStatusLabel(status, t)}
      disabled={status === 'opening'}
      onPress={onPress}
      background={
        <View style={[styles.band, styles.logoBand]}>
          <Image
            source={SUPERNOTE_ROUND_LOGO}
            style={[styles.roundLogo, styles.roundLogoLeft]}
            resizeMode="contain"
            accessibilityIgnoresInvertColors
          />
          <Image
            source={SUPERNOTE_ROUND_LOGO}
            style={[styles.roundLogo, styles.roundLogoCorner]}
            resizeMode="contain"
            accessibilityIgnoresInvertColors
          />
          <View style={styles.wordmarkBox}>
            <Image
              source={SUPERNOTE_WORDMARK}
              style={styles.wordmark}
              resizeMode="contain"
              accessibilityIgnoresInvertColors
            />
          </View>
        </View>
      }
    />
  );
}

function BoardTile({
  board,
  organization,
  status,
  imageWidth,
  onPress,
}: {
  board: TrelloBoard;
  /** Workspace owning the board, once read; `null` if it cannot be. */
  organization?: TrelloOrganization | null;
  /** Opening status of a public board. */
  status?: OpenStatus;
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
      detail={
        openStatusLabel(status, t) ??
        lastActivityLabel(board.dateLastActivity, t, locale)
      }
      starred={board.starred}
      disabled={status === 'opening'}
      badge={
        organization ? <WorkspaceBadge organization={organization} /> : null
      }
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
 * Board tile drawn like Trello's: the background on top, and a white footer
 * with the name and a detail line. Starred boards have no mark on the tile
 * (their section says it); `starred` is only read out to screen readers.
 */
function Tile({
  name,
  detail,
  starred = false,
  disabled = false,
  background,
  badge,
  onPress,
}: {
  name: string;
  detail: string | null;
  starred?: boolean;
  disabled?: boolean;
  background: React.ReactNode;
  /** Drawn in the bottom right corner, like the avatars on Trello cards. */
  badge?: React.ReactNode;
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
          <View style={[styles.tileFooter, badge ? styles.withBadge : null]}>
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
          {badge && <View style={styles.badge}>{badge}</View>}
        </>
      )}
    </Pressable>
  );
}

/**
 * Logo of a Trello workspace, a rounded square like on Trello. The initial
 * of its name stays underneath, for workspaces without a logo and while the
 * image loads.
 */
function WorkspaceBadge({
  organization,
}: {
  organization: TrelloOrganization;
}): React.JSX.Element {
  const [imageFailed, setImageFailed] = useState(false);
  const logo = imageFailed ? null : organizationLogoUrl(organization, 50);
  return (
    <View
      style={styles.workspace}
      accessible
      accessibilityLabel={organization.displayName}>
      <Text style={styles.workspaceInitial}>
        {organization.displayName.trim().charAt(0).toUpperCase()}
      </Text>
      {logo && (
        <Image
          source={{uri: logo}}
          style={styles.bandImage}
          onError={() => setImageFailed(true)}
        />
      )}
    </View>
  );
}

/** Stands for a public board until it is read from Trello. */
function placeholderBoard(ref: PublicBoardRef): TrelloBoard {
  return {
    id: `public:${ref.shortLink}`,
    name: ref.name,
    url: `https://trello.com/b/${ref.shortLink}`,
    shortLink: ref.shortLink,
    closed: false,
    starred: false,
    idOrganization: null,
  };
}

/**
 * Reads the workspaces owning the given boards, each once. Signed out, they
 * are not read (network access may not have been granted). A workspace that
 * cannot be read (private to others, network) maps to `null`.
 */
function useOrganizations(
  client: TrelloClient,
  signedIn: boolean,
  boards: readonly TrelloBoard[],
): ReadonlyMap<string, TrelloOrganization | null> {
  const [organizations, setOrganizations] = useState<
    ReadonlyMap<string, TrelloOrganization | null>
  >(new Map());
  const requested = useRef(new Set<string>());

  useEffect(() => {
    if (!signedIn) {
      return;
    }
    const ids = new Set(
      boards
        .map(board => board.idOrganization)
        .filter((id): id is string => !!id && !requested.current.has(id)),
    );
    for (const id of ids) {
      requested.current.add(id);
      client
        .getOrganization(id)
        .catch(error => {
          console.warn(`[sINK] Failed to read workspace ${id}`, error);
          return null;
        })
        .then(organization =>
          setOrganizations(previous =>
            new Map(previous).set(id, organization),
          ),
        );
    }
  }, [boards, client, signedIn]);

  return organizations;
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
    backgroundColor: colors.background,
    borderBottomColor: colors.labelBorder,
    borderBottomWidth: borders.width / 2,
  },
  // The round logo (460 × 447) drawn at 340 px wide. On the left, only its
  // lower right edge and the dot show, its letters stay above the band; in
  // the bottom right corner, a sliver of its left edge. Both stay outside
  // the wordmark's clear space (one "S" wide, about 21 px on a ~440 px
  // tile), as Supernote's logo guideline asks.
  roundLogo: {
    position: 'absolute',
    width: ROUND_LOGO_WIDTH,
    height: (ROUND_LOGO_WIDTH * 447) / 460,
  },
  roundLogoLeft: {
    left: -216,
    top: -250,
  },
  roundLogoCorner: {
    right: -(ROUND_LOGO_WIDTH - 32),
    top: -4,
  },
  wordmarkBox: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingRight: '12%',
  },
  wordmark: {
    width: '56%',
    aspectRatio: 748 / 101,
  },
  withBadge: {
    paddingRight: spacing.md + BADGE_SIZE + spacing.sm,
  },
  badge: {
    position: 'absolute',
    right: spacing.sm,
    bottom: spacing.sm,
  },
  workspace: {
    width: BADGE_SIZE,
    height: BADGE_SIZE,
    borderRadius: borders.radius,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.avatar,
  },
  workspaceInitial: {
    color: colors.foreground,
    fontSize: typography.body,
    fontWeight: '700',
  },
  tileRow: {
    height: ROW_HEIGHTS.tiles,
    flexDirection: 'row',
    gap: spacing.md,
  },
  tileSpacer: {
    flex: 1,
  },
  // Trello's board tile: a colored top and a white footer with the name. A thin grey outline replaces Trello's
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
