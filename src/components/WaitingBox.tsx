import React, {useEffect, useState} from 'react';
import {StyleSheet, Text, View} from 'react-native';

import {borders, colors, spacing, typography} from '../theme';

/** The squares under the message, one more filled every second. */
const SQUARES = 3;
const TICK_MS = 1000;
const SQUARE_SIZE = 16;

export interface WaitingBoxProps {
  /** What is being waited for, such as "Loading the board…". */
  message: string;
  /**
   * Draws the box over the page it is put in, which stays visible around
   * it and cannot be used meanwhile. Otherwise the box is centered in the
   * space it is given.
   */
  overlay?: boolean;
}

/**
 * The one box shown while the plugin waits: a framed message centered on
 * the page, with squares that fill in one by one, once a second, to show
 * the work goes on. Only the message changes from one wait to another.
 */
export function WaitingBox({
  message,
  overlay = false,
}: WaitingBoxProps): React.JSX.Element {
  return (
    <View style={[styles.area, overlay && styles.overlay]}>
      <View
        accessibilityRole="progressbar"
        accessibilityLabel={message}
        style={styles.box}>
        <Text style={styles.message}>{message}</Text>
        <WorkingSquares />
      </View>
    </View>
  );
}

/** Once a second at most, gentle on E Ink. */
function WorkingSquares(): React.JSX.Element {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(
      () => setTick(current => (current + 1) % (SQUARES + 1)),
      TICK_MS,
    );
    return () => clearInterval(timer);
  }, []);
  return (
    <View style={styles.squares}>
      {Array.from({length: SQUARES}, (_, index) => (
        <View
          key={index}
          style={[styles.square, index < tick && styles.filled]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  area: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
  },
  box: {
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.background,
    borderColor: colors.foreground,
    borderRadius: borders.radius,
    borderWidth: borders.width * 2,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
  },
  message: {
    color: colors.foreground,
    fontSize: typography.body,
    fontWeight: '700',
    textAlign: 'center',
  },
  squares: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  square: {
    width: SQUARE_SIZE,
    height: SQUARE_SIZE,
    borderColor: colors.foreground,
    borderWidth: borders.width,
  },
  filled: {
    backgroundColor: colors.foreground,
  },
});
