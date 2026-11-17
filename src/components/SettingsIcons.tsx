import React from 'react';
import {StyleSheet, View, ViewStyle} from 'react-native';

import {iconStroke} from './iconStroke';

export interface SettingsIconProps {
  size: number;
  color: string;
}

/** Stroke of these icons, the same as the block and action icons. */
function strokeFor(size: number): number {
  return Math.max(2, Math.round(iconStroke(size) * 0.8));
}

/** An absolutely placed box inside the icon. */
function part(style: ViewStyle, key: string): React.ReactNode {
  return <View key={key} style={[styles.part, style]} />;
}

/** Square frame holding the parts of an icon, hidden from accessibility. */
function Frame({
  size,
  children,
}: {
  size: number;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <View
      style={{width: size, height: size}}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants">
      {children}
    </View>
  );
}

/**
 * A filled heart, drawn like the other icons with plain views (the plugin
 * cannot ship native SVG support): a square turned 45° for the point, and
 * two discs on its upper sides for the lobes.
 */
export function HeartIcon({size, color}: SettingsIconProps): React.JSX.Element {
  // Half the diagonal of the turned square; the heart is 2.414 of it wide
  // and 2.207 of it high.
  const half = size / (1 + Math.SQRT2);
  const side = half * Math.SQRT2;
  const centerX = size / 2;
  const above = half * (0.5 + Math.SQRT1_2);
  const centerY = (size - above - half) / 2 + above;
  const lobe = (dx: number, key: string) =>
    part(
      {
        left: centerX + dx - side / 2,
        top: centerY - half / 2 - side / 2,
        width: side,
        height: side,
        borderRadius: side / 2,
        backgroundColor: color,
      },
      key,
    );
  return (
    <Frame size={size}>
      {part(
        {
          left: centerX - side / 2,
          top: centerY - side / 2,
          width: side,
          height: side,
          backgroundColor: color,
          transform: [{rotate: '45deg'}],
        },
        'point',
      )}
      {lobe(-half / 2, 'left')}
      {lobe(half / 2, 'right')}
    </Frame>
  );
}

/** "New card": the outline of a card with a plus sign on it. */
export function NewCardIcon({
  size,
  color,
}: SettingsIconProps): React.JSX.Element {
  const stroke = strokeFor(size);
  const height = Math.round(size * 0.78);
  const top = (size - height) / 2;
  const arm = size * 0.42;
  return (
    <Frame size={size}>
      {part(
        {
          left: 0,
          top,
          width: size,
          height,
          borderWidth: stroke,
          borderColor: color,
          borderRadius: stroke * 1.5,
        },
        'card',
      )}
      {part(
        {
          left: (size - arm) / 2,
          top: (size - stroke) / 2,
          width: arm,
          height: stroke,
          backgroundColor: color,
        },
        'across',
      )}
      {part(
        {
          left: (size - stroke) / 2,
          top: (size - arm) / 2,
          width: stroke,
          height: arm,
          backgroundColor: color,
        },
        'down',
      )}
    </Frame>
  );
}

/** "About": a lowercase i in a circle. */
export function InfoIcon({size, color}: SettingsIconProps): React.JSX.Element {
  const stroke = strokeFor(size);
  const dot = stroke * 1.5;
  const stem = stroke * 1.3;
  return (
    <Frame size={size}>
      {part(
        {
          left: 0,
          top: 0,
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: stroke,
          borderColor: color,
        },
        'circle',
      )}
      {part(
        {
          left: (size - dot) / 2,
          top: size * 0.22,
          width: dot,
          height: dot,
          borderRadius: dot / 2,
          backgroundColor: color,
        },
        'dot',
      )}
      {part(
        {
          left: (size - stem) / 2,
          top: size * 0.42,
          width: stem,
          height: size * 0.34,
          backgroundColor: color,
        },
        'stem',
      )}
    </Frame>
  );
}

/** "Diagnostics": a magnifying glass. */
export function InspectIcon({
  size,
  color,
}: SettingsIconProps): React.JSX.Element {
  const stroke = strokeFor(size);
  const lens = size * 0.64;
  // The handle runs along the diagonal, from the lens rim to the corner.
  const rim = lens / 2 + (lens / 2) * Math.SQRT1_2;
  const middle = (rim + size) / 2;
  const length = (size - rim) * Math.SQRT2;
  const handle = stroke * 1.5;
  return (
    <Frame size={size}>
      {part(
        {
          left: 0,
          top: 0,
          width: lens,
          height: lens,
          borderRadius: lens / 2,
          borderWidth: stroke,
          borderColor: color,
        },
        'lens',
      )}
      {part(
        {
          left: middle - handle / 2,
          top: middle - length / 2,
          width: handle,
          height: length,
          borderRadius: handle / 2,
          backgroundColor: color,
          transform: [{rotate: '-45deg'}],
        },
        'handle',
      )}
    </Frame>
  );
}

const styles = StyleSheet.create({
  part: {
    position: 'absolute',
  },
});
