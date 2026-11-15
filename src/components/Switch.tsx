import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';

import {useTranslation} from '../i18n';
import {borders, colors, spacing, typography} from '../theme';

export interface SwitchProps {
  label: string;
  /** Smaller text shown under the label. */
  help?: string;
  value: boolean;
  onChange: (value: boolean) => void;
  /** Shown between the texts and the switch, such as a preview. */
  accessory?: React.ReactNode;
}

/**
 * Settings row with an on/off switch at its end: "ON" or "OFF", then a
 * pill-shaped track, filled black when on, with its knob at the matching
 * end, like the Supernote system settings. The whole row is pressable and
 * nothing is animated, for E Ink.
 */
export function Switch({
  label,
  help,
  value,
  onChange,
  accessory,
}: SwitchProps): React.JSX.Element {
  const {t} = useTranslation();
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{checked: value}}
      accessibilityLabel={label}
      onPress={() => onChange(!value)}
      style={styles.row}>
      <View style={styles.texts}>
        <Text style={styles.label}>{label}</Text>
        {help && <Text style={styles.help}>{help}</Text>}
      </View>
      {accessory}
      {/* ON / OFF before the track, like the Supernote system settings. */}
      <Text style={styles.state}>{t(value ? 'common.on' : 'common.off')}</Text>
      <View style={[styles.track, value && styles.trackOn]}>
        <View style={[styles.knob, value && styles.knobOn]} />
      </View>
    </Pressable>
  );
}

const TRACK_WIDTH = 72;
const TRACK_HEIGHT = 40;
const KNOB_SIZE = 28;

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  texts: {
    flex: 1,
    gap: spacing.xs,
  },
  label: {
    color: colors.foreground,
    fontSize: typography.label,
    fontWeight: '600',
  },
  help: {
    color: colors.foreground,
    fontSize: typography.small,
  },
  state: {
    color: colors.foreground,
    fontSize: typography.small,
  },
  track: {
    width: TRACK_WIDTH,
    height: TRACK_HEIGHT,
    borderRadius: TRACK_HEIGHT / 2,
    borderColor: colors.foreground,
    borderWidth: borders.width,
    backgroundColor: colors.background,
    justifyContent: 'center',
    paddingHorizontal: (TRACK_HEIGHT - borders.width * 2 - KNOB_SIZE) / 2,
  },
  trackOn: {
    backgroundColor: colors.foreground,
  },
  knob: {
    width: KNOB_SIZE,
    height: KNOB_SIZE,
    borderRadius: KNOB_SIZE / 2,
    backgroundColor: colors.foreground,
  },
  knobOn: {
    alignSelf: 'flex-end',
    backgroundColor: colors.background,
  },
});
