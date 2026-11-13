import React from 'react';
import {StyleSheet, View} from 'react-native';

export interface RefreshIconProps {
  size: number;
  color: string;
}

/**
 * Clockwise "refresh" arrow drawn with plain views, like the settings gear:
 * the tablet's fonts do not reliably include ↻ and the plugin cannot ship
 * native SVG support. The arc is a ring whose top quarter is transparent,
 * turned so the gap sits between 12 and 3 o'clock; a triangle made of
 * borders starts at the 12 o'clock end of the arc and points into the gap.
 */
export function RefreshIcon({size, color}: RefreshIconProps): React.JSX.Element {
  const ring = size * 0.74;
  const stroke = Math.max(3, Math.round(size * 0.11));
  // Half the height of the arrowhead, and its length along the arc.
  const headHalf = Math.round(size * 0.21);
  const headLength = Math.round(size * 0.26);
  // Centre line of the ring stroke at the top of the icon.
  const strokeTop = (size - ring) / 2 + stroke / 2;
  return (
    <View
      style={[styles.container, {width: size, height: size}]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants">
      <View
        style={[
          styles.centered,
          {
            width: ring,
            height: ring,
            borderRadius: ring / 2,
            borderWidth: stroke,
            borderColor: color,
          },
          styles.arc,
        ]}
      />
      <View
        style={[
          styles.triangle,
          {
            // The base overlaps the end of the arc by a pixel, no seam.
            left: size / 2 - 1,
            top: strokeTop - headHalf,
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
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  centered: {
    position: 'absolute',
  },
  arc: {
    borderTopColor: 'transparent',
    // The gap left by the top border moves to the top-right quarter.
    transform: [{rotate: '45deg'}],
  },
  triangle: {
    position: 'absolute',
    width: 0,
    height: 0,
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
  },
});
