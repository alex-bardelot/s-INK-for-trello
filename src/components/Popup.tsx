import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';

import {borders, colors, spacing, typography} from '../theme';

/**
 * Popup over the whole page: a framed card on the faded page, its title,
 * its content and its buttons at the bottom right. Drawn in the page (no
 * system dialog), with a plain border for e-ink. A tap beside the card
 * calls `onClose`.
 */
export function Popup({
  title,
  icon,
  children,
  actions,
  onClose,
}: {
  title: string;
  /** Drawn before the title. */
  icon?: React.ReactNode;
  children: React.ReactNode;
  actions: React.ReactNode;
  onClose: () => void;
}): React.JSX.Element {
  return (
    <Pressable
      accessibilityViewIsModal
      style={styles.backdrop}
      onPress={onClose}>
      {/* Taps on the card itself do not close it. */}
      <Pressable style={styles.card} onPress={() => {}}>
        <View style={styles.header}>
          {icon}
          <Text accessibilityRole="header" style={styles.title}>
            {title}
          </Text>
        </View>
        {children}
        <View style={styles.actions}>{actions}</View>
      </Pressable>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    // Faded page behind, without the grey e-ink renders poorly.
    backgroundColor: 'rgba(255, 255, 255, 0.7)',
  },
  card: {
    maxWidth: 560,
    width: '100%',
    gap: spacing.md,
    backgroundColor: colors.background,
    borderColor: colors.foreground,
    borderWidth: borders.width * 2,
    borderRadius: borders.radius * 2,
    padding: spacing.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  title: {
    flex: 1,
    color: colors.foreground,
    fontSize: typography.heading,
    fontWeight: '700',
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.md,
  },
});
