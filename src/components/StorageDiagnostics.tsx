import React, {useCallback, useState} from 'react';
import {StyleSheet, Text, View} from 'react-native';

import {useTranslation} from '../i18n';
import {getStorageDiagnostics} from '../storage/stores';
import {borders, colors, spacing, typography} from '../theme';
import {Button} from './Button';

/**
 * Button revealing how the device storage behaves on this tablet
 * (permissions, directory, entries, last error), to troubleshoot saving.
 */
export function StorageDiagnostics(): React.JSX.Element {
  const {t} = useTranslation();
  const [lines, setLines] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setLines(await getStorageDiagnostics());
    } catch (error) {
      setLines([`error: ${error instanceof Error ? error.message : error}`]);
    } finally {
      setLoading(false);
    }
  }, []);

  return (
    <View style={styles.container}>
      <View style={styles.actions}>
        <Button
          disabled={loading}
          label={t('storage.diagnostics')}
          onPress={load}
        />
        {lines && (
          <Button label={t('common.close')} onPress={() => setLines(null)} />
        )}
      </View>
      {lines && (
        <Text selectable style={styles.lines}>
          {lines.join('\n')}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.sm,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  lines: {
    color: colors.foreground,
    fontFamily: 'monospace',
    fontSize: typography.body - 6,
    borderColor: colors.foreground,
    borderWidth: borders.width / 2,
    padding: spacing.sm,
  },
});
