import React, {useState} from 'react';
import {StyleSheet, Text, View} from 'react-native';

import {useTranslation} from '../i18n';
import {TokenStorage} from '../session/trelloSession';
import {borders, colors, spacing, typography} from '../theme';
import {Button} from './Button';

export interface TokenStorageNoticeProps {
  tokenStorage: TokenStorage;
  saveFailed?: boolean;
  onChange: (remember: boolean) => void;
}

/**
 * Tells where the Trello token is kept and lets the user change it. Saving
 * on the tablet asks for an explicit confirmation after showing the risks.
 */
export function TokenStorageNotice({
  tokenStorage,
  saveFailed,
  onChange,
}: TokenStorageNoticeProps): React.JSX.Element {
  const {t} = useTranslation();
  const [confirming, setConfirming] = useState(false);

  if (confirming) {
    return (
      <View style={[styles.container, styles.framed]}>
        <Text accessibilityRole="alert" style={styles.text}>
          {t('connect.rememberWarning')}
        </Text>
        <View style={styles.actions}>
          <Button
            label={t('common.cancel')}
            onPress={() => setConfirming(false)}
          />
          <Button
            primary
            label={t('storage.confirmSave')}
            onPress={() => {
              setConfirming(false);
              onChange(true);
            }}
          />
        </View>
      </View>
    );
  }

  const saved = tokenStorage === 'device';
  return (
    <View style={styles.container}>
      {saveFailed && (
        <Text accessibilityRole="alert" style={[styles.text, styles.bold]}>
          {t('storage.saveFailed')}
        </Text>
      )}
      <Text style={styles.text}>
        {t(saved ? 'storage.savedOnDevice' : 'storage.sessionOnly')}
      </Text>
      <Button
        label={t(saved ? 'storage.forget' : 'storage.save')}
        onPress={() => (saved ? onChange(false) : setConfirming(true))}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  framed: {
    borderColor: colors.foreground,
    borderWidth: borders.width,
    padding: spacing.md,
  },
  text: {
    color: colors.foreground,
    fontSize: typography.body,
  },
  bold: {
    fontWeight: '700',
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
});
