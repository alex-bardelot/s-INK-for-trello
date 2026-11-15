import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';

import {useTranslation} from '../i18n';
import {borders, colors, spacing, typography} from '../theme';

export interface StepperProps {
  label: string;
  /** Smaller text shown under the label. */
  help?: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}

/**
 * Settings row with a number at its end, between a round − and a round +
 * that take one off or add one, within `min` and `max`. A button that
 * cannot be used is dashed.
 */
export function Stepper({
  label,
  help,
  value,
  min,
  max,
  onChange,
}: StepperProps): React.JSX.Element {
  const {t} = useTranslation();
  return (
    <View style={styles.row}>
      <View style={styles.texts}>
        <Text style={styles.label}>{label}</Text>
        {help && <Text style={styles.help}>{help}</Text>}
      </View>
      <View style={styles.controls}>
        <StepButton
          sign="−"
          accessibilityLabel={t('common.decrease', {name: label})}
          disabled={value <= min}
          onPress={() => onChange(Math.max(min, value - 1))}
        />
        <Text
          accessibilityLabel={`${label}: ${value}`}
          accessibilityLiveRegion="polite"
          style={styles.value}>
          {value}
        </Text>
        <StepButton
          sign="+"
          accessibilityLabel={t('common.increase', {name: label})}
          disabled={value >= max}
          onPress={() => onChange(Math.min(max, value + 1))}
        />
      </View>
    </View>
  );
}

function StepButton({
  sign,
  accessibilityLabel,
  disabled,
  onPress,
}: {
  sign: '−' | '+';
  accessibilityLabel: string;
  disabled: boolean;
  onPress: () => void;
}): React.JSX.Element {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{disabled}}
      disabled={disabled}
      hitSlop={spacing.sm}
      onPress={onPress}
      style={({pressed}) => [
        styles.button,
        disabled && styles.disabled,
        pressed && styles.pressed,
      ]}>
      {({pressed}) => (
        <Text style={[styles.sign, pressed && styles.pressedSign]}>{sign}</Text>
      )}
    </Pressable>
  );
}

const BUTTON_SIZE = 44;

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
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  button: {
    width: BUTTON_SIZE,
    height: BUTTON_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    borderColor: colors.foreground,
    borderWidth: borders.width,
    borderRadius: BUTTON_SIZE / 2,
    backgroundColor: colors.background,
  },
  disabled: {
    borderStyle: 'dashed',
    borderColor: colors.labelBorder,
  },
  pressed: {
    backgroundColor: colors.foreground,
  },
  sign: {
    color: colors.foreground,
    fontSize: typography.heading,
    fontWeight: '700',
    lineHeight: typography.heading + 2,
  },
  pressedSign: {
    color: colors.background,
  },
  value: {
    minWidth: BUTTON_SIZE,
    color: colors.foreground,
    fontSize: typography.heading,
    fontWeight: '700',
    textAlign: 'center',
  },
});
