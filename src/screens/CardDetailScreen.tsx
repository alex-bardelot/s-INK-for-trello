import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  GestureResponderEvent,
  Keyboard,
  LayoutChangeEvent,
  Linking,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  View,
  ViewStyle,
} from 'react-native';

import {SwipeDirection} from '../board/layout';
import {useTwoFingerSwipe} from '../board/useTwoFingerSwipe';
import {
  buildDetailBlocks,
  cardMembers,
  DetailBlock,
  DetailSection,
  formatCardDate,
  labelChoices,
  paginateBlocks,
  withCardLabel,
  withCardMember,
  withCheckItemState,
  withComment,
} from '../cards/detail';
import {membersMeFirst} from '../cards/newCardForm';
import {BlockIcon, BlockIconKind} from '../components/BlockIcon';
import {Button} from '../components/Button';
import {CompleteMark} from '../components/CompleteMark';
import {
  CommentComposer,
  CommentComposerControl,
  CommentComposerProps,
} from '../components/CommentComposer';
import {
  FloatingPicker,
  FloatingPickerPosition,
  measurePickerPosition,
} from '../components/FloatingPicker';
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
  TrelloLabel,
} from '../trello/types';
import {borders, colors, spacing, typography} from '../theme';

const BLOCK_GAP = spacing.sm;
const AVATAR_SIZE = 40;
/** The round before the card's name that marks it complete. */
const COMPLETE_MARK_SIZE = 32;
/** As in the floating list of the New Trello Card page. */
const PICKER_AVATAR_SIZE = 28;
/** Tag or head of the dashed buttons, as high as the members' avatars. */
const DASHED_ICON_SIZE = 26;
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

type BoardLabelsState =
  | {status: 'idle' | 'loading' | 'failed'}
  | {status: 'loaded'; labels: TrelloLabel[]};

/** What the card page's floating list offers. */
type PickerKind = 'labels' | 'members';

export interface CardDetailScreenProps {
  /** The card as shown on the board, displayed while its detail loads. */
  card: TrelloBoardCard;
  boardId: string;
  boardName: string;
  listName: string;
  /**
   * Members of the board, used when the card's own are not returned, and
   * offered by the card's list of members.
   */
  members: ReadonlyMap<string, TrelloBoardMember>;
  client: TrelloClient;
  /** Where the Start work settings are kept. */
  store: KeyValueStore;
  /** Id of the signed-in member, assigned by Start. */
  memberId: string;
  /** The member may edit the board's cards: Start is offered. */
  canEdit: boolean;
  /**
   * The member may comment on the board's cards, a right of its own: an
   * observer may comment, an editor may not when comments are disabled.
   */
  canComment: boolean;
  /**
   * Start work was chosen in the card's menu on the board: once the card
   * is loaded, its steps are listed to confirm, unless it is started.
   */
  startOnOpen?: boolean;
  onBack: () => void;
  /** Called when Trello rejects the token while loading. */
  onTokenRejected: () => void;
  /** The card was marked complete, or not, on Trello from its page. */
  onCompleteChanged?: (cardId: string, complete: boolean) => void;
  /**
   * Going back, with the card as the page last showed it (if it loaded),
   * so that the board shows the changes made on it.
   */
  onLeave?: (shown: TrelloCardDetail) => void;
}

/**
 * Detail of a card: labels, members, dates, description, checklists,
 * attachments and latest comments. Like the board, the page is turned with
 * buttons or a two-finger swipe instead of being scrolled.
 */
export function CardDetailScreen({
  card,
  boardId,
  boardName,
  listName,
  members,
  client,
  store,
  memberId,
  canEdit,
  canComment,
  startOnOpen = false,
  onBack,
  onTokenRejected,
  onCompleteChanged,
  onLeave,
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

  // A tapped checklist item, label or member changes at once on the page,
  // then on Trello; it goes back if Trello refuses. What is on its way
  // can't be tapped again until Trello answers.
  const [pending, setPending] = useState<ReadonlySet<string>>(() => new Set());
  const [editFailure, setEditFailure] = useState<TranslationKey | null>(null);
  const updateShown = (change: (shown: TrelloCardDetail) => TrelloCardDetail) =>
    setState(current =>
      current.status === 'loaded'
        ? {status: 'loaded', card: change(current.card)}
        : current,
    );
  const sendEdit = async ({
    key,
    apply,
    undo,
    send,
    failure,
  }: {
    key: string;
    apply: (shown: TrelloCardDetail) => TrelloCardDetail;
    undo: (shown: TrelloCardDetail) => TrelloCardDetail;
    send: () => Promise<void>;
    failure: TranslationKey;
  }) => {
    if (pending.has(key)) {
      return;
    }
    setEditFailure(null);
    updateShown(apply);
    setPending(current => new Set(current).add(key));
    try {
      await send();
    } catch (error) {
      console.warn(`[sINK] Failed to update the card (${key})`, error);
      updateShown(undo);
      if (toSessionError(error) === 'invalidToken') {
        onTokenRejected();
        return;
      }
      setEditFailure(failure);
    } finally {
      setPending(current => {
        const next = new Set(current);
        next.delete(key);
        return next;
      });
    }
  };
  // A comment is written in the field atop the comments and shows once
  // Trello stored it. What is being written is kept here, as the field goes
  // whenever its page is turned or the pages are laid out again.
  const commentDraft = useRef('');
  const [commentSending, setCommentSending] = useState(false);
  const sendComment = async (text: string): Promise<boolean> => {
    setEditFailure(null);
    setCommentSending(true);
    try {
      const comment = await client.addCardComment(card.id, text);
      commentDraft.current = '';
      updateShown(shown => withComment(shown, comment));
      return true;
    } catch (error) {
      console.warn('[sINK] Failed to add a comment', error);
      if (toSessionError(error) === 'invalidToken') {
        onTokenRejected();
      } else {
        setEditFailure('cardDetail.commentFailed');
      }
      return false;
    } finally {
      setCommentSending(false);
    }
  };
  // A tap beside the field while a comment is written there asks first
  // whether to drop it, go on writing or save it; the tap does nothing
  // else (Back, a page turn, a label...), so nothing is lost by mistake.
  const commentControl = useRef<CommentComposerControl>(null);
  const [leavingComment, setLeavingComment] = useState(false);
  const guardComment = (event: GestureResponderEvent): boolean => {
    if (
      leavingComment ||
      commentSending ||
      commentDraft.current.trim() === ''
    ) {
      return false;
    }
    const {pageX, pageY} = event.nativeEvent;
    if (commentControl.current?.contains(pageX, pageY)) {
      return false;
    }
    Keyboard.dismiss();
    setLeavingComment(true);
    return true;
  };
  const keepComment = () => {
    setLeavingComment(false);
    commentControl.current?.focus();
  };
  const discardComment = () => {
    setLeavingComment(false);
    commentDraft.current = '';
    commentControl.current?.discard();
  };
  const saveComment = () => {
    setLeavingComment(false);
    if (commentControl.current) {
      commentControl.current.send();
    } else {
      sendComment(commentDraft.current.trim());
    }
  };

  // The description is changed in its own page, over the card, and shows
  // on the card once Trello took it; a refusal keeps the page and its text.
  const [editingDescription, setEditingDescription] = useState(false);
  const saveDescription = async (text: string): Promise<boolean> => {
    try {
      await client.setCardDescription(card.id, text);
    } catch (error) {
      console.warn('[sINK] Failed to change the description', error);
      if (toSessionError(error) === 'invalidToken') {
        onTokenRejected();
      }
      return false;
    }
    updateShown(shown => ({...shown, desc: text}));
    setEditingDescription(false);
    return true;
  };

  // The round before the card's name marks it complete, or not; the board
  // is told once Trello took it.
  const toggleComplete = (complete: boolean) =>
    sendEdit({
      key: 'complete',
      apply: shown => ({...shown, dueComplete: complete}),
      undo: shown => ({...shown, dueComplete: !complete}),
      send: async () => {
        await client.setCardComplete(card.id, complete);
        onCompleteChanged?.(card.id, complete);
      },
      failure: 'cardDetail.completeFailed',
    });
  const toggleCheckItem = (itemId: string, complete: boolean) =>
    sendEdit({
      key: `item:${itemId}`,
      apply: shown => withCheckItemState(shown, itemId, complete),
      undo: shown => withCheckItemState(shown, itemId, !complete),
      send: () => client.setCheckItemState(card.id, itemId, complete),
      failure: 'cardDetail.checkItemFailed',
    });
  const toggleLabel = (label: TrelloLabel, on: boolean) =>
    sendEdit({
      key: `label:${label.id}`,
      apply: shown => withCardLabel(shown, label, on),
      undo: shown => withCardLabel(shown, label, !on),
      send: () =>
        on
          ? client.addCardLabel(card.id, label.id)
          : client.removeCardLabel(card.id, label.id),
      failure: 'cardDetail.labelFailed',
    });
  const toggleMember = (member: TrelloBoardMember, on: boolean) =>
    sendEdit({
      key: `member:${member.id}`,
      apply: shown => withCardMember(shown, member, on),
      undo: shown => withCardMember(shown, member, !on),
      send: () =>
        on
          ? client.addCardMember(card.id, member.id)
          : client.removeCardMember(card.id, member.id),
      failure: 'cardDetail.memberFailed',
    });

  // The board's labels, read the first time the list of labels opens.
  const [boardLabels, setBoardLabels] = useState<BoardLabelsState>({
    status: 'idle',
  });
  const loadBoardLabels = () => {
    setBoardLabels({status: 'loading'});
    client
      .getBoardLabels(boardId)
      .then(labels => setBoardLabels({status: 'loaded', labels}))
      .catch(error => {
        console.warn('[sINK] Failed to read the board labels', error);
        if (toSessionError(error) === 'invalidToken') {
          onTokenRejected();
          return;
        }
        setBoardLabels({status: 'failed'});
      });
  };

  // The floating list of labels or members, under what opened it.
  const rootRef = useRef<View>(null);
  const [picker, setPicker] = useState<{
    kind: PickerKind;
    position: FloatingPickerPosition;
  } | null>(null);
  const openPicker = (kind: PickerKind, anchor: View) => {
    if (
      kind === 'labels' &&
      (boardLabels.status === 'idle' || boardLabels.status === 'failed')
    ) {
      loadBoardLabels();
    }
    if (rootRef.current) {
      measurePickerPosition(anchor, rootRef.current).then(position =>
        setPicker({kind, position}),
      );
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
    if (!startWork.started && !startWork.busy && !detail.dueComplete) {
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

  // Labels and members are changed once the card is loaded, by members
  // who may edit the board.
  const editable = canEdit && state.status === 'loaded';
  const shownMembers = cardMembers(detail, members);
  // Comments are written by members the board lets comment.
  const composer: CommentComposerProps | undefined =
    canComment && state.status === 'loaded'
      ? {
          draft: commentDraft.current,
          onChangeDraft: text => {
            commentDraft.current = text;
          },
          onSend: sendComment,
          sending: commentSending,
          controlRef: commentControl,
        }
      : undefined;
  const pickerRows = (kind: PickerKind) => {
    if (kind === 'labels') {
      if (boardLabels.status !== 'loaded') {
        return [];
      }
      return labelChoices(boardLabels.labels, detail.labels ?? []).map(
        label => ({
          id: label.id,
          name: label.name || t('cardDetail.unnamedLabel'),
          selected: (detail.labels ?? []).some(other => other.id === label.id),
          content: <LabelChip large label={label} />,
        }),
      );
    }
    // Members of the card the board did not list are kept, to be removed.
    const choices = membersMeFirst(
      [
        ...members.values(),
        ...shownMembers.filter(member => !members.has(member.id)),
      ],
      memberId,
    );
    const ids = new Set(shownMembers.map(member => member.id));
    return choices.map(member => ({
      id: member.id,
      name: member.fullName,
      selected: ids.has(member.id),
      content: (
        <>
          <MemberAvatar
            initials={member.initials}
            avatarUrl={member.avatarUrl}
            size={PICKER_AVATAR_SIZE}
          />
          <Text style={styles.pickerText} numberOfLines={1}>
            {member.fullName}
          </Text>
        </>
      ),
    }));
  };
  const togglePicked = (kind: PickerKind, id: string) => {
    if (kind === 'labels') {
      const label =
        boardLabels.status === 'loaded'
          ? labelChoices(boardLabels.labels, detail.labels ?? []).find(
              choice => choice.id === id,
            )
          : undefined;
      if (label) {
        toggleLabel(
          label,
          !(detail.labels ?? []).some(other => other.id === id),
        );
      }
      return;
    }
    const shown = shownMembers.find(member => member.id === id);
    const picked = shown ?? members.get(id);
    if (picked) {
      toggleMember(picked, !shown);
    }
  };

  return (
    <View
      ref={rootRef}
      collapsable={false}
      style={styles.root}
      onStartShouldSetResponderCapture={guardComment}>
      <ScreenFrame
        // Where the card is: its board and its list.
        title={`${boardName} / ${shownListName}`}
        onBack={() => {
          if (state.status === 'loaded') {
            onLeave?.(state.card);
          }
          onBack();
        }}
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
          {/* Whether the card is complete; a tap changes it on Trello.
            Without the right to edit, an empty mark would only invite a
            tap that does nothing: only a complete card shows it. */}
          {(canEdit || detail.dueComplete) && (
            <Pressable
              accessibilityRole="checkbox"
              accessibilityLabel={t(
                detail.dueComplete
                  ? 'board.cardIncomplete'
                  : 'board.cardComplete',
              )}
              accessibilityState={{
                checked: detail.dueComplete,
                disabled: !editable || pending.has('complete'),
              }}
              disabled={!editable || pending.has('complete')}
              hitSlop={spacing.sm}
              style={styles.completeToggle}
              onPress={() => toggleComplete(!detail.dueComplete)}>
              <CompleteMark
                size={COMPLETE_MARK_SIZE}
                complete={detail.dueComplete}
              />
            </Pressable>
          )}
          <Text accessibilityRole="header" style={styles.cardName}>
            {detail.name}
          </Text>
          <View style={styles.cardActions}>
            {/* Not offered again once the card is started, unless running,
              nor on a card already done. */}
            {canEdit &&
              (startWork.busy ||
                (!startWork.started && !detail.dueComplete)) && (
                <SmallButton
                  label={t(
                    startWork.busy ? 'startWork.busy' : 'startWork.start',
                  )}
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
        {editFailure && (
          <View accessibilityRole="alert" style={styles.checkFailure}>
            <Text style={[styles.message, styles.checkFailureText]}>
              {t(editFailure)}
            </Text>
            <SmallButton
              label={t('common.ok')}
              accessibilityLabel={t('common.ok')}
              onPress={() => setEditFailure(null)}
            />
          </View>
        )}
        <DetailPages
          // Pages are measured again for new content; ticking an item or
          // changing a label keeps the page shown.
          key={`${state.status}:${version}`}
          card={detail}
          members={shownMembers}
          onToggleCheckItem={editable ? toggleCheckItem : undefined}
          onOpenPicker={editable ? openPicker : undefined}
          onEditDescription={
            editable ? () => setEditingDescription(true) : undefined
          }
          composer={composer}
          pending={pending}
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
      {picker && (
        <FloatingPicker
          title={
            picker.kind === 'members' ? t('card.members') : t('card.labels')
          }
          position={picker.position}
          closeLabel={t('common.close')}
          onClose={() => setPicker(null)}
          emptyMessage={
            picker.kind === 'members'
              ? t('cardDetail.noBoardMembers')
              : boardLabels.status === 'loaded'
              ? t('cardDetail.noBoardLabels')
              : boardLabels.status === 'failed'
              ? t('cardDetail.boardLabelsFailed')
              : t('card.loading')
          }
          rows={pickerRows(picker.kind)}
          onToggle={id => togglePicked(picker.kind, id)}
        />
      )}
      {editingDescription && state.status === 'loaded' && (
        <View style={styles.editorOverlay}>
          <DescriptionEditor
            cardName={detail.name}
            initial={state.card.desc ?? ''}
            onCancel={() => setEditingDescription(false)}
            onSave={saveDescription}
          />
        </View>
      )}
      {leavingComment && (
        <Popup
          title={t('cardDetail.leaveCommentTitle')}
          onClose={keepComment}
          actions={
            <>
              <Button
                label={t('cardDetail.discardComment')}
                onPress={discardComment}
              />
              <Button
                label={t('cardDetail.keepEditingComment')}
                onPress={keepComment}
              />
              <Button
                primary
                label={t('cardDetail.sendComment')}
                onPress={saveComment}
              />
            </>
          }>
          <Text style={styles.paragraph}>
            {t('cardDetail.leaveCommentText')}
          </Text>
        </Popup>
      )}
    </View>
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
 * Page to change the card's description, over the card: the title bar of
 * the tablet's creation dialogs (Cancel, Save), the card's name, then the
 * description as Trello stores it (Markdown), in a field taking the rest of
 * the page. Save is offered once the text changed; if Trello refuses it,
 * the page stays with its text and says so.
 */
function DescriptionEditor({
  cardName,
  initial,
  onCancel,
  onSave,
}: {
  cardName: string;
  initial: string;
  onCancel: () => void;
  /** Resolves `false` when Trello did not take the description. */
  onSave: (text: string) => Promise<boolean>;
}): React.JSX.Element {
  const {t} = useTranslation();
  const [text, setText] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  // Blank lines and spaces left at the end are not kept.
  const cleaned = text.replace(/\s+$/, '');
  const save = async () => {
    setSaving(true);
    setFailed(false);
    // Once saved, the page is closed: nothing is left to update.
    if (!(await onSave(cleaned))) {
      setSaving(false);
      setFailed(true);
    }
  };
  return (
    <ScreenFrame
      title={t('cardDetail.editDescriptionTitle')}
      dialog={{
        cancelLabel: t('common.cancel'),
        onCancel,
        confirmLabel: t(
          saving ? 'cardDetail.savingDescription' : 'cardDetail.saveDescription',
        ),
        onConfirm: save,
        confirmDisabled: saving || cleaned === initial.replace(/\s+$/, ''),
      }}>
      <View style={styles.editor}>
        <Text style={styles.editorCardName} numberOfLines={2}>
          {cardName}
        </Text>
        {failed && (
          <Text accessibilityRole="alert" style={styles.message}>
            {t('cardDetail.descriptionFailed')}
          </Text>
        )}
        <TextInput
          accessibilityLabel={t('cardDetail.description')}
          autoFocus
          multiline
          editable={!saving}
          onChangeText={setText}
          placeholder={t('cardDetail.descriptionPlaceholder')}
          placeholderTextColor={colors.labelBorder}
          style={styles.editorInput}
          textAlignVertical="top"
          value={text}
        />
      </View>
    </ScreenFrame>
  );
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
  /**
   * Opens the list of labels or members under `anchor`; unset, labels and
   * members can't be tapped.
   */
  onOpenPicker?: (kind: PickerKind, anchor: View) => void;
  /**
   * Opens the description's page; unset, the Description heading has no
   * Edit button.
   */
  onEditDescription?: () => void;
  /** Changes on their way to Trello (`item:<id>`, `label:<id>`…). */
  pending: ReadonlySet<string>;
  /** Field to write a comment; unset, comments are only read. */
  composer?: CommentComposerProps;
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
  onOpenPicker,
  onEditDescription,
  pending,
  composer,
}: DetailPagesProps): React.JSX.Element {
  const {t} = useTranslation();
  const canComment = !!composer;
  const blocks = useMemo(
    () => buildDetailBlocks(card, {canComment}),
    [card, canComment],
  );
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

  // The measured copy of the comment field is not the one the page acts on.
  const measuredComposer = composer && {...composer, controlRef: undefined};
  const renderBlock = (block: DetailBlock, measured = false) => (
    <Block
      block={block}
      card={card}
      members={members}
      footer={footer}
      onToggleCheckItem={onToggleCheckItem}
      onOpenPicker={onOpenPicker}
      onEditDescription={onEditDescription}
      pending={pending}
      composer={measured ? measuredComposer : composer}
    />
  );

  return (
    <View style={styles.container} {...swipeHandlers}>
      <View
        style={styles.area}
        onLayout={event => {
          const {height} = event.nativeEvent.layout;
          // The keyboard of the comment field may shrink the page: laying
          // the pages out again would take the field away while typing.
          if (TextInput.State.currentlyFocusedInput() && height < areaHeight) {
            return;
          }
          setAreaHeight(current => (current === height ? current : height));
        }}>
        <View style={styles.measureLayer} pointerEvents="none">
          {blocks.map(block => (
            <View key={block.key} onLayout={event => measure(block.key, event)}>
              {renderBlock(block, true)}
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
  onOpenPicker?: (kind: PickerKind, anchor: View) => void;
  onEditDescription?: () => void;
  pending: ReadonlySet<string>;
  composer?: CommentComposerProps;
}

function Block({
  block,
  card,
  members,
  footer,
  onToggleCheckItem,
  onOpenPicker,
  onEditDescription,
  pending,
  composer,
}: BlockProps): React.JSX.Element | null {
  const {t, locale} = useTranslation();
  switch (block.kind) {
    case 'summary':
      return (
        <Summary
          card={card}
          members={members}
          footer={footer}
          onOpenPicker={onOpenPicker}
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
          {block.section === 'description' && onEditDescription && (
            // Kept within the band's own height.
            <View style={styles.headingButton}>
              <SmallButton
                label={t('cardDetail.editDescription')}
                accessibilityLabel={t('cardDetail.editDescriptionHint')}
                onPress={onEditDescription}
              />
            </View>
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
      const busy = pending.has(`item:${block.itemId}`);
      return (
        <Pressable
          style={styles.checkItem}
          accessibilityRole="checkbox"
          accessibilityState={{checked: block.complete, busy}}
          accessibilityLabel={block.name}
          disabled={busy}
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
    case 'commentComposer':
      return composer ? <CommentComposer {...composer} /> : null;
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
  onOpenPicker,
}: Pick<
  BlockProps,
  'card' | 'members' | 'footer' | 'onOpenPicker'
>): React.JSX.Element {
  const {t, locale} = useTranslation();
  const labels = card.labels ?? [];
  return (
    <View style={styles.summary}>
      {(labels.length > 0 || members.length > 0 || !!onOpenPicker) && (
        <LabelsAndMembers
          labels={labels}
          members={members}
          onOpenPicker={onOpenPicker}
        />
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
 *
 * Where the card can be changed, a tap on the labels or on the members
 * opens the list of them under it; a card without labels shows a dashed
 * tag in their place, one without members a dashed head, which open it
 * too.
 */
function LabelsAndMembers({
  labels,
  members,
  onOpenPicker,
}: {
  labels: NonNullable<TrelloCardDetail['labels']>;
  members: readonly TrelloBoardMember[];
  onOpenPicker?: (kind: PickerKind, anchor: View) => void;
}): React.JSX.Element {
  const {t} = useTranslation();
  const [rowWidth, setRowWidth] = useState(0);
  const [namesWidth, setNamesWidth] = useState(0);
  const labelsRef = useRef<View>(null);
  const membersRef = useRef<View>(null);
  const memberIds = members.map(member => member.id).join(',');
  // Measured again whenever the members change.
  useEffect(() => setNamesWidth(0), [memberIds]);
  const labelsShown = labels.length > 0 || !!onOpenPicker;
  const room = labelsShown ? rowWidth / 2 : rowWidth;
  const compact = rowWidth > 0 && namesWidth > room;
  const open = (kind: PickerKind, anchor: React.RefObject<View | null>) => {
    if (onOpenPicker && anchor.current) {
      onOpenPicker(kind, anchor.current);
    }
  };
  return (
    <View
      style={styles.labelsAndMembers}
      onLayout={event => {
        const {width} = event.nativeEvent.layout;
        setRowWidth(current => (current === width ? current : width));
      }}>
      <Tappable
        anchorRef={labelsRef}
        accessibilityLabel={
          onOpenPicker && labels.length > 0
            ? t('cardDetail.editLabels')
            : undefined
        }
        onPress={
          onOpenPicker && labels.length > 0
            ? () => open('labels', labelsRef)
            : undefined
        }
        style={styles.labels}>
        {labels.map(label => (
          <LabelChip key={label.id} label={label} />
        ))}
        {onOpenPicker && labels.length === 0 && (
          <DashedIconButton
            icon="labels"
            accessibilityLabel={t('cardDetail.addLabel')}
            onPress={() => open('labels', labelsRef)}
          />
        )}
      </Tappable>
      {members.length === 0 ? (
        onOpenPicker && (
          <Tappable anchorRef={membersRef}>
            <DashedIconButton
              icon="members"
              accessibilityLabel={t('cardDetail.addMember')}
              onPress={() => open('members', membersRef)}
            />
          </Tappable>
        )
      ) : compact ? (
        <Tappable
          anchorRef={membersRef}
          accessibilityLabel={
            onOpenPicker ? t('cardDetail.editMembers') : undefined
          }
          onPress={onOpenPicker ? () => open('members', membersRef) : undefined}
          style={[
            styles.membersCompact,
            labelsShown && styles.membersBesideLabels,
          ]}>
          {members.map(member => (
            <View
              key={member.id}
              accessible={!onOpenPicker}
              accessibilityLabel={member.fullName}>
              <MemberAvatar
                initials={member.initials}
                avatarUrl={member.avatarUrl}
                size={AVATAR_SIZE}
              />
            </View>
          ))}
        </Tappable>
      ) : (
        <Tappable
          anchorRef={membersRef}
          accessibilityLabel={
            onOpenPicker ? t('cardDetail.editMembers') : undefined
          }
          onPress={onOpenPicker ? () => open('members', membersRef) : undefined}
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
        </Tappable>
      )}
    </View>
  );
}

/**
 * A view the floating list opens under: pressable when `onPress` is set,
 * a plain view otherwise.
 */
function Tappable({
  anchorRef,
  onPress,
  accessibilityLabel,
  style,
  onLayout,
  children,
}: {
  anchorRef: React.RefObject<View | null>;
  onPress?: () => void;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  onLayout?: (event: LayoutChangeEvent) => void;
  children: React.ReactNode;
}): React.JSX.Element {
  if (!onPress) {
    return (
      <View
        ref={anchorRef}
        collapsable={false}
        style={style}
        onLayout={onLayout}>
        {children}
      </View>
    );
  }
  return (
    <Pressable
      ref={anchorRef}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={style}
      onLayout={onLayout}>
      {children}
    </Pressable>
  );
}

/**
 * Dashed pill holding a tag or a head and a "+", standing for labels or
 * members the card does not have yet; inverted while pressed.
 */
function DashedIconButton({
  icon,
  accessibilityLabel,
  onPress,
}: {
  icon: BlockIconKind;
  accessibilityLabel: string;
  onPress: () => void;
}): React.JSX.Element {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={spacing.xs}
      onPress={onPress}
      style={({pressed}) => [
        styles.dashedButton,
        pressed && styles.dashedButtonPressed,
      ]}>
      {({pressed}) => {
        const color = pressed ? colors.background : colors.foreground;
        return (
          <>
            <BlockIcon kind={icon} size={DASHED_ICON_SIZE} color={color} />
            <Text style={[styles.dashedButtonText, {color}]}>+</Text>
          </>
        );
      }}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  container: {
    flex: 1,
  },
  pickerText: {
    flexShrink: 1,
    color: colors.foreground,
    fontSize: typography.body,
  },
  dashedButton: {
    height: AVATAR_SIZE,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    borderColor: colors.foreground,
    borderRadius: AVATAR_SIZE / 2,
    borderStyle: 'dashed',
    borderWidth: borders.width,
    backgroundColor: colors.background,
  },
  dashedButtonPressed: {
    backgroundColor: colors.foreground,
  },
  dashedButtonText: {
    fontSize: typography.label,
    fontWeight: '700',
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
  // As far from the name as from the band's edge.
  completeToggle: {
    marginRight: CONTENT_PADDING - spacing.sm,
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
  headingButton: {
    marginVertical: -spacing.xs,
  },
  editorOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.background,
  },
  editor: {
    flex: 1,
    gap: spacing.md,
  },
  editorCardName: {
    color: colors.foreground,
    fontSize: typography.heading,
    fontWeight: '700',
  },
  editorInput: {
    flex: 1,
    color: colors.foreground,
    fontSize: typography.body,
    lineHeight: 30,
    borderColor: colors.foreground,
    borderWidth: borders.width,
    borderRadius: borders.radius,
    padding: spacing.md,
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
