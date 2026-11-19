import React from 'react';
import {Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';

import {borders, colors, spacing, typography} from '../theme';
import {CloseIcon} from './CloseIcon';

const PICKER_WIDTH = 440;
/** Size of the close cross at the right of the title. */
const CLOSE_ICON_SIZE = 28;
const PICKER_MIN_HEIGHT = 240;
/** Tallest the list grows in a long area, such as a scrolled page. */
const PICKER_MAX_HEIGHT = 520;
/**
 * Well under the height of a row's content (label chips are 36 high), so
 * the box reads as a mark beside it; the whole row takes the tap.
 */
const BOX_SIZE = 22;
const BOX_MARK_SIZE = 16;

/** Where the floating list stands in its area, under its button. */
export interface FloatingPickerPosition {
  left: number;
  top: number;
  maxHeight: number;
}

/** One choice of the floating list. */
export interface PickerRow {
  id: string;
  /** Read by accessibility services. */
  name: string;
  selected: boolean;
  /** What the row shows after its checkbox, such as a label's color. */
  content: React.ReactNode;
}

/**
 * Works out where the floating list opens: under `button`, kept inside
 * `area`, the view the list is drawn in (it must be positioned).
 */
export function measurePickerPosition(
  button: View,
  area: View,
): Promise<FloatingPickerPosition> {
  return new Promise(resolve =>
    button.measureInWindow((bx, by, _bw, bh) =>
      area.measureInWindow((ax, ay, aw, ah) => {
        const top = by - ay + bh + spacing.xs;
        resolve({
          left: Math.max(0, Math.min(bx - ax, aw - PICKER_WIDTH)),
          top,
          maxHeight: Math.min(
            PICKER_MAX_HEIGHT,
            Math.max(PICKER_MIN_HEIGHT, ah - top - spacing.md),
          ),
        });
      }),
    ),
  );
}

/**
 * A list floating under the button that opened it, such as the labels or
 * members of a board, under a centered title with a close cross: a tap
 * checks or unchecks a row and leaves the list open; a tap on the cross or
 * anywhere outside closes it. Drawn last in its area, over the rest.
 */
export function FloatingPicker({
  title,
  position,
  rows,
  closeLabel,
  onToggle,
  onClose,
  emptyMessage,
}: {
  /** Shown centered at the top, such as "Labels". */
  title: string;
  position: FloatingPickerPosition;
  rows: readonly PickerRow[];
  closeLabel: string;
  onToggle: (id: string) => void;
  onClose: () => void;
  /** Shown instead of the rows when there are none (loading, failure). */
  emptyMessage?: string;
}): React.JSX.Element {
  return (
    <>
      <Pressable
        accessibilityLabel={closeLabel}
        onPress={onClose}
        style={StyleSheet.absoluteFill}
      />
      <View
        accessibilityViewIsModal
        style={[
          styles.card,
          {
            left: position.left,
            top: position.top,
            maxHeight: position.maxHeight,
          },
        ]}>
        <View style={styles.header}>
          <Text style={styles.title} accessibilityRole="header" numberOfLines={1}>
            {title}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={closeLabel}
            hitSlop={spacing.sm}
            onPress={onClose}
            style={({pressed}) => [styles.close, pressed && styles.pressed]}>
            <CloseIcon size={CLOSE_ICON_SIZE} color={colors.foreground} />
          </Pressable>
        </View>
        <ScrollView keyboardShouldPersistTaps="handled">
          {rows.length === 0 && emptyMessage && (
            <Text style={styles.empty}>{emptyMessage}</Text>
          )}
          {rows.map(row => (
            <Pressable
              key={row.id}
              accessibilityRole="checkbox"
              accessibilityLabel={row.name}
              accessibilityState={{checked: row.selected}}
              onPress={() => onToggle(row.id)}
              style={({pressed}) => [styles.row, pressed && styles.pressed]}>
              <View style={[styles.box, row.selected && styles.boxChecked]}>
                {row.selected && <Text style={styles.boxMark}>✓</Text>}
              </View>
              <View style={styles.content}>{row.content}</View>
            </Pressable>
          ))}
        </ScrollView>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  card: {
    position: 'absolute',
    width: PICKER_WIDTH,
    backgroundColor: colors.background,
    borderColor: colors.foreground,
    borderRadius: borders.radius,
    borderWidth: borders.width * 1.5,
    paddingVertical: spacing.xs,
  },
  // The title stays centered on the whole width; the cross sits over its
  // right end.
  header: {
    justifyContent: 'center',
    minHeight: CLOSE_ICON_SIZE + 2 * spacing.sm,
    paddingHorizontal: CLOSE_ICON_SIZE + 2 * spacing.md,
    paddingVertical: spacing.xs,
  },
  title: {
    color: colors.foreground,
    fontSize: typography.label,
    fontWeight: '700',
    textAlign: 'center',
  },
  close: {
    position: 'absolute',
    right: spacing.sm,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  pressed: {
    backgroundColor: colors.avatar,
  },
  empty: {
    color: colors.foreground,
    fontSize: typography.body,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  content: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  box: {
    width: BOX_SIZE,
    height: BOX_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    borderColor: colors.foreground,
    borderRadius: 3,
    borderWidth: borders.width,
    backgroundColor: colors.background,
  },
  boxChecked: {
    backgroundColor: colors.foreground,
  },
  boxMark: {
    color: colors.background,
    fontSize: BOX_MARK_SIZE,
    lineHeight: BOX_MARK_SIZE + 2,
    fontWeight: '700',
  },
});
