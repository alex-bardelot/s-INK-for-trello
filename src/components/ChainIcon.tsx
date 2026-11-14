import React from 'react';
import {StyleSheet, View} from 'react-native';

import {iconStroke} from './iconStroke';

export interface ChainIconProps {
  size: number;
  color: string;
}

/**
 * Two chain links, the usual "link" sign, drawn with plain views like the
 * other icons: two overlapping rounded rings, tilted by 45°.
 */
export function ChainIcon({size, color}: ChainIconProps): React.JSX.Element {
  const stroke = Math.max(2, Math.round(iconStroke(size) * 0.8));
  const length = Math.round(size * 0.62);
  const thickness = Math.round(size * 0.36);
  const ring = {
    width: length,
    height: thickness,
    borderRadius: thickness / 2,
    borderWidth: stroke,
    borderColor: color,
    top: (size - thickness) / 2,
  };
  // The rings overlap by a little more than their rounded ends.
  const overlap = Math.round(thickness * 0.75);
  const left = (size - (2 * length - overlap)) / 2;
  return (
    <View
      style={[styles.box, {width: size, height: size}]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants">
      <View style={[styles.ring, ring, {left}]} />
      <View style={[styles.ring, ring, {left: left + length - overlap}]} />
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    transform: [{rotate: '-45deg'}],
  },
  ring: {
    position: 'absolute',
  },
});
