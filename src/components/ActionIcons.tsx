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

/** "Open": the four corners of a frame, the usual "open in full" sign. */
export function OpenIcon({size, color}: ActionIconProps): React.JSX.Element {
  const stroke = Math.max(2, Math.round(iconStroke(size) * 0.8));
  const arm = Math.round(size * 0.34);
  const inset = Math.round(size * 0.08);
  const corner = {width: arm, height: arm, borderColor: color};
  return (
    <View
      style={[styles.box, {width: size, height: size}]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants">
      <View
        style={[
          styles.line,
          corner,
          {
            left: inset,
            top: inset,
            borderLeftWidth: stroke,
            borderTopWidth: stroke,
          },
        ]}
      />
      <View
        style={[
          styles.line,
          corner,
          {
            right: inset,
            top: inset,
            borderRightWidth: stroke,
            borderTopWidth: stroke,
          },
        ]}
      />
      <View
        style={[
          styles.line,
          corner,
          {
            left: inset,
            bottom: inset,
            borderLeftWidth: stroke,
            borderBottomWidth: stroke,
          },
        ]}
      />
      <View
        style={[
          styles.line,
          corner,
          {
            right: inset,
            bottom: inset,
            borderRightWidth: stroke,
            borderBottomWidth: stroke,
          },
        ]}
      />
    </View>
  );
}

/**
 * "Edit": a pencil leaning right, its point down left. It is drawn upright
 * (eraser, then the outlined body, then the point) and turned an eighth.
 */
export function PenIcon({size, color}: ActionIconProps): React.JSX.Element {
  const stroke = Math.max(2, Math.round(iconStroke(size) * 0.8));
  const width = 2 * Math.round(size * 0.16);
  const cap = Math.round(size * 0.18);
  const tip = Math.round(size * 0.26);
  const body = size - cap - tip;
  const left = (size - width) / 2;
  return (
    <View
      style={{width: size, height: size}}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants">
      <View
        style={[
          styles.line,
          styles.corner,
          {width: size, height: size, transform: [{rotate: '45deg'}]},
        ]}>
        {/* The eraser, set apart from the body by a thin gap. */}
        <View
          style={[
            styles.line,
            styles.corner,
            {
              left,
              width,
              height: cap - stroke,
              backgroundColor: color,
              borderTopLeftRadius: stroke,
              borderTopRightRadius: stroke,
            },
          ]}
        />
        <View
          style={[
            styles.line,
            {
              left,
              top: cap,
              width,
              height: body,
              borderWidth: stroke,
              borderColor: color,
            },
          ]}
        />
        <View
          style={[
            styles.line,
            styles.point,
            {
              left,
              top: cap + body,
              borderTopWidth: tip,
              borderLeftWidth: width / 2,
              borderRightWidth: width / 2,
              borderTopColor: color,
            },
          ]}
        />
      </View>
    </View>
  );
}

/** "Archive": a box with its lid on, and a handle on its front. */
export function ArchiveIcon({size, color}: ActionIconProps): React.JSX.Element {
  const stroke = Math.max(2, Math.round(iconStroke(size) * 0.8));
  const lidHeight = Math.round(size * 0.24);
  const bodyWidth = Math.round(size * 0.8);
  const bodyHeight = Math.round(size * 0.56);
  const handleWidth = Math.round(bodyWidth * 0.36);
  return (
    <View
      style={[styles.box, {width: size, height: size}]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants">
      <View
        style={{
          width: size,
          height: lidHeight,
          borderWidth: stroke,
          borderColor: color,
          borderRadius: stroke,
        }}
      />
      <View
        style={[
          styles.box,
          {
            width: bodyWidth,
            height: bodyHeight,
            borderLeftWidth: stroke,
            borderRightWidth: stroke,
            borderBottomWidth: stroke,
            borderColor: color,
          },
        ]}>
        <View
          style={{
            width: handleWidth,
            height: stroke,
            backgroundColor: color,
            marginBottom: Math.round(bodyHeight * 0.3),
          }}
        />
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
  // A triangle pointing down, drawn by its top border.
  point: {
    width: 0,
    height: 0,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },
  corner: {
    left: 0,
    top: 0,
  },
  page: {
    position: 'relative',
  },
  line: {
    position: 'absolute',
  },
});
