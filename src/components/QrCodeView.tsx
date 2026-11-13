import React, {useMemo} from 'react';
import {PixelRatio, StyleSheet, View} from 'react-native';

import {encodeQrCode} from '../qr/qrCode';
import {colors} from '../theme';

/** Light margin around the code required by the standard, in modules. */
const QUIET_ZONE = 4;

export interface QrCodeViewProps {
  value: string;
  /** Approximate side of the code, quiet zone included. */
  size: number;
  accessibilityLabel?: string;
}

/**
 * Draws a QR code with plain views: one view per horizontal run of dark
 * modules, on a white square, with whole-pixel modules so that the E Ink
 * display renders crisp edges.
 */
export function QrCodeView({
  value,
  size,
  accessibilityLabel,
}: QrCodeViewProps): React.JSX.Element | null {
  const code = useMemo(() => {
    try {
      return encodeQrCode(value);
    } catch (error) {
      console.warn('[sINK] Cannot draw the QR code', error);
      return null;
    }
  }, [value]);

  const layout = useMemo(() => {
    if (!code) {
      return null;
    }
    const span = code.size + QUIET_ZONE * 2;
    const pixel = 1 / PixelRatio.get();
    const module = Math.max(
      pixel,
      PixelRatio.roundToNearestPixel(size / span) || pixel,
    );
    const runs: Array<{x: number; y: number; length: number}> = [];
    code.modules.forEach((row, y) => {
      let start = -1;
      row.forEach((dark, x) => {
        if (dark && start < 0) {
          start = x;
        }
        if ((!dark || x === row.length - 1) && start >= 0) {
          const end = dark ? x + 1 : x;
          runs.push({x: start, y, length: end - start});
          start = -1;
        }
      });
    });
    return {module, side: module * span, runs};
  }, [code, size]);

  if (!layout) {
    return null;
  }
  const {module, side, runs} = layout;
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}
      style={[styles.square, {width: side, height: side}]}>
      {runs.map(run => (
        <View
          key={`${run.y}-${run.x}`}
          style={[
            styles.run,
            {
              left: (run.x + QUIET_ZONE) * module,
              top: (run.y + QUIET_ZONE) * module,
              width: run.length * module,
              height: module,
            },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  square: {
    backgroundColor: colors.background,
  },
  run: {
    position: 'absolute',
    backgroundColor: colors.foreground,
  },
});
