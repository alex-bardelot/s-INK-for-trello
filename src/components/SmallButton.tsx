import React from 'react';
import {Pressable, StyleSheet, Text} from 'react-native';

import {borders, colors, spacing, typography} from '../theme';

export interface SmallButtonProps {
  label: string;
  accessibilityLabel: string;
  onPress: () => void;
  disabled?: boolean;
  /** Shown inverted, for a switch that is on. */
  active?: boolean;
}

/** Compact outlined button, used for page controls and title bar actions. */
export function SmallButton({
  label,
  accessibilityLabel,
  onPress,
  disabled = false,
  active = false,
}: SmallButtonProps): React.JSX.Element {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{disabled, selected: active}}
      disabled={disabled}
      hitSlop={spacing.sm}
      onPress={onPress}
      style={({pressed}) => [
        styles.button,
        disabled && styles.disabled,
        (pressed || active) && styles.pressed,
      ]}>
      {({pressed}) => (
        <Text
          style={[styles.label, (pressed || active) && styles.pressedLabel]}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    borderColor: colors.foreground,
    borderWidth: borders.width,
    borderRadius: borders.radius,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    backgroundColor: colors.background,
  },
  disabled: {
    borderStyle: 'dashed',
  },
  pressed: {
    backgroundColor: colors.foreground,
  },
  label: {
    color: colors.foreground,
    fontSize: typography.label,
    fontWeight: '600',
  },
  pressedLabel: {
    color: colors.background,
  },
});
