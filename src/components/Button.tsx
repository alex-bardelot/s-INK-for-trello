import React from 'react';
import {Pressable, StyleSheet, Text} from 'react-native';

import {borders, colors, spacing, typography} from '../theme';

export interface ButtonProps {
  label: string;
  onPress: () => void;
  /** Filled (black) style for the main action of a screen. */
  primary?: boolean;
  disabled?: boolean;
}

/**
 * E-ink friendly button: solid black or outlined, no animation, and an
 * inverted look while pressed instead of a fade.
 */
export function Button({
  label,
  onPress,
  primary = false,
  disabled = false,
}: ButtonProps): React.JSX.Element {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{disabled}}
      disabled={disabled}
      onPress={onPress}
      style={({pressed}) => [
        styles.base,
        primary !== pressed && styles.filled,
        disabled && styles.disabled,
      ]}>
      {({pressed}) => (
        <Text style={[styles.label, primary !== pressed && styles.filledLabel]}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignSelf: 'flex-start',
    borderColor: colors.foreground,
    borderRadius: borders.radius,
    borderWidth: borders.width,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    backgroundColor: colors.background,
  },
  filled: {
    backgroundColor: colors.foreground,
  },
  disabled: {
    borderStyle: 'dashed',
  },
  label: {
    color: colors.foreground,
    fontSize: typography.label,
    fontWeight: '600',
  },
  filledLabel: {
    color: colors.background,
  },
});
