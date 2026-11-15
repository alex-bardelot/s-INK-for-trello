import React from 'react';
import {StyleSheet, View} from 'react-native';

import {iconStroke} from './iconStroke';

export interface ActionIconProps {
  size: number;
  color: string;
}

/** "Start": a play triangle pointing right. */
export function StartIcon({size, color}: ActionIconProps): React.JSX.Element {
  const half = Math.round(size * 0.42);
  return (
    <View
      style={[styles.box, {width: size, height: size}]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants">
      <View
        style={[
          styles.triangle,
          {
            borderLeftWidth: Math.round(half * 1.6),
            borderTopWidth: half,
            borderBottomWidth: half,
            borderLeftColor: color,
          },
        ]}
      />
    </View>
  );
}

/** "Note": a page with lines of writing. */
export function NoteIcon({size, color}: ActionIconProps): React.JSX.Element {
  const stroke = Math.max(2, Math.round(iconStroke(size) * 0.8));
  const width = Math.round(size * 0.74);
  const inset = stroke * 2;
  const step = Math.round((size - 2 * stroke - 2 * inset) / 3);
  return (
    <View
      style={[styles.box, {width: size, height: size}]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants">
      <View
        style={[
          styles.page,
          {
            width,
            height: size,
            borderWidth: stroke,
            borderColor: color,
            borderRadius: stroke,
          },
        ]}>
        {[0, 1, 2].map(row => (
          <View
            key={row}
            style={[
              styles.line,
              {
                left: inset - stroke,
                top: inset - stroke + row * step + step / 2,
                width:
                  row === 2 ? (width - 2 * inset) * 0.6 : width - 2 * inset,
                height: stroke,
                backgroundColor: color,
              },
            ]}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  triangle: {
    width: 0,
    height: 0,
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
  },
  page: {
    position: 'relative',
  },
  line: {
    position: 'absolute',
  },
});
