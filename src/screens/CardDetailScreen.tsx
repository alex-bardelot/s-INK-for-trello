import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {
  LayoutChangeEvent,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {SwipeDirection} from '../board/layout';
import {useTwoFingerSwipe} from '../board/useTwoFingerSwipe';
import {
  buildDetailBlocks,
  cardMembers,
  DetailBlock,
  DetailSection,
  formatCardDate,
  paginateBlocks,
} from '../cards/detail';
import {InsertInkLinkButton} from '../components/InsertInkLinkButton';
import {LabelChip} from '../components/LabelChip';
import {MemberAvatar} from '../components/MemberAvatar';
import {RefreshIcon} from '../components/RefreshIcon';
import {HEADER_ICON_SIZE, ScreenFrame} from '../components/ScreenFrame';
import {SmallButton} from '../components/SmallButton';
import {TranslationKey, useTranslation} from '../i18n';
import {toSessionError} from '../session/trelloSession';
import {StartWorkStep} from '../startWork/startWork';
import {
  NoteOutcome,
  StartWorkReport,
  useStartWork,
} from '../startWork/useStartWork';
import {KeyValueStore} from '../storage/keyValueStore';
import {TrelloClient} from '../trello/TrelloClient';
import {
  TrelloBoardCard,
  TrelloBoardMember,
  TrelloCardDetail,
} from '../trello/types';
import {borders, colors, spacing, typography} from '../theme';

const BLOCK_GAP = spacing.sm;
const AVATAR_SIZE = 40;

const SECTION_TITLES: Record<DetailSection, TranslationKey> = {
  description: 'cardDetail.description',
  checklists: 'cardDetail.checklists',
  attachments: 'cardDetail.attachments',
  comments: 'cardDetail.comments',
};

type DetailState =
  | {status: 'loading'}
  | {status: 'loaded'; card: TrelloCardDetail}
  | {status: 'failed'};

export interface CardDetailScreenProps {
  /** The card as shown on the board, displayed while its detail loads. */
  card: TrelloBoardCard;
  boardName: string;
  listName: string;
  /** Members of the board, used when the card's own are not returned. */
  members: ReadonlyMap<string, TrelloBoardMember>;
  client: TrelloClient;
  /** Where the Start work settings are kept. */
  store: KeyValueStore;
  /** Id of the signed-in member, assigned by Start. */
  memberId: string;
  /** The member may edit the board's cards: Start is offered. */
  canEdit: boolean;
  onBack: () => void;
  /** Called when Trello rejects the token while loading. */
  onTokenRejected: () => void;
}

/**
 * Detail of a card: labels, members, dates, description, checklists,
 * attachments and latest comments. Like the board, the page is turned with
 * buttons or a two-finger swipe instead of being scrolled.
 */
export function CardDetailScreen({
  card,
  boardName,
  listName,
  members,
  client,
  store,
  memberId,
  canEdit,
  onBack,
  onTokenRejected,
}: CardDetailScreenProps): React.JSX.Element {
  const {t} = useTranslation();
  const [state, setState] = useState<DetailState>({status: 'loading'});

  // Counts the loads, so that the pages are measured again for new content.
  const [version, setVersion] = useState(0);

  const fetchDetail = useCallback(
    async (quiet: boolean) => {
      if (!quiet) {
        setState({status: 'loading'});
      }
      try {
        const loaded = await client.getCardDetail(card.id);
        setVersion(current => current + 1);
        setState({status: 'loaded', card: loaded});
      } catch (error) {
        console.warn('[sINK] Failed to load card', error);
        if (toSessionError(error) === 'invalidToken') {
          onTokenRejected();
          return;
        }
        // A failed quiet reload keeps the card shown.
        if (!quiet) {
          setState({status: 'failed'});
        }
      }
    },
    [card.id, client, onTokenRejected],
  );
  const load = useCallback(() => fetchDetail(false), [fetchDetail]);
  // After Start, the card stays shown until its new state comes.
  const reloadQuietly = useCallback(() => fetchDetail(true), [fetchDetail]);

  useEffect(() => {
    load();
  }, [load]);

  // What the board already knows is shown at once, the rest once loaded.
  const detail: TrelloCardDetail =
    state.status === 'loaded' ? state.card : fromBoardCard(card);

  const startWork = useStartWork({
    card: state.status === 'loaded' ? state.card : null,
    shortLink: card.shortLink,
    client,
    store,
    memberId,
    onChanged: reloadQuietly,
    onTokenRejected,
  });

  return (
    <ScreenFrame
      title={boardName}
      onBack={onBack}
      actions={
        <>
          {canEdit && (
            <SmallButton
              label={t(startWork.busy ? 'startWork.busy' : 'startWork.start')}
              accessibilityLabel={t('startWork.startHint')}
              disabled={startWork.busy || state.status !== 'loaded'}
              onPress={startWork.start}
            />
          )}
          {startWork.notePath && (
            <SmallButton
              label={t('startWork.openNote')}
              accessibilityLabel={t('startWork.openNoteHint')}
              onPress={startWork.openNote}
            />
          )}
          <InsertInkLinkButton
            target={{kind: 'card', shortLink: detail.shortLink ?? card.id}}
            name={detail.name}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('board.refresh')}
            hitSlop={spacing.md}
            onPress={load}
            style={styles.iconButton}>
            <RefreshIcon size={HEADER_ICON_SIZE} color={colors.foreground} />
          </Pressable>
        </>
      }>
      {startWork.report && (
        <StartWorkReportView
          report={startWork.report}
          notePath={startWork.notePath}
          onOpenNote={startWork.openNote}
          onClose={startWork.dismissReport}
        />
      )}
      <DetailPages
        // Pages are measured again for new content.
        key={`${state.status}:${version}`}
        card={detail}
        listName={detail.list?.name ?? listName}
        members={cardMembers(detail, members)}
        footer={
          state.status === 'loading' ? (
            <Text style={styles.message}>{t('cardDetail.loading')}</Text>
          ) : state.status === 'failed' ? (
            <View style={styles.failure}>
              <Text style={styles.message}>{t('cardDetail.loadFailed')}</Text>
              <SmallButton
                label={t('common.retry')}
                accessibilityLabel={t('common.retry')}
                onPress={load}
              />
            </View>
          ) : null
        }
      />
    </ScreenFrame>
  );
}

function fromBoardCard(card: TrelloBoardCard): TrelloCardDetail {
  return {
    id: card.id,
    name: card.name,
    desc: '',
    idList: card.idList,
    url: '',
    shortUrl: '',
    start: null,
    due: card.due,
    dueComplete: card.dueComplete,
    dateLastActivity: null,
    labels: card.labels ?? [],
    idMembers: card.idMembers ?? [],
  };
}

/** One line of the Start report, in the user's language. */
function describeStep(
  step: StartWorkStep,
  t: ReturnType<typeof useTranslation>['t'],
): string {
  switch (step.kind) {
    case 'assign':
      return t(step.ok ? 'startWork.stepAssign' : 'startWork.stepAssignFailed');
    case 'removeLabel':
      return t(
        step.ok
          ? 'startWork.stepRemoveLabel'
          : 'startWork.stepRemoveLabelFailed',
        {name: step.name},
      );
    case 'addLabel':
      return t(
        step.ok ? 'startWork.stepAddLabel' : 'startWork.stepAddLabelFailed',
        {name: step.name},
      );
    case 'createLabel':
      return t(
        step.ok
          ? 'startWork.stepCreateLabel'
          : 'startWork.stepCreateLabelFailed',
        {name: step.name},
      );
    case 'move':
      return t(step.ok ? 'startWork.stepMove' : 'startWork.stepMoveFailed', {
        name: step.name,
      });
    case 'missingList':
      return t('startWork.stepMissingList', {name: step.name});
    case 'boardUnreadable':
      return t('startWork.stepBoardUnreadable');
    case 'nothingToChange':
      return t('startWork.stepNothing');
  }
}

function describeNote(
  note: NoteOutcome,
  t: ReturnType<typeof useTranslation>['t'],
): string {
  switch (note.kind) {
    case 'created':
      return t('startWork.noteCreated', {file: note.fileName});
    case 'found':
      return t('startWork.noteFound', {file: note.fileName});
    case 'failed':
      return t('startWork.noteFailed');
    case 'openFailed':
      return t('startWork.noteOpenFailed');
  }
}

/**
 * What Start did, framed above the card: shown when something went wrong
 * or no note was opened. The card's note can be opened from it.
 */
function StartWorkReportView({
  report,
  notePath,
  onOpenNote,
  onClose,
}: {
  report: StartWorkReport;
  notePath: string | null;
  onOpenNote: () => void;
  onClose: () => void;
}): React.JSX.Element {
  const {t} = useTranslation();
  const lines = report.disabled
    ? [t('startWork.allDisabled')]
    : [
        ...report.steps.map(step => describeStep(step, t)),
        ...(report.note ? [describeNote(report.note, t)] : []),
      ];
  return (
    <View accessibilityRole="alert" style={styles.report}>
      <Text style={styles.reportTitle}>
        {t(
          report.disabled
            ? 'settings.startWork'
            : report.failed
            ? 'startWork.reportFailed'
            : 'startWork.reportDone',
        )}
      </Text>
      {lines.map((line, index) => (
        <Text key={index} style={styles.message}>
          {`• ${line}`}
        </Text>
      ))}
      <View style={styles.reportActions}>
        {notePath && !report.disabled && (
          <SmallButton
            label={t('startWork.openNote')}
            accessibilityLabel={t('startWork.openNoteHint')}
            onPress={onOpenNote}
          />
        )}
        <SmallButton
          label={t('common.ok')}
          accessibilityLabel={t('common.ok')}
          onPress={onClose}
        />
      </View>
    </View>
  );
}

interface DetailPagesProps {
  card: TrelloCardDetail;
  listName: string;
  members: readonly TrelloBoardMember[];
  /** Status shown under the summary while the detail loads or failed. */
  footer: React.ReactNode;
}

/**
 * Lays the blocks of the card out page by page. Blocks are first rendered
 * in an invisible layer to measure them; each page then holds only the
 * blocks that fit entirely.
 */
function DetailPages({
  card,
  listName,
  members,
  footer,
}: DetailPagesProps): React.JSX.Element {
  const {t} = useTranslation();
  const blocks = useMemo(() => buildDetailBlocks(card), [card]);
  const [areaHeight, setAreaHeight] = useState(0);
  const [heights, setHeights] = useState<Readonly<Record<string, number>>>({});
  const [page, setPage] = useState(0);

  const measure = useCallback((key: string, event: LayoutChangeEvent) => {
    const measured = Math.ceil(event.nativeEvent.layout.height);
    setHeights(current =>
      current[key] === measured ? current : {...current, [key]: measured},
    );
  }, []);

  const pages = useMemo(() => {
    const measured = blocks.map(block => heights[block.key]);
    if (areaHeight <= 0 || measured.some(h => h === undefined)) {
      return null;
    }
    return paginateBlocks(
      measured as number[],
      blocks.map(
        block => block.kind === 'heading' || block.kind === 'checklist',
      ),
      areaHeight,
      BLOCK_GAP,
    );
  }, [areaHeight, blocks, heights]);

  const totalPages = pages?.length ?? 1;
  const pageIndex = Math.min(page, totalPages - 1);
  const visible = pages
    ? blocks.slice(pages[pageIndex].start, pages[pageIndex].end)
    : [];
  const turnPage = useCallback(
    (delta: number) =>
      setPage(Math.min(Math.max(0, pageIndex + delta), totalPages - 1)),
    [pageIndex, totalPages],
  );
  // Like turning pages in a document: swipe left or up for the next page.
  const swipeHandlers = useTwoFingerSwipe((direction: SwipeDirection) =>
    turnPage(direction === 'left' || direction === 'up' ? 1 : -1),
  );

  const renderBlock = (block: DetailBlock) => (
    <Block
      block={block}
      card={card}
      listName={listName}
      members={members}
      footer={footer}
    />
  );

  return (
    <View style={styles.container} {...swipeHandlers}>
      <View
        style={styles.area}
        onLayout={event => {
          const {height} = event.nativeEvent.layout;
          setAreaHeight(current => (current === height ? current : height));
        }}>
        <View style={styles.measureLayer} pointerEvents="none">
          {blocks.map(block => (
            <View key={block.key} onLayout={event => measure(block.key, event)}>
              {renderBlock(block)}
            </View>
          ))}
        </View>
        {visible.map(block => (
          <React.Fragment key={block.key}>{renderBlock(block)}</React.Fragment>
        ))}
      </View>

      {/* Always present, so that the page area keeps the same height. */}
      <View style={styles.pageFooter}>
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

interface BlockProps {
  block: DetailBlock;
  card: TrelloCardDetail;
  listName: string;
  members: readonly TrelloBoardMember[];
  footer: React.ReactNode;
}

function Block({
  block,
  card,
  listName,
  members,
  footer,
}: BlockProps): React.JSX.Element {
  const {t, locale} = useTranslation();
  switch (block.kind) {
    case 'summary':
      return (
        <Summary
          card={card}
          listName={listName}
          members={members}
          footer={footer}
        />
      );
    case 'heading':
      return (
        <View style={styles.heading}>
          <Text style={styles.headingText}>
            {t(SECTION_TITLES[block.section])}
          </Text>
          {block.count !== undefined && (
            <Text style={styles.headingCount}>{block.count}</Text>
          )}
        </View>
      );
    case 'paragraph':
      return <Text style={styles.paragraph}>{block.text}</Text>;
    case 'checklist':
      return (
        <View style={styles.checklist}>
          <Text style={styles.checklistName}>{block.name}</Text>
          <Text style={styles.checklistCount}>
            {block.done}/{block.total}
          </Text>
        </View>
      );
    case 'checkItem':
      return (
        <View
          style={styles.checkItem}
          accessible
          accessibilityRole="checkbox"
          accessibilityState={{checked: block.complete}}>
          <View style={[styles.checkBox, block.complete && styles.checkBoxOn]}>
            {block.complete && <Text style={styles.checkMark}>✓</Text>}
          </View>
          <Text
            style={[styles.checkItemText, block.complete && styles.checkDone]}>
            {block.name}
          </Text>
        </View>
      );
    case 'attachment':
      return (
        <Pressable
          accessibilityRole="link"
          onPress={() =>
            Linking.openURL(block.url).catch(error =>
              console.warn('[sINK] Failed to open an attachment', error),
            )
          }
          style={({pressed}) => [styles.attachment, pressed && styles.pressed]}>
          {({pressed}) => (
            <Text
              style={[styles.attachmentText, pressed && styles.pressedText]}
              numberOfLines={2}>
              {block.name}
            </Text>
          )}
        </Pressable>
      );
    case 'comment':
      return (
        <View style={styles.comment}>
          <Text style={styles.commentMeta}>
            {[block.author, formatCardDate(block.date, locale, true)]
              .filter(Boolean)
              .join(' · ')}
          </Text>
          <Text style={styles.paragraph}>{block.text}</Text>
        </View>
      );
  }
}

/** Name, list, labels, members and dates of the card. */
function Summary({
  card,
  listName,
  members,
  footer,
}: Omit<BlockProps, 'block'>): React.JSX.Element {
  const {t, locale} = useTranslation();
  const labels = card.labels ?? [];
  return (
    <View style={styles.summary}>
      <View style={styles.titleRow}>
        {card.dueComplete && (
          <View
            style={styles.completeMark}
            accessible
            accessibilityLabel={t('board.complete')}>
            <Text style={styles.completeMarkText}>✓</Text>
          </View>
        )}
        <Text style={styles.cardName}>{card.name}</Text>
      </View>
      {!!listName && (
        <Text style={styles.meta}>
          {t('cardDetail.inList', {list: listName})}
        </Text>
      )}
      {labels.length > 0 && (
        <View style={styles.labels}>
          {labels.map(label => (
            <LabelChip key={label.id} label={label} />
          ))}
        </View>
      )}
      {members.length > 0 && (
        <View style={styles.members}>
          {members.map(member => (
            <View key={member.id} style={styles.member}>
              <MemberAvatar
                initials={member.initials}
                avatarUrl={member.avatarUrl}
                size={AVATAR_SIZE}
              />
              <Text style={styles.meta}>{member.fullName}</Text>
            </View>
          ))}
        </View>
      )}
      {(card.start || card.due) && (
        <View style={styles.dates}>
          {card.start && (
            <Text style={styles.meta}>
              {t('cardDetail.start', {
                date: formatCardDate(card.start, locale, true),
              })}
            </Text>
          )}
          {card.due && (
            <Text style={styles.meta}>
              {t(
                card.dueComplete ? 'cardDetail.dueComplete' : 'cardDetail.due',
                {
                  date: formatCardDate(card.due, locale, true),
                },
              )}
            </Text>
          )}
        </View>
      )}
      {footer}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  area: {
    flex: 1,
    gap: BLOCK_GAP,
    overflow: 'hidden',
  },
  measureLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    opacity: 0,
    gap: BLOCK_GAP,
  },
  pageFooter: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
  },
  footerText: {
    color: colors.foreground,
    fontSize: typography.body,
  },
  iconButton: {
    padding: spacing.sm,
  },
  report: {
    gap: spacing.xs,
    borderColor: colors.foreground,
    borderWidth: borders.width,
    borderRadius: borders.radius,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  reportTitle: {
    color: colors.foreground,
    fontSize: typography.label,
    fontWeight: '700',
  },
  reportActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  message: {
    color: colors.foreground,
    fontSize: typography.body,
  },
  failure: {
    gap: spacing.md,
    alignItems: 'flex-start',
  },
  summary: {
    gap: spacing.md,
    paddingBottom: spacing.sm,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  cardName: {
    flex: 1,
    color: colors.foreground,
    fontSize: typography.heading,
    fontWeight: '700',
  },
  completeMark: {
    width: 32,
    height: 32,
    marginTop: 4,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.foreground,
  },
  completeMarkText: {
    color: colors.background,
    fontSize: 20,
    fontWeight: '700',
  },
  meta: {
    color: colors.foreground,
    fontSize: typography.body,
  },
  labels: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  members: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  member: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  dates: {
    gap: spacing.xs,
  },
  heading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borders.radius,
    backgroundColor: colors.listHeader,
  },
  headingText: {
    flex: 1,
    color: colors.listHeaderText,
    fontSize: typography.label,
    fontWeight: '700',
  },
  headingCount: {
    color: colors.listHeaderText,
    fontSize: typography.body,
    fontWeight: '600',
  },
  paragraph: {
    color: colors.foreground,
    fontSize: typography.body,
    lineHeight: 30,
  },
  checklist: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderBottomWidth: borders.width,
    borderBottomColor: colors.foreground,
    paddingBottom: spacing.xs,
  },
  checklistName: {
    flex: 1,
    color: colors.foreground,
    fontSize: typography.label,
    fontWeight: '700',
  },
  checklistCount: {
    color: colors.foreground,
    fontSize: typography.body,
  },
  checkItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  checkBox: {
    width: 26,
    height: 26,
    marginTop: 2,
    borderWidth: borders.width,
    borderColor: colors.foreground,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkBoxOn: {
    backgroundColor: colors.foreground,
  },
  checkMark: {
    color: colors.background,
    fontSize: 18,
    fontWeight: '700',
    lineHeight: 22,
  },
  checkItemText: {
    flex: 1,
    color: colors.foreground,
    fontSize: typography.body,
  },
  checkDone: {
    textDecorationLine: 'line-through',
  },
  attachment: {
    borderWidth: borders.width,
    borderColor: colors.foreground,
    borderRadius: borders.radius,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  attachmentText: {
    color: colors.foreground,
    fontSize: typography.body,
    textDecorationLine: 'underline',
  },
  pressed: {
    backgroundColor: colors.foreground,
  },
  pressedText: {
    color: colors.background,
  },
  comment: {
    gap: spacing.xs,
    borderLeftWidth: 4,
    borderLeftColor: colors.listHeader,
    paddingLeft: spacing.md,
  },
  commentMeta: {
    color: colors.foreground,
    fontSize: typography.small,
    fontWeight: '700',
  },
});
