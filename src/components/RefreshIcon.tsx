import React from 'react';
import {StyleSheet, View} from 'react-native';

import {colors} from '../theme';
import {iconStroke} from './iconStroke';

export interface RefreshIconProps {
  size: number;
  color: string;
  /** Color behind the icon, which opens the ring between head and tail. */
  background?: string;
}

/**
 * Clockwise "refresh" arrow drawn with plain views: the tablet's fonts do
 * not reliably include ↻ and the plugin cannot ship native SVG support.
 *
 * A whole ring is drawn, then its top right quarter is hidden under a
 * square of the background color: the tablet draws a ring with some
 * sides transparent as a closed ring. The arc thus runs clockwise from
 * 3 o'clock round to 12 o'clock, where the arrowhead points right, a
 * quarter turn away from the tail.
 */
export function RefreshIcon({
  size,
  color,
  background = colors.background,
}: RefreshIconProps): React.JSX.Element {
  const stroke = iconStroke(size);
  const radius = Math.round(size * 0.34);
  // Half the height of the arrowhead, and its length along the arc.
  const headHalf = Math.round(size * 0.2);
  const headLength = Math.round(size * 0.24);
  const cx = size / 2;
  const cy = size / 2 + stroke / 2;

  return (
    <View
      style={{width: size, height: size}}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants">
      <View
        style={[
          styles.absolute,
          {
            left: cx - radius,
            top: cy - radius,
            width: radius * 2,
            height: radius * 2,
            borderRadius: radius,
            borderWidth: stroke,
            borderColor: color,
          },
        ]}
      />
      {/* Opens the ring: the gap between the head and the tail. */}
      <View
        style={[
          styles.absolute,
          {
            left: cx,
            top: cy - radius - 1,
            width: radius + 1,
            height: radius + 1,
            backgroundColor: background,
          },
        ]}
      />
      <View
        style={[
          styles.absolute,
          styles.triangle,
          {
            // The base overlaps the end of the arc by a pixel, no seam.
            left: cx - 1,
            top: cy - radius + stroke / 2 - headHalf,
            borderLeftWidth: headLength,
            borderTopWidth: headHalf,
            borderBottomWidth: headHalf,
            borderLeftColor: color,
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  absolute: {
    position: 'absolute',
  },
  triangle: {
    width: 0,
    height: 0,
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
  },
});
