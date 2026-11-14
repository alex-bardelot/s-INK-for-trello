import React from 'react';
import {FlatList, Pressable, StyleSheet, Text, View} from 'react-native';

import {borders, colors, spacing, typography} from '../theme';

export interface Choice {
  id: string;
  label: string;
  /** Short tag shown under the label, e.g. "Last used". */
  tag?: string;
  /** Framed, to stand out from the other choices (e.g. the favorite). */
  highlighted?: boolean;
}

export interface ChoiceListProps {
  choices: readonly Choice[];
  onSelect: (id: string) => void;
  /** Shown when there is no choice. */
  emptyText: string;
  /** Rendered after the last choice (e.g. a "show all" button). */
  footer?: React.ReactElement;
}

/** Tappable list of options, sized for pen and finger on E Ink. */
export function ChoiceList({
  choices,
  onSelect,
  emptyText,
  footer,
}: ChoiceListProps): React.JSX.Element {
  return (
    <FlatList
      data={choices}
      keyExtractor={choice => choice.id}
      ItemSeparatorComponent={Separator}
      ListEmptyComponent={<Text style={styles.empty}>{emptyText}</Text>}
      ListFooterComponent={
        footer ? <View style={styles.footer}>{footer}</View> : null
      }
      renderItem={({item}) => (
        <Pressable
          accessibilityRole="button"
          onPress={() => onSelect(item.id)}
          style={({pressed}) => [
            styles.row,
            item.highlighted && styles.rowHighlighted,
            pressed && styles.rowPressed,
          ]}>
          {({pressed}) => (
            <>
              <Text
                numberOfLines={2}
                style={[
                  styles.label,
                  item.highlighted && styles.labelHighlighted,
                  pressed && styles.labelPressed,
                ]}>
                {item.label}
              </Text>
              {item.tag && (
                <Text style={[styles.tag, pressed && styles.labelPressed]}>
                  {item.tag}
                </Text>
              )}
            </>
          )}
        </Pressable>
      )}
    />
  );
}

function Separator(): React.JSX.Element {
  return <View style={styles.separator} />;
}

const styles = StyleSheet.create({
  row: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.md,
  },
  rowHighlighted: {
    borderColor: colors.foreground,
    borderRadius: borders.radius,
    borderWidth: borders.width,
    marginVertical: spacing.xs,
  },
  rowPressed: {
    backgroundColor: colors.foreground,
  },
  label: {
    color: colors.foreground,
    fontSize: typography.label,
    fontWeight: '600',
  },
  labelHighlighted: {
    fontWeight: '700',
  },
  labelPressed: {
    color: colors.background,
  },
  tag: {
    color: colors.foreground,
    fontSize: typography.body - 4,
    fontStyle: 'italic',
    marginTop: spacing.xs,
  },
  separator: {
    height: borders.width / 2,
    backgroundColor: colors.foreground,
  },
  empty: {
    color: colors.foreground,
    fontSize: typography.body,
  },
  footer: {
    paddingTop: spacing.lg,
  },
});
