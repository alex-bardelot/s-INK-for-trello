import React from 'react';
import {StyleSheet, Text, View} from 'react-native';

import {ScreenFrame} from '../components/ScreenFrame';
import {useTranslation} from '../i18n';
import {colors, typography} from '../theme';

export interface StatusScreenProps {
  message: string;
  /** Shows a back button, for a message the user can leave. */
  onBack?: () => void;
}

/** Full-screen message, used while the Trello account is being checked. */
export function StatusScreen({
  message,
  onBack,
}: StatusScreenProps): React.JSX.Element {
  const {t} = useTranslation();
  return (
    <ScreenFrame title={t('app.name')} onBack={onBack}>
      <View style={styles.center}>
        <Text style={styles.message}>{message}</Text>
      </View>
    </ScreenFrame>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  message: {
    color: colors.foreground,
    fontSize: typography.label,
    textAlign: 'center',
  },
});
