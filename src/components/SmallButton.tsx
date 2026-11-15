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
  /** Icon before the label, drawn in the label's color. */
  icon?: React.ComponentType<{size: number; color: string}>;
}

/** Size of the icon before a small button's label. */
export const SMALL_BUTTON_ICON_SIZE = 22;

/** Compact outlined button, used for page controls and title bar actions. */
export function SmallButton({
  label,
  accessibilityLabel,
  onPress,
  disabled = false,
  active = false,
  icon: Icon,
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
        <>
          {Icon && (
            <Icon
              size={SMALL_BUTTON_ICON_SIZE}
              color={pressed || active ? colors.background : colors.foreground}
            />
          )}
          <Text
            style={[styles.label, (pressed || active) && styles.pressedLabel]}>
            {label}
          </Text>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
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
