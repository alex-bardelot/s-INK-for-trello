import React, {useState} from 'react';
import {StyleSheet, TextInput, View} from 'react-native';

import {useTranslation} from '../i18n';
import {COMMENT_MAX_LENGTH} from '../trello/TrelloClient';
import {borders, colors, spacing, typography} from '../theme';
import {SmallButton} from './SmallButton';

/** Lines of text the field shows; longer comments scroll inside it. */
const VISIBLE_LINES = 2;
const LINE_HEIGHT = Math.round(typography.body * 1.35);

export interface CommentComposerProps {
  /** Text being written, kept by the page while this field comes and goes. */
  draft: string;
  onChangeDraft: (text: string) => void;
  /** Sends the comment; resolves `true` once Trello stored it. */
  onSend: (text: string) => Promise<boolean>;
  /** A comment is on its way to Trello. */
  sending: boolean;
}

/**
 * Field to write a comment on a card, as at the top of Trello's comments,
 * with the button that sends it. Its height never changes while typing, so
 * that the card's pages, measured once, stay laid out the same.
 */
export function CommentComposer({
  draft,
  onChangeDraft,
  onSend,
  sending,
}: CommentComposerProps): React.JSX.Element {
  const {t} = useTranslation();
  // Typing only redraws the field, not the whole card page.
  const [text, setText] = useState(draft);
  const change = (next: string) => {
    setText(next);
    onChangeDraft(next);
  };
  const empty = text.trim() === '';
  const send = async () => {
    if (empty || sending) {
      return;
    }
    if (await onSend(text.trim())) {
      setText('');
    }
  };
  return (
    <View style={styles.row}>
      <TextInput
        accessibilityLabel={t('cardDetail.writeComment')}
        placeholder={t('cardDetail.writeComment')}
        placeholderTextColor={colors.labelBorder}
        multiline
        maxLength={COMMENT_MAX_LENGTH}
        editable={!sending}
        textAlignVertical="top"
        value={text}
        onChangeText={change}
        style={styles.input}
      />
      <SmallButton
        label={t(sending ? 'cardDetail.sendingComment' : 'cardDetail.sendComment')}
        accessibilityLabel={t('cardDetail.sendCommentHint')}
        disabled={empty || sending}
        onPress={send}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
  },
  input: {
    flex: 1,
    height: LINE_HEIGHT * VISIBLE_LINES + spacing.sm * 2 + borders.width * 2,
    color: colors.foreground,
    backgroundColor: colors.background,
    borderColor: colors.foreground,
    borderRadius: borders.radius,
    borderWidth: borders.width,
    fontSize: typography.body,
    lineHeight: LINE_HEIGHT,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
});
