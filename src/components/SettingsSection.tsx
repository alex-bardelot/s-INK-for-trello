import React from 'react';
import {StyleSheet, Text, View} from 'react-native';

import {borders, colors, spacing, typography} from '../theme';

/** Titled block of a Settings category, underlined like the system's. */
export function SettingsSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <View style={styles.section}>
      <Text accessibilityRole="header" style={styles.sectionTitle}>
        {title}
      </Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: spacing.sm,
    marginBottom: spacing.xl,
  },
  sectionTitle: {
    color: colors.foreground,
    fontSize: typography.label,
    fontWeight: '700',
    borderBottomColor: colors.foreground,
    borderBottomWidth: borders.width / 2,
    paddingBottom: spacing.xs,
    marginBottom: spacing.xs,
  },
});
