import React from 'react';
import {StyleSheet, View} from 'react-native';

export interface RefreshIconProps {
  size: number;
  color: string;
}

/**
 * Clockwise "refresh" arrow drawn with plain views, like the settings gear:
 * the tablet's fonts do not reliably include ↻ and the plugin cannot ship
 * native SVG support. The arc is a ring with one quarter left transparent,
 * and the arrowhead a triangle made of borders at the top end of the arc.
 */
export function RefreshIcon({size, color}: RefreshIconProps): React.JSX.Element {
  const ring = size * 0.78;
  const stroke = Math.max(2, Math.round(size * 0.13));
  const head = size * 0.2;
  const headLength = size * 0.28;
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
            left: size / 2 - headLength / 3,
            top: strokeTop - head,
            borderLeftWidth: headLength,
            borderTopWidth: head,
            borderBottomWidth: head,
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
