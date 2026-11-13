import React from 'react';
import {StyleSheet, View} from 'react-native';

export interface GearIconProps {
  size: number;
  color: string;
  /** Color of the hole in the middle (the background behind the icon). */
  holeColor: string;
}

/**
 * Settings gear drawn with plain views. The tablet's fonts do not reliably
 * include the ⚙ sign and the plugin cannot ship native SVG support, so the
 * teeth are four rotated bars behind a disc with a hole.
 */
export function GearIcon({
  size,
  color,
  holeColor,
}: GearIconProps): React.JSX.Element {
  const tooth = {
    width: size,
    height: size * 0.24,
    backgroundColor: color,
  };
  const disc = size * 0.74;
  const hole = size * 0.3;
  return (
    <View
      style={[styles.container, {width: size, height: size}]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants">
      {[0, 45, 90, 135].map(angle => (
        <View
          key={angle}
          style={[styles.centered, tooth, {transform: [{rotate: `${angle}deg`}]}]}
        />
      ))}
      <View
        style={[
          styles.centered,
          {
            width: disc,
            height: disc,
            borderRadius: disc / 2,
            backgroundColor: color,
          },
        ]}
      />
      <View
        style={[
          styles.centered,
          {
            width: hole,
            height: hole,
            borderRadius: hole / 2,
            backgroundColor: holeColor,
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
});
