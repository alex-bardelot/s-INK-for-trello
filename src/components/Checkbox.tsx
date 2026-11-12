import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';

import {borders, colors, spacing, typography} from '../theme';

export interface CheckboxProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

/** E-ink friendly checkbox: a square box filled when checked, no animation. */
export function Checkbox({
  label,
  checked,
  onChange,
  disabled = false,
}: CheckboxProps): React.JSX.Element {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{checked, disabled}}
      disabled={disabled}
      onPress={() => onChange(!checked)}
      style={styles.row}>
      <View style={[styles.box, checked && styles.checked]}>
        {checked && <Text style={styles.mark}>✓</Text>}
      </View>
      <Text style={styles.label}>{label}</Text>
    </Pressable>
  );
}

const BOX_SIZE = 36;

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  box: {
    width: BOX_SIZE,
    height: BOX_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    borderColor: colors.foreground,
    borderWidth: borders.width,
    backgroundColor: colors.background,
  },
  checked: {
    backgroundColor: colors.foreground,
  },
  mark: {
    color: colors.background,
    fontSize: typography.label,
    fontWeight: '700',
  },
  label: {
    flex: 1,
    color: colors.foreground,
    fontSize: typography.label,
    fontWeight: '600',
  },
});
