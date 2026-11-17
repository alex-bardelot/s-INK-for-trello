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
  withCheckItemState,
} from '../cards/detail';
import {Button} from '../components/Button';
import {GearIcon} from '../components/GearIcon';
import {useSettingsOpener} from '../components/settingsOpener';
import {InsertInkLinkButton} from '../components/InsertInkLinkButton';
import {LabelChip} from '../components/LabelChip';
import {MemberAvatar} from '../components/MemberAvatar';
import {Popup} from '../components/Popup';
import {RefreshIcon} from '../components/RefreshIcon';
import {SIGN_SIZE, SignCircle} from '../components/SignCircle';
import {
  CONTENT_PADDING,
  HEADER_ICON_SIZE,
  ScreenFrame,
} from '../components/ScreenFrame';
import {SmallButton} from '../components/SmallButton';
import {SwitchTrack} from '../components/Switch';
import {NoteIcon, StartIcon} from '../components/ActionIcons';
import {TranslationKey, useTranslation} from '../i18n';
import {toSessionError} from '../session/trelloSession';
import {settingsForRun, StartWorkPreviewStep} from '../startWork/plan';
import {StartWorkStep} from '../startWork/startWork';
import {
  NoteOutcome,
  StartWorkPreview,
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
/** Play sign of the Start work popup, which its tree of steps hangs from. */
const TREE_ICON_SIZE = 48;
const TREE_LINE = 2;
/** The tree's line runs under the middle of the play sign. */
const TREE_TRUNK_LEFT = TREE_ICON_SIZE / 2 - TREE_LINE / 2;
const TREE_BRANCH_WIDTH = TREE_ICON_SIZE;
const TREE_DOT_SIZE = 10;

const SECTION_TITLES: Record<DetailSection, TranslationKey> = {
  description: 'cardDetail.description',
  checklists: 'cardDetail.checklists',
  attachments: 'cardDetail.attachments',
  comments: 'cardDetail.comments',
};

/** Line shown under the heading of a section the card has nothing in. */
const SECTION_EMPTY: Record<DetailSection, TranslationKey> = {
  description: 'cardDetail.noDescription',
  checklists: 'cardDetail.noChecklists',
  attachments: 'cardDetail.noAttachments',
  comments: 'cardDetail.noComments',
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
  /**
   * Start work was chosen in the card's menu on the board: once the card
   * is loaded, its steps are listed to confirm, unless it is started.
   */
  startOnOpen?: boolean;
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
  startOnOpen = false,
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

  // A tapped checklist item is ticked or unticked at once, then on Trello;
  // it goes back if Trello refuses. Items on their way can't be tapped.
  const [pendingItems, setPendingItems] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [checkFailed, setCheckFailed] = useState(false);
  const setItemShown = (itemId: string, complete: boolean) =>
    setState(current =>
      current.status === 'loaded'
        ? {
            status: 'loaded',
            card: withCheckItemState(current.card, itemId, complete),
          }
        : current,
    );
  const toggleCheckItem = async (itemId: string, complete: boolean) => {
    if (pendingItems.has(itemId)) {
      return;
    }
    setCheckFailed(false);
    setItemShown(itemId, complete);
    setPendingItems(current => new Set(current).add(itemId));
    try {
      await client.setCheckItemState(card.id, itemId, complete);
    } catch (error) {
      console.warn('[sINK] Failed to update a checklist item', error);
      setItemShown(itemId, !complete);
      if (toSessionError(error) === 'invalidToken') {
        onTokenRejected();
        return;
      }
      setCheckFailed(true);
    } finally {
      setPendingItems(current => {
        const next = new Set(current);
        next.delete(itemId);
        return next;
      });
    }
  };

  // What the board already knows is shown at once, the rest once loaded.
  const detail: TrelloCardDetail =
    state.status === 'loaded' ? state.card : fromBoardCard(card);

  const startWork = useStartWork({
    card: state.status === 'loaded' ? state.card : null,
    shortLink: card.shortLink,
    cardName: card.name,
    listName,
    boardName,
    client,
    store,
    memberId,
    onChanged: reloadQuietly,
    onTokenRejected,
  });

  // What Start is about to do is listed first, each step with a switch for
  // this run alone, from the saved settings each time; then confirmed or
  // cancelled.
  const [preview, setPreview] = useState<StartWorkPreview | null>(null);
  const askStart = async () => setPreview(await startWork.loadPreview());

  // Asked once, from the board's card menu, as soon as Start can be told.
  const [startAsked, setStartAsked] = useState(false);
  useEffect(() => {
    if (!startOnOpen || startAsked || !canEdit || !startWork.ready) {
      return;
    }
    setStartAsked(true);
    if (!startWork.started && !startWork.busy) {
      askStart();
    }
    // askStart reads the current card; it runs once, when Start is ready.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canEdit, startAsked, startOnOpen, startWork.ready]);
  const confirmStart = (steps: readonly StartWorkPreviewStep[]) => {
    if (preview) {
      setPreview(null);
      startWork.start(settingsForRun(preview.settings, steps));
    }
  };
  // The popup's Settings button opens Settings at Start work, over the card
  // and the popup, which stay (the opener is `null` meanwhile). Back from
  // Settings, the popup lists the steps again from the settings changed
  // there.
  const openSettings = useSettingsOpener();
  const openStartWorkSettings = openSettings
    ? () => openSettings('startWork')
    : undefined;
  const settingsClosed = openSettings !== null;
  const previewShown = preview !== null;
  useEffect(() => {
    if (!settingsClosed || !previewShown) {
      return;
    }
    let active = true;
    startWork.loadPreview().then(next => active && setPreview(next));
    return () => {
      active = false;
    };
    // Runs when Settings closes over an open popup, not when it opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settingsClosed]);

  // The list the card is in now: Start may have moved it.
  const shownListName = detail.list?.name ?? listName;

  return (
    <ScreenFrame
      // Where the card is: its board and its list.
      title={`${boardName} / ${shownListName}`}
      onBack={onBack}
      // The card's Start button follows the Start work settings.
      settingsCategory="startWork"
      overlay={
        preview && (
          <StartWorkConfirmPopup
            steps={preview.steps}
            onCancel={() => setPreview(null)}
            onConfirm={confirmStart}
            onOpenSettings={openStartWorkSettings}
          />
        )
      }
      actions={
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('board.refresh')}
          hitSlop={spacing.md}
          onPress={load}
          style={styles.iconButton}>
          <RefreshIcon size={HEADER_ICON_SIZE} color={colors.foreground} />
        </Pressable>
      }>
      {/* The card's name and its own actions, above every page. */}
      <View style={styles.titleRow}>
        {detail.dueComplete && (
          <View
            style={styles.completeMark}
            accessible
            accessibilityLabel={t('board.complete')}>
            <Text style={styles.completeMarkText}>✓</Text>
          </View>
        )}
        <Text accessibilityRole="header" style={styles.cardName}>
          {detail.name}
        </Text>
        <View style={styles.cardActions}>
          {/* Not offered again once the card is started, unless running. */}
          {canEdit && (startWork.busy || !startWork.started) && (
            <SmallButton
              label={t(startWork.busy ? 'startWork.busy' : 'startWork.start')}
              accessibilityLabel={t('startWork.startHint')}
              disabled={startWork.busy || state.status !== 'loaded'}
              onPress={askStart}
              icon={StartIcon}
            />
          )}
          {startWork.notePath ? (
            <SmallButton
              label={t('startWork.openNote')}
              accessibilityLabel={t('startWork.openNoteHint')}
              onPress={startWork.openNote}
              icon={NoteIcon}
            />
          ) : (
            // The card's note already holds a link to it.
            <InsertInkLinkButton
              target={{kind: 'card', shortLink: detail.shortLink ?? card.id}}
              name={detail.name}
            />
          )}
        </View>
      </View>
      {startWork.report && (
        <StartWorkReportView
          report={startWork.report}
          notePath={startWork.notePath}
          onOpenNote={startWork.openNote}
          onClose={startWork.dismissReport}
        />
      )}
      {checkFailed && (
        <View accessibilityRole="alert" style={styles.checkFailure}>
          <Text style={[styles.message, styles.checkFailureText]}>
            {t('cardDetail.checkItemFailed')}
          </Text>
          <SmallButton
            label={t('common.ok')}
            accessibilityLabel={t('common.ok')}
            onPress={() => setCheckFailed(false)}
          />
        </View>
      )}
      <DetailPages
        // Pages are measured again for new content; ticking an item keeps
        // the page shown.
        key={`${state.status}:${version}`}
        card={detail}
        members={cardMembers(detail, members)}
        onToggleCheckItem={
          canEdit && state.status === 'loaded' ? toggleCheckItem : undefined
        }
        pendingItems={pendingItems}
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

/**
 * One step Start is about to take, in the user's language: its words, and
 * what it acts on, a label or a list, drawn after them. A label's words are
 * only read aloud: the label shows after a round − or +, as in Settings.
 */
function previewStepParts(
  step: StartWorkPreviewStep,
  t: ReturnType<typeof useTranslation>['t'],
): {text: string; name?: string; sign?: '−' | '+'} {
  switch (step.kind) {
    case 'assign':
      return {text: t('startWork.assignMe')};
    case 'removeLabel':
      return {
        text: t('startWork.previewRemoveLabel'),
        name: step.name,
        sign: '−',
      };
    case 'addLabel':
      return {
        text: t('startWork.previewAddLabel'),
        name: step.name,
        sign: '+',
      };
    case 'move':
      return {text: t('startWork.previewMove'), name: step.name};
    case 'createNote':
      return {text: t('startWork.previewCreateNote')};
    case 'openNote':
      return {text: t('startWork.previewOpenNote')};
  }
}

/**
 * A step of the popup's tree: its branch from the line coming down from
 * the play sign, a mark (a dot, a round − or + for a label, an arrow for
 * the note, opened last), its words or label, the list in a frame, and its
 * switch at the end. Marks share one width, so that every step's words or
 * label start at the same place. The whole row turns the step on or off.
 */
function PreviewStepRow({
  step,
  last,
  onToggle,
}: {
  step: StartWorkPreviewStep;
  last: boolean;
  onToggle: () => void;
}): React.JSX.Element {
  const {t} = useTranslation();
  const {text, name, sign} = previewStepParts(step, t);
  const note = step.kind === 'createNote' || step.kind === 'openNote';
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{checked: step.on}}
      accessibilityLabel={name ? `${text} ${name}` : text}
      onPress={onToggle}
      style={styles.treeRow}>
      <View style={styles.treeBranch}>
        <View style={[styles.treeTrunk, last && styles.treeTrunkEnd]} />
        <View style={styles.treeTwig} />
      </View>
      <View style={styles.treeMark}>
        {sign ? (
          <SignCircle sign={sign} />
        ) : note ? (
          <Text style={styles.treeArrow}>›</Text>
        ) : (
          <View style={styles.treeDot} />
        )}
      </View>
      <View style={styles.treeContent}>
        {!sign && <Text style={styles.popupText}>{text}</Text>}
        {name !== undefined &&
          (step.kind === 'move' ? (
            <View style={styles.treeList}>
              <Text style={styles.treeListText} numberOfLines={1}>
                {name}
              </Text>
            </View>
          ) : (
            <LabelChip
              large
              label={{name, color: 'color' in step ? step.color : null}}
            />
          ))}
      </View>
      <SwitchTrack value={step.on} />
    </Pressable>
  );
}

/** Gear of the popup's Settings button, in the button's colors. */
const settingsIcon = (color: string, background: string) => (
  <GearIcon size={24} color={color} holeColor={background} />
);

/**
 * Asks before Start runs: the play sign and what it does, then its steps
 * as a tree hanging from the sign, each with a switch that turns it off
 * for this run alone; Settings (at Start work) on the left, Cancel and
 * Start work on the right. Start work is unavailable while every step is
 * off.
 */
function StartWorkConfirmPopup({
  steps: initialSteps,
  onCancel,
  onConfirm,
  onOpenSettings,
}: {
  steps: readonly StartWorkPreviewStep[];
  onCancel: () => void;
  onConfirm: (steps: readonly StartWorkPreviewStep[]) => void;
  /** Unset where Settings cannot be opened: the button is left out. */
  onOpenSettings?: () => void;
}): React.JSX.Element {
  const {t} = useTranslation();
  const [steps, setSteps] = useState(initialSteps);
  // Listed again after Settings: the switches start from it once more.
  useEffect(() => setSteps(initialSteps), [initialSteps]);
  const toggle = (index: number) =>
    setSteps(current =>
      current.map((step, i) => (i === index ? {...step, on: !step.on} : step)),
    );
  return (
    <Popup
      title={t('startWork.confirmIntro')}
      icon={<StartIcon size={TREE_ICON_SIZE} color={colors.foreground} />}
      onClose={onCancel}
      actions={
        <>
          {onOpenSettings && (
            <View style={styles.popupSettings}>
              <Button
                label={t('settings.open')}
                onPress={onOpenSettings}
                icon={settingsIcon}
              />
            </View>
          )}
          <Button label={t('common.cancel')} onPress={onCancel} />
          <Button
            primary
            label={t('startWork.start')}
            disabled={!steps.some(step => step.on)}
            onPress={() => onConfirm(steps)}
          />
        </>
      }>
      <View style={styles.tree}>
        {steps.map((step, index) => (
          <PreviewStepRow
            key={index}
            step={step}
            last={index === steps.length - 1}
            onToggle={() => toggle(index)}
          />
        ))}
      </View>
      {/* Said in words only when the Settings button cannot be shown. */}
      {!onOpenSettings && (
        <Text style={styles.popupHint}>{t('startWork.confirmSettings')}</Text>
      )}
    </Popup>
  );
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
    case 'missingLabel':
      return t('startWork.stepMissingLabel', {name: step.name});
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
      return note.templateWarning
        ? `${t('startWork.noteCreated', {file: note.fileName})} ${t(
            'startWork.templateNotUsed',
          )} ${t('startWork.failureDetail', {reason: note.templateWarning})}`
        : t('startWork.noteCreated', {file: note.fileName});
    case 'found':
      return t('startWork.noteFound', {file: note.fileName});
    case 'failed':
      return `${t('startWork.noteFailed')} ${t('startWork.failureDetail', {
        reason: note.reason,
      })}`;
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
            icon={NoteIcon}
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
  members: readonly TrelloBoardMember[];
  /** Status shown under the summary while the detail loads or failed. */
  footer: React.ReactNode;
  /** Ticks or unticks a checklist item; unset, items can't be tapped. */
  onToggleCheckItem?: (itemId: string, complete: boolean) => void;
  /** Items whose new state is on its way to Trello. */
  pendingItems: ReadonlySet<string>;
}

/**
 * Lays the blocks of the card out page by page. Blocks are first rendered
 * in an invisible layer to measure them; each page then holds only the
 * blocks that fit entirely.
 */
function DetailPages({
  card,
  members,
  footer,
  onToggleCheckItem,
  pendingItems,
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
      members={members}
      footer={footer}
      onToggleCheckItem={onToggleCheckItem}
      pendingItems={pendingItems}
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
  members: readonly TrelloBoardMember[];
  footer: React.ReactNode;
  onToggleCheckItem?: (itemId: string, complete: boolean) => void;
  pendingItems: ReadonlySet<string>;
}

function Block({
  block,
  card,
  members,
  footer,
  onToggleCheckItem,
  pendingItems,
}: BlockProps): React.JSX.Element {
  const {t, locale} = useTranslation();
  switch (block.kind) {
    case 'summary':
      return (
        <Summary
          card={card}
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
    case 'checkItem': {
      const content = (
        <>
          <View style={[styles.checkBox, block.complete && styles.checkBoxOn]}>
            {block.complete && <Text style={styles.checkMark}>✓</Text>}
          </View>
          <Text
            style={[styles.checkItemText, block.complete && styles.checkDone]}>
            {block.name}
          </Text>
        </>
      );
      if (!onToggleCheckItem) {
        return (
          <View
            style={styles.checkItem}
            accessible
            accessibilityRole="checkbox"
            accessibilityState={{checked: block.complete}}>
            {content}
          </View>
        );
      }
      // The whole row ticks or unticks the item, here and on Trello.
      const pending = pendingItems.has(block.itemId);
      return (
        <Pressable
          style={styles.checkItem}
          accessibilityRole="checkbox"
          accessibilityState={{checked: block.complete, busy: pending}}
          accessibilityLabel={block.name}
          disabled={pending}
          hitSlop={{top: BLOCK_GAP / 2, bottom: BLOCK_GAP / 2}}
          onPress={() => onToggleCheckItem(block.itemId, !block.complete)}>
          {content}
        </Pressable>
      );
    }
    case 'attachment': {
      const url = block.url;
      if (url === null) {
        // Not a web address: shown, never opened.
        return (
          <View style={styles.attachment}>
            <Text style={styles.attachmentText} numberOfLines={2}>
              {block.name}
            </Text>
          </View>
        );
      }
      return (
        <Pressable
          accessibilityRole="link"
          onPress={() =>
            Linking.openURL(url).catch(error =>
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
    }
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
    case 'empty':
      return (
        <Text style={styles.emptySection}>
          {t(SECTION_EMPTY[block.section])}
        </Text>
      );
  }
}

/**
 * Labels, members and dates of the card. Its name stands above the pages,
 * its board and list in the title bar.
 */
function Summary({
  card,
  members,
  footer,
}: Pick<BlockProps, 'card' | 'members' | 'footer'>): React.JSX.Element {
  const {t, locale} = useTranslation();
  const labels = card.labels ?? [];
  return (
    <View style={styles.summary}>
      {(labels.length > 0 || members.length > 0) && (
        <LabelsAndMembers labels={labels} members={members} />
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

/**
 * The card's labels on the left and its members on the right, on one row.
 * Members are shown with their full name while it fits; when they would
 * take more than half the row next to labels (or the whole row without
 * labels), only their round avatars are shown.
 */
function LabelsAndMembers({
  labels,
  members,
}: {
  labels: NonNullable<TrelloCardDetail['labels']>;
  members: readonly TrelloBoardMember[];
}): React.JSX.Element {
  const [rowWidth, setRowWidth] = useState(0);
  const [namesWidth, setNamesWidth] = useState(0);
  const memberIds = members.map(member => member.id).join(',');
  // Measured again whenever the members change.
  useEffect(() => setNamesWidth(0), [memberIds]);
  const room = labels.length > 0 ? rowWidth / 2 : rowWidth;
  const compact = rowWidth > 0 && namesWidth > room;
  return (
    <View
      style={styles.labelsAndMembers}
      onLayout={event => {
        const {width} = event.nativeEvent.layout;
        setRowWidth(current => (current === width ? current : width));
      }}>
      <View style={styles.labels}>
        {labels.map(label => (
          <LabelChip key={label.id} label={label} />
        ))}
      </View>
      {members.length > 0 &&
        (compact ? (
          <View
            style={[
              styles.membersCompact,
              labels.length > 0 && styles.membersBesideLabels,
            ]}>
            {members.map(member => (
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
          </View>
        ) : (
          <View
            style={styles.members}
            onLayout={event => {
              const {width} = event.nativeEvent.layout;
              setNamesWidth(current => (current === width ? current : width));
            }}>
            {members.map(member => (
              <View key={member.id} style={styles.member}>
                <MemberAvatar
                  initials={member.initials}
                  avatarUrl={member.avatarUrl}
                  size={AVATAR_SIZE}
                />
                <Text style={styles.meta} numberOfLines={1}>
                  {member.fullName}
                </Text>
              </View>
            ))}
          </View>
        ))}
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
  checkFailure: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderColor: colors.foreground,
    borderWidth: borders.width,
    borderRadius: borders.radius,
    padding: spacing.sm,
    marginBottom: spacing.md,
  },
  checkFailureText: {
    flex: 1,
  },
  popupText: {
    color: colors.foreground,
    fontSize: typography.label,
  },
  popupHint: {
    color: colors.foreground,
    fontSize: typography.small,
  },
  // Settings stands apart, on the left of Cancel and Start work.
  popupSettings: {
    marginRight: 'auto',
  },
  // Hangs right under the play sign of the popup's title.
  tree: {
    marginTop: -spacing.md,
  },
  // Rows touch, so that the tree's line runs on from one to the next.
  treeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 64,
    paddingVertical: spacing.xs,
  },
  treeBranch: {
    width: TREE_BRANCH_WIDTH,
    alignSelf: 'stretch',
    // The row's padding is crossed, so that the line has no gap.
    marginVertical: -spacing.xs,
  },
  treeTrunk: {
    position: 'absolute',
    left: TREE_TRUNK_LEFT,
    top: 0,
    bottom: 0,
    width: TREE_LINE,
    backgroundColor: colors.foreground,
  },
  // The last step ends the line, like the corner of a tree.
  treeTrunkEnd: {
    bottom: '50%',
  },
  treeTwig: {
    position: 'absolute',
    left: TREE_TRUNK_LEFT,
    right: 0,
    top: '50%',
    height: TREE_LINE,
    backgroundColor: colors.foreground,
  },
  // As wide as the round sign; the mark touches the end of its branch.
  treeMark: {
    width: SIGN_SIZE,
    alignItems: 'flex-start',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  treeDot: {
    width: TREE_DOT_SIZE,
    height: TREE_DOT_SIZE,
    borderRadius: TREE_DOT_SIZE / 2,
    backgroundColor: colors.foreground,
  },
  treeArrow: {
    color: colors.foreground,
    fontSize: typography.heading,
    fontWeight: '700',
    lineHeight: typography.heading,
  },
  treeContent: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.sm,
    marginRight: spacing.md,
  },
  // The list a card moves to, framed like a column of the board.
  treeList: {
    maxWidth: '100%',
    minHeight: 36,
    justifyContent: 'center',
    borderColor: colors.foreground,
    borderWidth: borders.width,
    borderRadius: borders.radius,
    paddingHorizontal: spacing.md,
  },
  treeListText: {
    color: colors.foreground,
    fontSize: typography.body,
    fontWeight: '700',
  },
  failure: {
    gap: spacing.md,
    alignItems: 'flex-start',
  },
  summary: {
    gap: spacing.md,
    paddingBottom: spacing.sm,
  },
  // The card's name stands out on a grey band drawn right under the title
  // bar and to both edges of the page, its text kept in line with the page.
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.titleBand,
    marginTop: -CONTENT_PADDING,
    marginHorizontal: -CONTENT_PADDING,
    paddingHorizontal: CONTENT_PADDING,
    paddingVertical: spacing.sm,
    marginBottom: spacing.md,
  },
  cardName: {
    flex: 1,
    color: colors.foreground,
    fontSize: typography.heading,
    fontWeight: '700',
  },
  // Start work and the note's button, at the end of the name's band.
  cardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginLeft: spacing.sm,
  },
  completeMark: {
    width: 32,
    height: 32,
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
  // Labels and members centred on each other vertically.
  labelsAndMembers: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  labels: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.xs,
  },
  // Natural width, on one line, so that it can be measured.
  members: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
    gap: spacing.md,
  },
  membersCompact: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    flexShrink: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: spacing.xs,
  },
  // Labels keep at least half the row.
  membersBesideLabels: {
    maxWidth: '50%',
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
  emptySection: {
    color: colors.foreground,
    fontSize: typography.body,
    fontStyle: 'italic',
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
