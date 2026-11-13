import React, {useCallback, useEffect, useState} from 'react';
import {StyleSheet, Text, View} from 'react-native';

import {
  DEFAULT_FOCUS_SETTINGS,
  FocusSettings,
  loadFocusSettings,
  ModeChoice,
  saveFocusSettings,
} from '../board/focus';
import {COLUMN_COUNTS, ColumnCount, DEFAULT_COLUMNS} from '../board/layout';
import {
  BoardPreferences,
  loadBoardPreferences,
  saveBoardPreferences,
} from '../board/preferences';
import {Button} from '../components/Button';
import {MemberAvatar} from '../components/MemberAvatar';
import {ScreenFrame} from '../components/ScreenFrame';
import {SegmentedControl} from '../components/SegmentedControl';
import {BoardsPreferences} from '../boards/preferences';
import {useTranslation} from '../i18n';
import {TokenStorage} from '../session/trelloSession';
import {KeyValueStore} from '../storage/keyValueStore';
import {TrelloClient, TrelloMember} from '../trello';
import {PublicBoardsSettings} from './PublicBoardsSettings';
import {borders, colors, spacing, typography} from '../theme';

const AVATAR_SIZE = 64;

export interface SettingsScreenProps {
  /** Where the board view settings are kept. */
  store: KeyValueStore;
  /** The connected member; the account settings are hidden without one. */
  member: TrelloMember | null;
  tokenStorage?: TokenStorage;
  saveFailed?: boolean;
  /** Reads public boards being added (anonymous when signed out). */
  client: TrelloClient;
  /** Asks for network access; resolves `false` if refused. */
  ensureNetwork: () => Promise<boolean>;
  boardsPreferences: BoardsPreferences;
  onBoardsPreferencesChange: (preferences: BoardsPreferences) => void;
  /** Saves the token on the tablet, or removes it from there. */
  onRememberChange: (remember: boolean) => void;
  onDisconnect: () => void;
  onBack: () => void;
}

/**
 * Settings that are rarely needed, kept off the boards page: the boards
 * page display, the board view, the connected account and where its token
 * is kept, then the non-affiliation notice.
 */
export function SettingsScreen({
  store,
  member,
  tokenStorage,
  saveFailed,
  client,
  ensureNetwork,
  boardsPreferences,
  onBoardsPreferencesChange,
  onRememberChange,
  onDisconnect,
  onBack,
}: SettingsScreenProps): React.JSX.Element {
  const {t} = useTranslation();

  return (
    <ScreenFrame title={t('settings.title')} onBack={onBack}>
      <Section title={t('settings.publicBoards')}>
        <PublicBoardsSettings
          client={client}
          ensureNetwork={ensureNetwork}
          preferences={boardsPreferences}
          onChange={onBoardsPreferencesChange}
        />
      </Section>

      <BoardViewSettings store={store} />

      {member && tokenStorage && (
        <Section title={t('settings.account')}>
          <AccountCard
            member={member}
            tokenStorage={tokenStorage}
            saveFailed={saveFailed}
            onRememberChange={onRememberChange}
            onDisconnect={onDisconnect}
          />
        </Section>
      )}

      <Text style={styles.disclaimer}>{t('settings.disclaimer')}</Text>
    </ScreenFrame>
  );
}

/**
 * Column counts and board mode, the same settings the board view changes
 * from its toolbar: they are read and saved in the same place.
 */
function BoardViewSettings({
  store,
}: {
  store: KeyValueStore;
}): React.JSX.Element {
  const {t} = useTranslation();
  const [columns, setColumns] = useState<BoardPreferences>(DEFAULT_COLUMNS);
  const [focus, setFocus] = useState<FocusSettings>(DEFAULT_FOCUS_SETTINGS);

  useEffect(() => {
    let active = true;
    loadBoardPreferences(store).then(loaded => active && setColumns(loaded));
    loadFocusSettings(store).then(loaded => active && setFocus(loaded));
    return () => {
      active = false;
    };
  }, [store]);

  const changeColumns = useCallback(
    (orientation: keyof BoardPreferences, count: ColumnCount) => {
      const next = {...columns, [orientation]: count};
      setColumns(next);
      saveBoardPreferences(store, next);
    },
    [columns, store],
  );
  const changeMode = useCallback(
    (choice: ModeChoice) => {
      const next = {...focus, mode: choice === 'all' ? null : choice};
      setFocus(next);
      saveFocusSettings(store, next);
    },
    [focus, store],
  );

  const counts = COLUMN_COUNTS.map(count => ({
    value: count,
    label: String(count),
  }));
  const modes: {value: ModeChoice; label: string}[] = [
    {value: 'all', label: t('settings.modeAll')},
    {value: 'focus', label: t('board.focus')},
    {value: 'review', label: t('board.review')},
  ];

  return (
    <Section title={t('settings.boardView')}>
      <SegmentedControl
        label={t('settings.columnsPortrait')}
        segments={counts}
        value={columns.portrait}
        onChange={count => changeColumns('portrait', count)}
      />
      <SegmentedControl
        label={t('settings.columnsLandscape')}
        segments={counts}
        value={columns.landscape}
        onChange={count => changeColumns('landscape', count)}
      />
      <SegmentedControl
        label={t('settings.boardMode')}
        help={t('settings.boardModeHelp')}
        segments={modes}
        value={focus.mode ?? 'all'}
        onChange={changeMode}
      />
    </Section>
  );
}

/**
 * The connected account and its token in one framed card. Saving the token
 * on the tablet and disconnecting each ask for a confirmation in place of
 * the buttons.
 */
function AccountCard({
  member,
  tokenStorage,
  saveFailed,
  onRememberChange,
  onDisconnect,
}: {
  member: TrelloMember;
  tokenStorage: TokenStorage;
  saveFailed?: boolean;
  onRememberChange: (remember: boolean) => void;
  onDisconnect: () => void;
}): React.JSX.Element {
  const {t} = useTranslation();
  const [confirming, setConfirming] = useState<'save' | 'disconnect' | null>(
    null,
  );
  const saved = tokenStorage === 'device';

  return (
    <View style={styles.card}>
      <View style={styles.member}>
        <MemberAvatar
          initials={member.initials}
          avatarUrl={member.avatarUrl}
          size={AVATAR_SIZE}
        />
        <View style={styles.memberTexts}>
          <Text style={styles.name}>{member.fullName}</Text>
          <Text style={styles.text}>@{member.username}</Text>
        </View>
      </View>

      <View style={styles.separator} />

      {saveFailed && (
        <Text accessibilityRole="alert" style={[styles.text, styles.bold]}>
          {t('storage.saveFailed')}
        </Text>
      )}
      <Text style={styles.text}>
        {t(saved ? 'storage.savedOnDevice' : 'storage.sessionOnly')}
      </Text>

      {confirming === null && (
        <View style={styles.actions}>
          <Button
            label={t(saved ? 'storage.forget' : 'storage.save')}
            onPress={() =>
              saved ? onRememberChange(false) : setConfirming('save')
            }
          />
          <Button
            label={t('settings.disconnect')}
            onPress={() => setConfirming('disconnect')}
          />
        </View>
      )}
      {confirming === 'save' && (
        <Confirmation
          message={t('connect.rememberWarning')}
          confirmLabel={t('storage.confirmSave')}
          onCancel={() => setConfirming(null)}
          onConfirm={() => {
            setConfirming(null);
            onRememberChange(true);
          }}
        />
      )}
      {confirming === 'disconnect' && (
        <Confirmation
          message={t('settings.disconnectConfirm')}
          confirmLabel={t('settings.disconnect')}
          onCancel={() => setConfirming(null)}
          onConfirm={onDisconnect}
        />
      )}
    </View>
  );
}

function Confirmation({
  message,
  confirmLabel,
  onCancel,
  onConfirm,
}: {
  message: string;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
}): React.JSX.Element {
  const {t} = useTranslation();
  return (
    <View style={styles.confirm}>
      <Text accessibilityRole="alert" style={styles.text}>
        {message}
      </Text>
      <View style={styles.actions}>
        <Button label={t('common.cancel')} onPress={onCancel} />
        <Button primary label={confirmLabel} onPress={onConfirm} />
      </View>
    </View>
  );
}

function Section({
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
  text: {
    color: colors.foreground,
    fontSize: typography.body,
  },
  bold: {
    fontWeight: '700',
  },
  card: {
    gap: spacing.md,
    borderColor: colors.foreground,
    borderWidth: borders.width,
    borderRadius: borders.radius * 2,
    padding: spacing.md,
  },
  member: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  memberTexts: {
    flex: 1,
    gap: spacing.xs,
  },
  name: {
    color: colors.foreground,
    fontSize: typography.label,
    fontWeight: '700',
  },
  separator: {
    height: borders.width / 2,
    backgroundColor: colors.foreground,
  },
  confirm: {
    gap: spacing.md,
    borderColor: colors.foreground,
    borderWidth: borders.width,
    borderRadius: borders.radius,
    padding: spacing.md,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  disclaimer: {
    color: colors.foreground,
    fontSize: typography.small,
    borderTopColor: colors.foreground,
    borderTopWidth: borders.width / 2,
    paddingTop: spacing.md,
  },
});
