import React from 'react';
import {StyleSheet, Text, View} from 'react-native';

import {colors} from '../theme';
import {ActionIconProps} from './ActionIcons';
import {iconStroke} from './iconStroke';

/**
 * Whether a card is complete, as Trello draws it before the card's name: a
 * filled round with a check when it is, an empty ring when it is not.
 * `color` is the ink, `background` the check's color inside the round.
 */
export function CompleteMark({
  size,
  complete,
  color = colors.foreground,
  background = colors.background,
}: {
  size: number;
  complete: boolean;
  color?: string;
  background?: string;
}): React.JSX.Element {
  const stroke = Math.max(2, Math.round(iconStroke(size) * 0.8));
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        styles.round,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: stroke,
          borderColor: color,
        },
        complete && {backgroundColor: color},
      ]}>
      {complete && (
        <Text
          allowFontScaling={false}
          style={[
            styles.check,
            {
              color: background,
              fontSize: Math.round(size * 0.62),
              lineHeight: Math.round(size * 0.8),
            },
          ]}>
          ✓
        </Text>
      )}
    </View>
  );
}

/** Menu sign of "Mark complete": the round, checked. */
export function MarkCompleteIcon({
  size,
  color,
}: ActionIconProps): React.JSX.Element {
  return (
    <View style={[styles.round, {width: size, height: size}]}>
      <CompleteMark
        size={Math.round(size * 0.86)}
        complete
        color={color}
        // Pressed menu rows are inverted: the check takes the row's color.
        background={
          color === colors.foreground ? colors.background : colors.foreground
        }
      />
    </View>
  );
}

/** Menu sign of "Mark incomplete": the empty ring. */
export function MarkIncompleteIcon({
  size,
  color,
}: ActionIconProps): React.JSX.Element {
  return (
    <View style={[styles.round, {width: size, height: size}]}>
      <CompleteMark
        size={Math.round(size * 0.86)}
        complete={false}
        color={color}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  round: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  check: {
    fontWeight: '700',
    textAlign: 'center',
  },
});
