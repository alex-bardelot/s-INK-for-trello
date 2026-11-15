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

/**
 * Height of every chip, added or not, and of the "+" button next to them:
 * adding or removing one must not move the others.
 */
export const CHIP_HEIGHT = 44;
/** Same frame thickness whether solid or dashed, for the same reason. */
export const CHIP_BORDER_WIDTH = borders.width * 1.5;
/** Width kept for the + or ×, which are not equally wide. */
const SIGN_WIDTH = 18;

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    maxWidth: '100%',
    height: CHIP_HEIGHT,
    borderColor: colors.foreground,
    borderRadius: 999,
    borderWidth: CHIP_BORDER_WIDTH,
    paddingLeft: spacing.sm,
    paddingRight: spacing.md,
    backgroundColor: colors.background,
  },
  selected: {
    borderStyle: 'solid',
  },
  available: {
    borderStyle: 'dashed',
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
    width: SIGN_WIDTH,
    textAlign: 'center',
    color: colors.foreground,
    fontSize: typography.label,
    fontWeight: '700',
  },
});
