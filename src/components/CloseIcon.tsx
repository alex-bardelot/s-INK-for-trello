import React from 'react';
import {StyleSheet, View} from 'react-native';

import {iconStroke} from './iconStroke';

export interface CloseIconProps {
  size: number;
  color: string;
}

/**
 * Close cross drawn with two rotated bars rather than the ✕ sign, whose
 * size and height in the line depend on the font: drawn like the other
 * header icons, it lines up with them exactly.
 */
export function CloseIcon({size, color}: CloseIconProps): React.JSX.Element {
  const stroke = iconStroke(size);
  // The arms span a square of 60 % of the icon, corner to corner.
  const bar = {
    width: size * 0.6 * Math.SQRT2,
    height: stroke,
    borderRadius: stroke / 2,
    backgroundColor: color,
  };
  return (
    <View
      style={[styles.container, {width: size, height: size}]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants">
      <View style={[styles.bar, bar, styles.down]} />
      <View style={[styles.bar, bar, styles.up]} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  bar: {
    position: 'absolute',
  },
  down: {
    transform: [{rotate: '45deg'}],
  },
  up: {
    transform: [{rotate: '-45deg'}],
  },
});
