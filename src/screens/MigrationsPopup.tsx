import React, {useEffect, useState} from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';

import pluginConfig from '../../PluginConfig.json';
import {Button} from '../components/Button';
import {Popup} from '../components/Popup';
import {SwitchTrack} from '../components/Switch';
import {WaitingBox} from '../components/WaitingBox';
import {useTranslation} from '../i18n';
import {
  findPendingMigrations,
  Migration,
  MigrationDecision,
  MigrationOutcome,
  recordMigrationDecisions,
} from '../migrations/migrations';
import {MIGRATIONS} from '../migrations/registry';
import {KeyValueStore} from '../storage/keyValueStore';
import {colors, spacing, typography} from '../theme';

type MigrationsState =
  | {kind: 'idle'}
  | {kind: 'ask'; pending: Migration[]}
  | {kind: 'running'}
  | {
      kind: 'done';
      results: {migration: Migration; outcome: MigrationOutcome}[];
    };

/**
 * After an update, lists the changes this version can make to what an
 * older one left on the tablet, each with a switch, what it does and what
 * skipping it risks. **Apply** runs those turned on and keeps the others
 * as declined, never offered again; **Later** (or a tap beside the popup)
 * asks again at the next opening. A migration that failed is offered
 * again too. Nothing shows when there is nothing to change.
 *
 * @param enabled - Looked at once this is set: after the file access
 * request of the opening, so that the check never prompts by itself.
 */
export function MigrationsPopup({
  store,
  enabled,
}: {
  store: KeyValueStore;
  enabled: boolean;
}): React.JSX.Element | null {
  const {t} = useTranslation();
  const [state, setState] = useState<MigrationsState>({kind: 'idle'});
  const [chosen, setChosen] = useState<ReadonlySet<string>>(() => new Set());
  const [checked, setChecked] = useState(false);
  const version = pluginConfig.versionName;

  useEffect(() => {
    if (!enabled || checked) {
      return;
    }
    setChecked(true);
    findPendingMigrations(store, version, MIGRATIONS)
      .then(pending => {
        if (pending.length > 0) {
          setChosen(new Set(pending.map(migration => migration.id)));
          setState({kind: 'ask', pending});
        }
      })
      .catch(error => console.warn('[sINK] Migration check failed', error));
  }, [checked, enabled, store, version]);

  if (state.kind === 'idle') {
    return null;
  }
  if (state.kind === 'running') {
    return <WaitingBox overlay message={t('migrations.running')} />;
  }
  const close = () => setState({kind: 'idle'});
  if (state.kind === 'done') {
    return (
      <Popup
        title={t('migrations.doneTitle')}
        onClose={close}
        actions={<Button primary label={t('common.ok')} onPress={close} />}>
        {state.results.map(({migration, outcome}) => (
          <View key={migration.id} style={styles.result}>
            <Text style={styles.title}>{t(migration.title)}</Text>
            <Text style={styles.text}>
              {t(outcome.message, outcome.params)}
            </Text>
            {!outcome.ok && (
              <Text style={styles.text}>{t('migrations.offeredAgain')}</Text>
            )}
          </View>
        ))}
      </Popup>
    );
  }

  const {pending} = state;
  const toggle = (id: string) =>
    setChosen(current => {
      const next = new Set(current);
      if (!next.delete(id)) {
        next.add(id);
      }
      return next;
    });
  const apply = async () => {
    setState({kind: 'running'});
    const decisions: Record<string, MigrationDecision> = {};
    const results: {migration: Migration; outcome: MigrationOutcome}[] = [];
    for (const migration of pending) {
      if (!chosen.has(migration.id)) {
        decisions[migration.id] = 'declined';
        continue;
      }
      let outcome: MigrationOutcome;
      try {
        outcome = await migration.run({store});
      } catch (error) {
        console.warn(`[sINK] Migration ${migration.id} failed`, error);
        outcome = {
          ok: false,
          message: 'migrations.failed',
          params: {reason: String(error)},
        };
      }
      // A failed migration is offered again at the next opening.
      if (outcome.ok) {
        decisions[migration.id] = 'done';
      }
      results.push({migration, outcome});
    }
    try {
      await recordMigrationDecisions(store, version, decisions, MIGRATIONS);
    } catch (error) {
      console.warn('[sINK] Migration choices not kept', error);
    }
    setState(results.length > 0 ? {kind: 'done', results} : {kind: 'idle'});
  };

  return (
    <Popup
      title={t('migrations.title', {version})}
      onClose={close}
      actions={
        <>
          <Button label={t('migrations.later')} onPress={close} />
          <Button
            primary
            label={t(chosen.size > 0 ? 'migrations.apply' : 'migrations.skip')}
            onPress={apply}
          />
        </>
      }>
      <Text style={styles.text}>{t('migrations.intro')}</Text>
      {pending.map(migration => {
        const on = chosen.has(migration.id);
        return (
          <Pressable
            key={migration.id}
            accessibilityRole="switch"
            accessibilityState={{checked: on}}
            accessibilityLabel={t(migration.title)}
            onPress={() => toggle(migration.id)}
            style={styles.row}>
            <View style={styles.texts}>
              <Text style={styles.title}>{t(migration.title)}</Text>
              <Text style={styles.text}>{t(migration.description)}</Text>
              {migration.caution && (
                <Text style={styles.text}>
                  <Text style={styles.strong}>
                    {t('migrations.cautionLabel')}
                  </Text>{' '}
                  {t(migration.caution)}
                </Text>
              )}
              <Text style={styles.text}>
                <Text style={styles.strong}>{t('migrations.riskLabel')}</Text>{' '}
                {t(migration.risk)}
              </Text>
            </View>
            <SwitchTrack value={on} />
          </Pressable>
        );
      })}
    </Popup>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  texts: {
    flex: 1,
    gap: spacing.xs,
  },
  result: {
    gap: spacing.xs,
  },
  title: {
    color: colors.foreground,
    fontSize: typography.label,
    fontWeight: '700',
  },
  text: {
    color: colors.foreground,
    fontSize: typography.small,
  },
  strong: {
    fontWeight: '700',
  },
});
