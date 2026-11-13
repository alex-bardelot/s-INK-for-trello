import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';

import {borders, colors, spacing, typography} from '../theme';

export interface Segment<T extends string | number> {
  value: T;
  label: string;
}

export interface SegmentedControlProps<T extends string | number> {
  label: string;
  /** Smaller text shown under the label. */
  help?: string;
  segments: readonly Segment<T>[];
  value: T;
  onChange: (value: T) => void;
}

/**
 * Settings row with a choice of a few options at its end, drawn as joined
 * segments inside one rounded outline, the chosen one filled black.
 */
export function SegmentedControl<T extends string | number>({
  label,
  help,
  segments,
  value,
  onChange,
}: SegmentedControlProps<T>): React.JSX.Element {
  return (
    <View style={styles.row}>
      <View style={styles.texts}>
        <Text style={styles.label}>{label}</Text>
        {help && <Text style={styles.help}>{help}</Text>}
      </View>
      <View accessibilityRole="radiogroup" style={styles.group}>
        {segments.map((segment, index) => {
          const selected = segment.value === value;
          return (
            <Pressable
              key={String(segment.value)}
              accessibilityRole="radio"
              accessibilityState={{selected}}
              accessibilityLabel={`${label}: ${segment.label}`}
              onPress={() => onChange(segment.value)}
              style={[
                styles.segment,
                index > 0 && styles.divided,
                selected && styles.selected,
              ]}>
              <Text style={[styles.text, selected && styles.selectedText]}>
                {segment.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const RADIUS = 20;

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  texts: {
    flex: 1,
    minWidth: 200,
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
  group: {
    flexDirection: 'row',
    borderColor: colors.foreground,
    borderWidth: borders.width,
    borderRadius: RADIUS,
    overflow: 'hidden',
  },
  segment: {
    minWidth: 64,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    backgroundColor: colors.background,
  },
  divided: {
    borderLeftColor: colors.foreground,
    borderLeftWidth: borders.width,
  },
  selected: {
    backgroundColor: colors.foreground,
  },
  text: {
    color: colors.foreground,
    fontSize: typography.body,
    fontWeight: '600',
  },
  selectedText: {
    color: colors.background,
  },
});
