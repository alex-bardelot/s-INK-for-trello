import React from 'react';
import {StyleSheet, Text, View} from 'react-native';

import {ScreenFrame} from '../components/ScreenFrame';
import {useTranslation} from '../i18n';
import {borders, colors, spacing, typography} from '../theme';

export interface StatusScreenProps {
  message: string;
  /** Shows a back button, for a message the user can leave. */
  onBack?: () => void;
  /** Frames the message in a small box, like a popup. */
  boxed?: boolean;
}

/** Full-screen message, used while the Trello account is being checked. */
export function StatusScreen({
  message,
  onBack,
  boxed = false,
}: StatusScreenProps): React.JSX.Element {
  const {t} = useTranslation();
  return (
    <ScreenFrame title={t('app.name')} onBack={onBack}>
      <View style={styles.center}>
        <View style={boxed && styles.box}>
          <Text style={[styles.message, boxed && styles.boxedMessage]}>
            {message}
          </Text>
        </View>
      </View>
    </ScreenFrame>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  message: {
    color: colors.foreground,
    fontSize: typography.label,
    textAlign: 'center',
  },
  box: {
    backgroundColor: colors.background,
    borderColor: colors.foreground,
    borderRadius: borders.radius,
    borderWidth: borders.width * 2,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
  },
  boxedMessage: {
    fontSize: typography.body,
    fontWeight: '700',
  },
});
