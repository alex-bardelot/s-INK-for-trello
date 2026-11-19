import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';

import {labelShade} from '../board/labels';
import {colors, spacing, typography} from '../theme';
import {MemberAvatar} from './MemberAvatar';
import {CHIP_BORDER_WIDTH, CHIP_HEIGHT} from './ToggleChip';

/** The "+" that opens the full list: a short pill, easy to hit. */
const PICKER_BUTTON_WIDTH = 64;
const SWATCH_SIZE = 22;

/**
 * The "+" after a row of chips (labels, members) that opens the full list
 * under itself. `buttonRef` is the view the list is measured from.
 */
export function ChipPickerButton({
  buttonRef,
  label,
  onPress,
}: {
  buttonRef: React.RefObject<View | null>;
  label: string;
  onPress: () => void;
}): React.JSX.Element {
  return (
    <View ref={buttonRef} collapsable={false}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        hitSlop={spacing.xs}
        onPress={onPress}
        style={({pressed}) => [
          styles.pickerButton,
          pressed && styles.pickerButtonPressed,
        ]}>
        {({pressed}) => (
          <Text
            style={[
              styles.pickerButtonText,
              pressed && styles.pickerButtonTextPressed,
            ]}>
            +
          </Text>
        )}
      </Pressable>
    </View>
  );
}

/**
 * What a label shows in a chip or a row of the floating list: its color,
 * then its name.
 */
export function LabelChipContent({
  name,
  color,
}: {
  name: string;
  color: string | null | undefined;
}): React.JSX.Element {
  return (
    <>
      <View
        style={[styles.swatch, {backgroundColor: labelShade(color).background}]}
      />
      <Text style={styles.chipText} numberOfLines={1}>
        {name}
      </Text>
    </>
  );
}

/** Avatar of a member chip, as on the New Trello Card page. */
const AVATAR_SIZE = 28;

/**
 * What a member shows in a chip or a row of the floating list: their
 * avatar, then their name. Without known initials, they are taken from
 * the name.
 */
export function MemberChipContent({
  name,
  initials,
  avatarUrl,
}: {
  name: string;
  initials?: string;
  avatarUrl?: string | null;
}): React.JSX.Element {
  return (
    <>
      <MemberAvatar
        initials={initials ?? initialsOf(name)}
        avatarUrl={avatarUrl}
        size={AVATAR_SIZE}
      />
      <Text style={styles.chipText} numberOfLines={1}>
        {name}
      </Text>
    </>
  );
}

/** First letters of the first two words of a name, upper case. */
export function initialsOf(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map(word => word.charAt(0))
    .join('')
    .toLocaleUpperCase();
}

const styles = StyleSheet.create({
  pickerButton: {
    width: PICKER_BUTTON_WIDTH,
    height: CHIP_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    borderColor: colors.foreground,
    borderRadius: 999,
    borderStyle: 'dashed',
    borderWidth: CHIP_BORDER_WIDTH,
    backgroundColor: colors.background,
  },
  pickerButtonPressed: {
    backgroundColor: colors.foreground,
  },
  pickerButtonText: {
    color: colors.foreground,
    fontSize: typography.label,
    fontWeight: '700',
  },
  pickerButtonTextPressed: {
    color: colors.background,
  },
  swatch: {
    width: SWATCH_SIZE,
    height: SWATCH_SIZE,
    borderRadius: 4,
    borderColor: colors.labelBorder,
    borderWidth: 1.5,
  },
  chipText: {
    flexShrink: 1,
    color: colors.foreground,
    fontSize: typography.body,
  },
});
