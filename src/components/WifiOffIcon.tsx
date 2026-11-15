import React from 'react';
import {StyleSheet, View} from 'react-native';

export interface WifiOffIconProps {
  size: number;
  color: string;
  /** Background behind the icon: the slash is cut out of the arcs with it. */
  background: string;
}

/** Radii of the three arcs, as a share of the size. */
const ARC_RADII = [0.2, 0.4, 0.6];

/**
 * "Wi-Fi off" sign drawn with plain views, in the style of the tablet's own
 * Wi-Fi sign: three thin quarter arcs over a dot, crossed out by a slash.
 * A ring with only its top border drawn is exactly the arc from -45° to
 * 45°; all rings share the dot as their centre.
 */
export function WifiOffIcon({
  size,
  color,
  background,
}: WifiOffIconProps): React.JSX.Element {
  // Thinner than the other header icons, like the tablet's Wi-Fi sign.
  const stroke = Math.max(2, Math.round(size * 0.075));
  const cx = size / 2;
  // The arcs span 0.6 × size above the dot: centre the whole sign.
  const cy = size * 0.78;
  const dot = Math.round(stroke * 2.2);
  const slashLength = size * 0.92;
  const slash = {
    left: cx - slashLength / 2,
    width: slashLength,
    transform: [{rotate: '45deg'}],
  };
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
      {/* A wider bar of the background first, so the slash stands clear. */}
      <View
        style={[
          styles.absolute,
          slash,
          {
            top: size / 2 - stroke * 1.2,
            height: stroke * 2.4,
            backgroundColor: background,
          },
        ]}
      />
      <View
        style={[
          styles.absolute,
          slash,
          {
            top: size / 2 - stroke / 2,
            height: stroke,
            borderRadius: stroke / 2,
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
