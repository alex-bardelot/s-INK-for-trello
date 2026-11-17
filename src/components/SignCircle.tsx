import React from 'react';
import {StyleSheet, Text, View} from 'react-native';

import {borders, colors, typography} from '../theme';

/** Diameter of the round sign. */
export const SIGN_SIZE = 32;

/**
 * A round − or +: labels Start work takes off the card, or puts on it. The
 * Start work settings and the popup before Start draw the same sign.
 */
export function SignCircle({sign}: {sign: '−' | '+'}): React.JSX.Element {
  return (
    <View style={styles.circle}>
      <Text style={styles.text}>{sign}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  circle: {
    width: SIGN_SIZE,
    height: SIGN_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    borderColor: colors.foreground,
    borderWidth: borders.width,
    borderRadius: SIGN_SIZE / 2,
  },
  text: {
    color: colors.foreground,
    fontSize: typography.label,
    fontWeight: '700',
    lineHeight: typography.label + 2,
  },
});
