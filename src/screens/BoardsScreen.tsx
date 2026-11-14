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
import {BoardsPreferences, PublicBoardRef} from '../boards/preferences';
import {BindSelectionButton} from '../components/BindSelectionButton';
import {Button} from '../components/Button';
import {InkLinkTarget} from '../inkLink/inkLink';
import {usePendingBinding} from '../inkLink/lassoBinding';
import {GearIcon} from '../components/GearIcon';
import {ScreenFrame} from '../components/ScreenFrame';
import {Locale, useTranslation} from '../i18n';
import {toSessionError} from '../session/trelloSession';
import {
  organizationLogoUrl,
  SUPERNOTE_ROADMAP_NAME,
  SUPERNOTE_ROADMAP_SHORT_LINK,
  TrelloBoard,
  TrelloClient,
  TrelloMember,
  TrelloOrganization,
} from '../trello';
import {borders, colors, spacing, typography} from '../theme';
import {AddPublicBoardForm} from './AddPublicBoardForm';

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
  tiles: 148,
  message: 120,
  gap: spacing.md,
};

/** Height of the background part of a board tile, as on Trello's tiles. */
const TILE_BAND_HEIGHT = 88;
/** Workspace logo in the corner of a tile, the size of a card avatar. */
const BADGE_SIZE = 40;
const ROUND_LOGO_WIDTH = 340;
/** Width of the small dashed "+" card adding a public board. */
const ADD_TILE_WIDTH = 64;

function settingsIcon(color: string, background: string): React.ReactNode {
  return <GearIcon size={24} color={color} holeColor={background} />;
}

export interface BoardsScreenProps {
  /** The connected member, or `null` when no account is connected yet. */
  member: TrelloMember | null;
  /** The member's client, or an anonymous one when signed out. */
  client: TrelloClient;
  /** Roadmap visibility and public boards of the Public section. */
  preferences: BoardsPreferences;
  /** Saves the preferences after a public board is added here. */
  onPreferencesChange: (preferences: BoardsPreferences) => void;
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
 * roadmap, the public boards added, and a small "+" card adding one), the
 * starred boards, then the other boards, as tiles in a grid. Without a
 * connected account, a "My boards" section holds a card inviting to connect
 * one. The page never scrolls: rows are split into pages turned with the
 * buttons at the bottom or a two-finger swipe.
 */
export function BoardsScreen({
  member,
  client,
  preferences,
  onPreferencesChange,
  ensureNetwork,
  onOpenBoard,
  onOpenSettings,
  onConnect,
  onTokenRejected,
}: BoardsScreenProps): React.JSX.Element {
  const {t} = useTranslation();
  // A lasso selection waits to be linked: only boards and cards matter.
  const linking = usePendingBinding() !== null;
  const {width, height} = useWindowDimensions();
  const signedIn = member !== null;
  const [state, setState] = useState<BoardsState>({status: 'loading'});
  const [bodyHeight, setBodyHeight] = useState<number | null>(null);
  const [page, setPage] = useState(0);
  const [addingPublic, setAddingPublic] = useState(false);
  const {showSupernoteRoadmap: showRoadmap, publicBoards} = preferences;

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
  const keepPublicBoard = useCallback(
    (shortLink: string, board: TrelloBoard) => {
      setPublicDetails(previous => new Map(previous).set(shortLink, board));
    },
    [],
  );

  useEffect(() => {
    if (!signedIn) {
      return;
    }
    let cancelled = false;
    const shortLinks = publicBoards.map(ref => ref.shortLink);
    if (showRoadmap) {
      shortLinks.push(SUPERNOTE_ROADMAP_SHORT_LINK);
    }
    for (const shortLink of shortLinks) {
      client
        .getBoard(shortLink)
        .then(board => !cancelled && keepPublicBoard(shortLink, board))
        .catch(error =>
          console.warn(
            `[sINK] Failed to read public board ${shortLink}`,
            error,
          ),
        );
    }
    return () => {
      cancelled = true;
    };
  }, [client, keepPublicBoard, publicBoards, showRoadmap, signedIn]);

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
    useMemo(() => [...(boards ?? []), ...publicTiles], [boards, publicTiles]),
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
              // Picking what to link a selection to is no time to connect.
              showConnect: preferences.showConnectCard && !linking,
              showAddPublic: !linking,
              columns,
            }),
            bodyHeight,
            ROW_HEIGHTS,
          ),
    [
      boards,
      publicTiles,
      columns,
      showRoadmap,
      signedIn,
      preferences.showConnectCard,
      linking,
      bodyHeight,
    ],
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
      case 'tiles':
        return (
          <View key={row.key} style={styles.tileRow}>
            {row.tiles.map(tile => {
              if (tile.kind === 'connect') {
                return <ConnectTile key="connect" onPress={onConnect} />;
              }
              if (tile.kind === 'addPublic') {
                return (
                  <AddPublicTile
                    key="addPublic"
                    onPress={() => setAddingPublic(true)}
                  />
                );
              }
              if (tile.kind === 'roadmap') {
                return (
                  <RoadmapTile
                    key="roadmap"
                    board={publicDetails.get(SUPERNOTE_ROADMAP_SHORT_LINK)}
                    status={opening.get(SUPERNOTE_ROADMAP_SHORT_LINK)}
                    onPress={() =>
                      openPublicBoard(SUPERNOTE_ROADMAP_SHORT_LINK)
                    }
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
        linking ? null : (
          <Button
            label={t('settings.open')}
            onPress={onOpenSettings}
            icon={settingsIcon}
          />
        )
      }>
      <View
        style={styles.body}
        onLayout={event => setBodyHeight(event.nativeEvent.layout.height)}
        {...(addingPublic ? {} : swipeHandlers)}>
        {addingPublic ? (
          <>
            <SectionHeader section="public" />
            <Text style={styles.formTitle}>{t('settings.publicBoardNew')}</Text>
            <AddPublicBoardForm
              client={client}
              ensureNetwork={ensureNetwork}
              preferences={preferences}
              onChange={onPreferencesChange}
              onClose={() => setAddingPublic(false)}
            />
          </>
        ) : (
          (pages?.[pageIndex] ?? []).map(renderRow)
        )}
      </View>

      {!addingPublic && totalPages > 1 && (
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
    mine: t('boards.sectionMine'),
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
 * Board-sized card with a dashed outline standing for the boards of an
 * account not connected yet; pressing it opens the connection screen.
 */
function ConnectTile({onPress}: {onPress: () => void}): React.JSX.Element {
  const {t} = useTranslation();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('boards.connectTitle')}
      accessibilityHint={t('boards.connectHint')}
      onPress={onPress}
      style={({pressed}) => [
        styles.tile,
        styles.dashed,
        styles.connect,
        pressed && styles.pressed,
      ]}>
      {({pressed}) => (
        <>
          <Image
            source={TRELLO_ICON}
            style={styles.trelloIcon}
            resizeMode="contain"
            accessibilityIgnoresInvertColors
          />
          <Text
            style={[styles.connectTitle, pressed && styles.pressedText]}
            numberOfLines={3}>
            {t('boards.connectTitle')}
          </Text>
        </>
      )}
    </Pressable>
  );
}

/**
 * Small dashed card with a "+" after the public boards; it opens the form
 * adding a public board from its link or id. It sits at the start of its
 * grid slot so that the tiles of the other rows stay aligned.
 */
function AddPublicTile({onPress}: {onPress: () => void}): React.JSX.Element {
  const {t} = useTranslation();
  return (
    <View style={styles.addSlot}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('settings.publicBoardNew')}
        onPress={onPress}
        style={({pressed}) => [
          styles.dashed,
          styles.addTile,
          pressed && styles.pressed,
        ]}>
        {({pressed}) => (
          <Text style={[styles.addPlus, pressed && styles.pressedText]}>+</Text>
        )}
      </Pressable>
    </View>
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
  board,
  status,
  onPress,
}: {
  /** The roadmap board once read, for its last change. */
  board: TrelloBoard | undefined;
  status: OpenStatus;
  onPress: () => void;
}): React.JSX.Element {
  const {t, locale} = useTranslation();
  const [bandWidth, setBandWidth] = useState(0);
  const wordmark = roadmapWordmarkFrame(bandWidth);
  return (
    <Tile
      name={SUPERNOTE_ROADMAP_NAME}
      detail={
        openStatusLabel(status, t) ??
        lastActivityLabel(board?.dateLastActivity, t, locale)
      }
      disabled={status === 'opening'}
      linkTarget={{kind: 'board', shortLink: SUPERNOTE_ROADMAP_SHORT_LINK}}
      onPress={onPress}
      background={
        <View
          style={[styles.band, styles.logoBand]}
          onLayout={event => setBandWidth(event.nativeEvent.layout.width)}>
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
          {wordmark && (
            <Image
              source={SUPERNOTE_WORDMARK}
              style={[styles.wordmark, wordmark]}
              resizeMode="stretch"
              accessibilityIgnoresInvertColors
            />
          )}
        </View>
      }
    />
  );
}

/** Size of the SUPERNOTE wordmark image (748 × 101). */
const WORDMARK_RATIO = 748 / 101;
/** Width of its "S", the clear space Supernote's guideline asks around it. */
const WORDMARK_CLEAR_SPACE = 57 / 748;
/** Right edge of the left round logo, as drawn in the band. */
const ROADMAP_LEFT_LOGO_EDGE = 122;
/** Width of the round logo sliver in the bottom right corner. */
const ROADMAP_CORNER_SLIVER = 32;
/** The wordmark is never drawn wider than this. */
const WORDMARK_MAX_WIDTH = 260;

/**
 * Position of the wordmark in a roadmap band `bandWidth` wide: as wide as
 * possible between the two round logos, keeping one "S" of clear space on
 * each side and above and below it. Computed in pixels: percentage widths
 * on an image are not honored by the device. `null` before the band is laid
 * out, or when it is too narrow.
 */
function roadmapWordmarkFrame(
  bandWidth: number,
): {left: number; top: number; width: number; height: number} | null {
  const room = bandWidth - ROADMAP_LEFT_LOGO_EDGE - ROADMAP_CORNER_SLIVER;
  const fitWidth = room / (1 + 2 * WORDMARK_CLEAR_SPACE);
  const fitHeight =
    (TILE_BAND_HEIGHT * WORDMARK_RATIO) /
    (1 + 2 * WORDMARK_CLEAR_SPACE * WORDMARK_RATIO);
  const width = Math.floor(Math.min(fitWidth, fitHeight, WORDMARK_MAX_WIDTH));
  if (width < 60) {
    return null;
  }
  const height = Math.round(width / WORDMARK_RATIO);
  const clear = width * WORDMARK_CLEAR_SPACE;
  // Centered in the room left between the logos.
  const spare = (fitWidth - width) * (1 + 2 * WORDMARK_CLEAR_SPACE);
  const left = Math.round(ROADMAP_LEFT_LOGO_EDGE + clear + spare / 2);
  return {
    left,
    top: Math.round((TILE_BAND_HEIGHT - height) / 2),
    width,
    height,
  };
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
      linkTarget={{kind: 'board', shortLink: board.shortLink || board.id}}
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
  linkTarget,
  onPress,
}: {
  name: string;
  detail: string | null;
  starred?: boolean;
  disabled?: boolean;
  background: React.ReactNode;
  /** Drawn in the bottom right corner, like the avatars on Trello cards. */
  badge?: React.ReactNode;
  /** Board a waiting lasso selection can be linked to, from the tile. */
  linkTarget?: InkLinkTarget;
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
          {linkTarget && (
            <View style={styles.tileAction}>
              <BindSelectionButton target={linkTarget} />
            </View>
          )}
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
          setOrganizations(previous => new Map(previous).set(id, organization)),
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
  formTitle: {
    color: colors.foreground,
    fontSize: typography.label,
    fontWeight: '600',
  },
  dashed: {
    borderColor: colors.foreground,
    borderRadius: borders.radius + 2,
    borderStyle: 'dashed',
    borderWidth: borders.width,
    backgroundColor: colors.background,
  },
  connect: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
  },
  trelloIcon: {
    width: 64,
    height: 64,
  },
  connectTitle: {
    flex: 1,
    color: colors.foreground,
    fontSize: typography.body,
    fontWeight: '700',
  },
  addSlot: {
    flex: 1,
    alignItems: 'flex-start',
  },
  addTile: {
    width: ADD_TILE_WIDTH,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addPlus: {
    color: colors.foreground,
    fontSize: 40,
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
  wordmark: {
    position: 'absolute',
  },
  withBadge: {
    paddingRight: spacing.md + BADGE_SIZE + spacing.sm,
  },
  badge: {
    position: 'absolute',
    right: spacing.sm,
    bottom: spacing.sm,
  },
  tileAction: {
    position: 'absolute',
    right: spacing.md,
    top: 0,
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
