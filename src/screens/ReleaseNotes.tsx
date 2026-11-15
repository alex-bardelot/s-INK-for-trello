import React from 'react';
import {ScrollView, StyleSheet, Text, View} from 'react-native';

import releaseNotesText from '../../RELEASE_NOTES.md';
import {ScreenFrame} from '../components/ScreenFrame';
import {useTranslation} from '../i18n';
import {
  parseInline,
  parseReleaseNotes,
  ReleaseNote,
} from '../settings/releaseNotes';
import {borders, colors, spacing, typography} from '../theme';

/** The bundled RELEASE_NOTES.md, newest first. */
export const RELEASE_NOTES: readonly ReleaseNote[] =
  parseReleaseNotes(releaseNotesText);

/** One release: its version and title, then its bullets. */
export function ReleaseNoteView({
  note,
}: {
  note: ReleaseNote;
}): React.JSX.Element {
  return (
    <View style={styles.note}>
      <Text accessibilityRole="header" style={styles.heading}>
        {note.version} — {note.title}
      </Text>
      {note.items.map((item, index) => (
        <View
          key={index}
          style={[styles.item, {marginLeft: item.level * spacing.lg}]}>
          <View style={styles.bullet} />
          <Text style={styles.text}>
            {parseInline(item.text).map((segment, part) => (
              <Text
                key={part}
                style={[
                  segment.bold && styles.bold,
                  segment.code && styles.code,
                ]}>
                {segment.text}
              </Text>
            ))}
          </Text>
        </View>
      ))}
    </View>
  );
}

/** Every release, opened from Settings > About. */
export function ReleaseNotesScreen({
  onBack,
}: {
  onBack: () => void;
}): React.JSX.Element {
  const {t} = useTranslation();
  return (
    <ScreenFrame title={t('settings.releaseNotes')} onBack={onBack} flush>
      <ScrollView contentContainerStyle={styles.list}>
        {RELEASE_NOTES.map((note, index) => (
          <View
            key={`${note.version}-${index}`}
            style={index > 0 && styles.separated}>
            <ReleaseNoteView note={note} />
          </View>
        ))}
      </ScrollView>
    </ScreenFrame>
  );
}

const BULLET_SIZE = 8;

const styles = StyleSheet.create({
  list: {
    padding: spacing.lg,
    gap: spacing.lg,
  },
  separated: {
    borderTopColor: colors.foreground,
    borderTopWidth: borders.width / 2,
    paddingTop: spacing.lg,
  },
  note: {
    gap: spacing.sm,
  },
  heading: {
    color: colors.foreground,
    fontSize: typography.label,
    fontWeight: '700',
  },
  item: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  bullet: {
    width: BULLET_SIZE,
    height: BULLET_SIZE,
    borderRadius: BULLET_SIZE / 2,
    backgroundColor: colors.foreground,
    // Centered on the first line of the text.
    marginTop: (typography.body * 1.3 - BULLET_SIZE) / 2,
  },
  text: {
    flex: 1,
    color: colors.foreground,
    fontSize: typography.body,
  },
  bold: {
    fontWeight: '700',
  },
  code: {
    fontFamily: 'monospace',
  },
});
