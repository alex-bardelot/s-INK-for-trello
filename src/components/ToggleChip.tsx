import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';

import {borders, colors, spacing, typography} from '../theme';

export interface ToggleChipProps {
  /** Added: solid frame with a ×. Otherwise dashed frame with a +. */
  selected: boolean;
  onPress: () => void;
  accessibilityLabel: string;
  children: React.ReactNode;
}

/**
 * A choice that can be added or removed, such as a label or a member of a
 * new card: solid with a × once added, dashed with a + while available.
 */
export function ToggleChip({
  selected,
  onPress,
  accessibilityLabel,
  children,
}: ToggleChipProps): React.JSX.Element {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{selected}}
      hitSlop={spacing.xs}
      onPress={onPress}
      style={({pressed}) => [
        styles.chip,
        selected ? styles.selected : styles.available,
        pressed && styles.pressed,
      ]}>
      <View style={styles.content}>{children}</View>
      <Text style={styles.sign}>{selected ? '×' : '+'}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    maxWidth: '100%',
    borderColor: colors.foreground,
    borderRadius: 999,
    paddingLeft: spacing.sm,
    paddingRight: spacing.md,
    paddingVertical: spacing.xs,
    backgroundColor: colors.background,
  },
  selected: {
    borderWidth: borders.width * 1.5,
  },
  available: {
    borderStyle: 'dashed',
    borderWidth: borders.width,
  },
  pressed: {
    backgroundColor: colors.avatar,
  },
  content: {
    flexShrink: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  sign: {
    color: colors.foreground,
    fontSize: typography.label,
    fontWeight: '700',
  },
});
