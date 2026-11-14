import React from 'react';
import {StyleSheet, Text, View} from 'react-native';

import {useTranslation} from '../i18n';
import {
  clearPendingBinding,
  usePendingBinding,
} from '../inkLink/lassoBinding';
import {borders, colors, spacing, typography} from '../theme';
import {SmallButton} from './SmallButton';

/**
 * Shows the screen under a band that says a lasso selection is waiting to
 * be linked, with a button to give it up.
 */
export function PendingBindingBanner({
  children,
}: {
  children: React.ReactNode;
}): React.JSX.Element {
  const {t} = useTranslation();
  const pending = usePendingBinding();
  if (!pending) {
    return <>{children}</>;
  }
  return (
    <View style={styles.root}>
      <View style={styles.banner}>
        <Text style={styles.message}>
          {t('inkLink.bindPending', {count: pending.elements.length})}
        </Text>
        <SmallButton
          label={t('inkLink.bindCancel')}
          accessibilityLabel={t('inkLink.bindCancel')}
          onPress={clearPendingBinding}
        />
      </View>
      <View style={styles.content}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomColor: colors.foreground,
    borderBottomWidth: borders.width,
  },
  message: {
    flex: 1,
    color: colors.foreground,
    fontSize: typography.body,
  },
  content: {
    flex: 1,
  },
});
