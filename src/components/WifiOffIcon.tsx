import React from 'react';
import {StyleSheet, View} from 'react-native';

import {colors} from '../theme';

export interface WifiOffIconProps {
  size: number;
  /** Light grey by default, like the tablet's Wi-Fi sign when it is off. */
  color?: string;
}

/** Radii of the three arcs, as a share of the size. */
const ARC_RADII = [0.2, 0.4, 0.6];

/**
 * Wi-Fi sign drawn with plain views, like the tablet's own: three thin
 * quarter arcs over a dot, in light grey while there is no internet. A ring
 * with only its top border drawn is exactly the arc from -45° to 45°; all
 * rings share the dot as their centre.
 */
export function WifiOffIcon({
  size,
  color = colors.wifiOff,
}: WifiOffIconProps): React.JSX.Element {
  // Thinner than the other header icons, like the tablet's Wi-Fi sign.
  const stroke = Math.max(2, Math.round(size * 0.075));
  const cx = size / 2;
  // The arcs span 0.6 × size above the dot: centre the whole sign.
  const cy = size * 0.78;
  const dot = Math.round(stroke * 2.2);
  return (
    <View
      style={[styles.box, {width: size, height: size}]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants">
      {ARC_RADII.map(share => {
        const radius = size * share;
        return (
          <View
            key={share}
            style={[
              styles.absolute,
              styles.arc,
              {
                left: cx - radius,
                top: cy - radius,
                width: radius * 2,
                height: radius * 2,
                borderRadius: radius,
                borderWidth: stroke,
                borderTopColor: color,
              },
            ]}
          />
        );
      })}
      <View
        style={[
          styles.absolute,
          {
            left: cx - dot / 2,
            top: cy - dot / 2,
            width: dot,
            height: dot,
            borderRadius: dot / 2,
            backgroundColor: color,
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    overflow: 'hidden',
  },
  absolute: {
    position: 'absolute',
  },
  arc: {
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: 'transparent',
  },
});
