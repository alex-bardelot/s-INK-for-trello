import React, {useEffect, useImperativeHandle, useRef, useState} from 'react';
import {StyleSheet, TextInput, View} from 'react-native';

import {useTranslation} from '../i18n';
import {COMMENT_MAX_LENGTH} from '../trello/TrelloClient';
import {borders, colors, spacing, typography} from '../theme';
import {SmallButton} from './SmallButton';

/** Lines of text the open field shows; longer comments scroll inside it. */
const VISIBLE_LINES = 4;
const LINE_HEIGHT = Math.round(typography.body * 1.35);
const OPEN_HEIGHT =
  LINE_HEIGHT * VISIBLE_LINES + spacing.sm * 2 + borders.width * 2;
/** Height of the closed field until the Save button has been measured. */
const CLOSED_HEIGHT_GUESS = 40;

export interface CommentComposerProps {
  /** Text being written, kept by the page while this field comes and goes. */
  draft: string;
  onChangeDraft: (text: string) => void;
  /** Sends the comment; resolves `true` once Trello stored it. */
  onSend: (text: string) => Promise<boolean>;
  /** A comment is on its way to Trello. */
  sending: boolean;
  /**
   * Lets the page tell a tap on the field from a tap beside it, and act on
   * the field. Only for the field shown, not for its measured copy.
   */
  controlRef?: React.Ref<CommentComposerControl>;
}

/** What the page can ask of the comment field shown. */
export interface CommentComposerControl {
  /** Whether a touch at these page coordinates falls on the field or Save. */
  contains: (pageX: number, pageY: number) => boolean;
  /** Puts the cursor back in the field, to go on writing. */
  focus: () => void;
  /** Empties the field: the comment being written is dropped. */
  discard: () => void;
  /** Saves the comment on Trello, as the Save button does. */
  send: () => void;
}

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Whether a point falls in a rectangle, edges included. */
export function rectContains(rect: Rect | null, x: number, y: number): boolean {
  return (
    !!rect &&
    x >= rect.x &&
    x <= rect.x + rect.width &&
    y >= rect.y &&
    y <= rect.y + rect.height
  );
}

/**
 * Field to write a comment on a card, as at the top of Trello's comments.
 * Closed, it is one line as high as a Save button, across the whole width.
 * A tap opens it: it grows to a few lines, with the Save button beside it
 * at the top. It stays open while it holds text.
 *
 * The card's pages are laid out once, from a copy of this field that is
 * never touched, so they keep the closed height: the open field may push
 * what follows it on its page past the bottom until it closes again.
 */
export function CommentComposer({
  draft,
  onChangeDraft,
  onSend,
  sending,
  controlRef,
}: CommentComposerProps): React.JSX.Element {
  const {t} = useTranslation();
  // Typing only redraws the field, not the whole card page.
  const [text, setText] = useState(draft);
  const [focused, setFocused] = useState(false);
  // The closed field is exactly as high as the Save button, measured.
  const [buttonHeight, setButtonHeight] = useState(CLOSED_HEIGHT_GUESS);
  const change = (next: string) => {
    setText(next);
    onChangeDraft(next);
  };
  const empty = text.trim() === '';
  const open = focused || !empty || sending;
  const send = async () => {
    if (empty || sending) {
      return;
    }
    if (await onSend(text.trim())) {
      setText('');
    }
  };

  // Where the field and its button are on the page, read again after each
  // drawing: what is above it (a failure line) may move it without its own
  // layout changing. Touches are checked against it as they start.
  const rowRef = useRef<View>(null);
  const inputRef = useRef<TextInput>(null);
  const rect = useRef<Rect | null>(null);
  const remeasure = () =>
    rowRef.current?.measure((_x, _y, width, height, pageX, pageY) => {
      rect.current = {x: pageX, y: pageY, width, height};
    });
  useEffect(() => {
    if (controlRef) {
      remeasure();
    }
  });
  useImperativeHandle(controlRef, () => ({
    contains: (pageX, pageY) => rectContains(rect.current, pageX, pageY),
    focus: () => inputRef.current?.focus(),
    discard: () => {
      inputRef.current?.blur();
      change('');
    },
    send,
  }));
  const saveButton = (
    <SmallButton
      label={t(
        sending ? 'cardDetail.sendingComment' : 'cardDetail.sendComment',
      )}
      accessibilityLabel={t('cardDetail.sendCommentHint')}
      disabled={empty || sending}
      onPress={send}
    />
  );
  return (
    <View
      ref={rowRef}
      collapsable={false}
      style={styles.row}
      onLayout={controlRef ? remeasure : undefined}>
      <TextInput
        ref={inputRef}
        accessibilityLabel={t('cardDetail.writeComment')}
        placeholder={t('cardDetail.writeComment')}
        placeholderTextColor={colors.labelBorder}
        multiline
        maxLength={COMMENT_MAX_LENGTH}
        editable={!sending}
        textAlignVertical={open ? 'top' : 'center'}
        value={text}
        onChangeText={change}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={[
          styles.input,
          open
            ? styles.inputOpen
            : [styles.inputClosed, {height: buttonHeight}],
        ]}
      />
      {open ? (
        saveButton
      ) : (
        // Not shown, only measured, so that the closed field matches it.
        <View
          style={styles.measuredButton}
          pointerEvents="none"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          onLayout={event => {
            const height = Math.ceil(event.nativeEvent.layout.height);
            setButtonHeight(current => (current === height ? current : height));
          }}>
          {saveButton}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    // Save stands at the top of the open field.
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  input: {
    flex: 1,
    color: colors.foreground,
    backgroundColor: colors.background,
    borderColor: colors.foreground,
    borderRadius: borders.radius,
    borderWidth: borders.width,
    fontSize: typography.body,
    lineHeight: LINE_HEIGHT,
    paddingHorizontal: spacing.md,
  },
  inputOpen: {
    height: OPEN_HEIGHT,
    paddingVertical: spacing.sm,
  },
  inputClosed: {
    paddingVertical: 0,
  },
  measuredButton: {
    position: 'absolute',
    opacity: 0,
  },
});
