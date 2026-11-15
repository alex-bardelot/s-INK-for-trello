import React from 'react';
import {StyleSheet, Text, View} from 'react-native';

import {ScreenFrame} from '../components/ScreenFrame';
import {WaitingBox} from '../components/WaitingBox';
import {useTranslation} from '../i18n';
import {colors, typography} from '../theme';

export interface StatusScreenProps {
  message: string;
  /** Shows a back button, for a message the user can leave. */
  onBack?: () => void;
}

/** Full-screen message, such as a link that could not be opened. */
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

/**
 * Full-screen wait, such as the Trello account being checked: the
 * plugin's waiting box, alone on the page.
 */
export function WaitingScreen({
  message,
  onBack,
}: StatusScreenProps): React.JSX.Element {
  const {t} = useTranslation();
  return (
    <ScreenFrame title={t('app.name')} onBack={onBack}>
      <WaitingBox message={message} />
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
