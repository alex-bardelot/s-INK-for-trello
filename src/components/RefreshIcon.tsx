import React from 'react';
import {StyleSheet, View} from 'react-native';

import {iconStroke} from './iconStroke';

export interface RefreshIconProps {
  size: number;
  color: string;
}

/**
 * Clockwise "refresh" arrow drawn with plain views: the tablet's fonts do
 * not reliably include ↻ and the plugin cannot ship native SVG support.
 *
 * Angles below run clockwise from 12 o'clock. A ring border side covers 90°
 * (the top one -45°..45°), so the arc is made of two rings: one keeping its
 * bottom and left sides, turned 45° (180°..360°), and one keeping only its
 * bottom side (135°..225°). The arc thus runs from 135° to 12 o'clock and
 * leaves a 135° gap, wide enough for the arrowhead at 12 o'clock to stay
 * well apart from the tail.
 */
export function RefreshIcon({size, color}: RefreshIconProps): React.JSX.Element {
  const stroke = iconStroke(size);
  const radius = Math.round(size * 0.36);
  // Half the height of the arrowhead, and its length along the arc.
  const headHalf = Math.round(size * 0.19);
  const headLength = Math.round(size * 0.25);

  // Centre the drawing's bounding box, not the ring: the arrowhead sticks
  // out above it, and the right side ends at the tail (135°) or the tip.
  const right = Math.max(radius * Math.SQRT1_2, headLength);
  const cx = size / 2 + (radius - right) / 2;
  const cy = size / 2 + (headHalf - stroke / 2) / 2;

  const ring = {
    left: cx - radius,
    top: cy - radius,
    width: radius * 2,
    height: radius * 2,
    borderRadius: radius,
    borderWidth: stroke,
    borderColor: color,
  };
  return (
    <View
      style={{width: size, height: size}}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants">
      <View style={[styles.absolute, ring, styles.halfArc]} />
      <View style={[styles.absolute, ring, styles.quarterArc]} />
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
  halfArc: {
    borderTopColor: 'transparent',
    borderRightColor: 'transparent',
    transform: [{rotate: '45deg'}],
  },
  quarterArc: {
    borderTopColor: 'transparent',
    borderRightColor: 'transparent',
    borderLeftColor: 'transparent',
  },
  triangle: {
    width: 0,
    height: 0,
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
  },
});
