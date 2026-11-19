import React from 'react';
import {StyleSheet, Text, View} from 'react-native';

import {labelShade} from '../board/labels';
import {TrelloLabel} from '../trello/types';
import {colors, spacing, typography} from '../theme';

/**
 * A Trello label, in the grey shade standing for its color. Unnamed labels
 * are drawn as a short bar, as on Trello.
 */
export function LabelChip({
  label,
  large = false,
  height,
}: {
  label: Pick<TrelloLabel, 'name' | 'color'>;
  /** Drawn at the size of body text, beside it in a sentence. */
  large?: boolean;
  /**
   * Fixed height, named or not, to line up with buttons of that height;
   * drawn at the large size.
   */
  height?: number;
}): React.JSX.Element {
  const shade = labelShade(label.color);
  const big = large || height !== undefined;
  return (
    <View
      style={[
        styles.label,
        big && styles.large,
        !label.name && styles.unnamed,
        height !== undefined && {minHeight: height, height},
        height !== undefined && !label.name && styles.unnamedTall,
        {backgroundColor: shade.background},
      ]}>
      {!!label.name && (
        <Text
          style={[styles.text, big && styles.largeText, {color: shade.text}]}
          numberOfLines={1}>
          {label.name}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    minHeight: 26,
    maxWidth: '100%',
    justifyContent: 'center',
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: colors.labelBorder,
    paddingHorizontal: spacing.sm,
  },
  large: {
    minHeight: 36,
    paddingHorizontal: spacing.md,
  },
  largeText: {
    fontSize: typography.body,
  },
  unnamed: {
    minHeight: 12,
    width: 48,
  },
  // A tall unnamed label stays wider than it is high.
  unnamedTall: {
    width: 72,
  },
  text: {
    fontSize: 16,
    fontWeight: '700',
  },
});
