import React, {useCallback, useEffect, useRef, useState} from 'react';
import {Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';

import pluginConfig from '../../PluginConfig.json';
import {
  DEFAULT_FOCUS_SETTINGS,
  FocusSettings,
  loadFocusSettings,
  ModeChoice,
  saveFocusSettings,
} from '../board/focus';
import {
  COLUMN_COUNTS,
  ColumnCount,
  DEFAULT_COLUMNS,
  Orientation,
} from '../board/layout';
import {TabletPreview} from '../components/TabletPreview';
import {
  BoardPreferences,
  loadBoardPreferences,
  saveBoardPreferences,
} from '../board/preferences';
import {Button} from '../components/Button';
import {MemberAvatar} from '../components/MemberAvatar';
import {ScreenFrame} from '../components/ScreenFrame';
import {SegmentedControl} from '../components/SegmentedControl';
import {SmallButton} from '../components/SmallButton';
import {clearInkLinkLog, useInkLinkLog} from '../inkLink/diagnostics';
import {
  getLinkTrigger,
  LinkTrigger,
  loadLinkTrigger,
  saveLinkTrigger,
  setLinkTrigger,
} from '../inkLink/trigger';
import {Switch} from '../components/Switch';
import {BoardsPreferences} from '../boards/preferences';
import {useTranslation} from '../i18n';
import {registerInspectButton} from '../plugin/buttons';
import {TokenStorage} from '../session/trelloSession';
import {
  diagnosticsUnlocked,
  RapidTapCounter,
  unlockDiagnostics,
} from '../settings/rapidTaps';
import {KeyValueStore} from '../storage/keyValueStore';
import {TrelloClient, TrelloMember} from '../trello';
import {PublicBoardsSettings} from './PublicBoardsSettings';
import {borders, colors, spacing, typography} from '../theme';

const AVATAR_SIZE = 64;

export interface SettingsScreenProps {
  /** Where the board view settings are kept. */
  store: KeyValueStore;
  /** The connected member; without one, the account section offers to connect. */
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
  /** Opens the connection screen (signed out only). */
  onConnect: () => void;
  onBack: () => void;
}

/**
 * Settings that are rarely needed, kept off the boards page. Laid out like
 * the Supernote system settings: categories in a left column, separated by
 * dotted lines, and the selected one's sections on the right. "Boards"
 * holds the public boards, board layouts and board mode sections; "Links"
 * the tool opening s-INK links; "Trello" the connected account (and where
 * its token is kept); "About" the version and the non-affiliation notice.
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
  onConnect,
  onBack,
}: SettingsScreenProps): React.JSX.Element {
  const {t} = useTranslation();
  const [category, setCategory] = useState<SettingsCategory>('boards');
  // Diagnostics is hidden until About is pressed 7 times quickly.
  const [showDiagnostics, setShowDiagnostics] = useState(diagnosticsUnlocked);
  const aboutTaps = useRef(new RapidTapCounter()).current;

  const categories: {value: SettingsCategory; label: string}[] = [
    {value: 'boards', label: t('settings.boards')},
    {value: 'links', label: t('settings.links')},
    {value: 'trello', label: t('settings.trello')},
    {value: 'about', label: t('settings.about')},
    ...(showDiagnostics
      ? [
          {
            value: 'diagnostics' as const,
            label: t('settings.diagnostics'),
          },
        ]
      : []),
  ];

  const select = (value: SettingsCategory) => {
    setCategory(value);
    if (value === 'about' && !showDiagnostics && aboutTaps.tap()) {
      unlockDiagnostics();
      registerInspectButton().catch(error =>
        console.warn('[sINK] Failed to show the Inspect button', error),
      );
      setShowDiagnostics(true);
      setCategory('diagnostics');
    }
  };

  return (
    <ScreenFrame title={t('settings.title')} onBack={onBack} flush>
      <View style={styles.layout}>
        <View accessibilityRole="tablist" style={styles.sidebar}>
          {categories.map(item => {
            const selected = item.value === category;
            return (
              <React.Fragment key={item.value}>
                <Pressable
                  accessibilityRole="tab"
                  accessibilityState={{selected}}
                  onPress={() => select(item.value)}
                  style={styles.category}>
                  <Text
                    style={[styles.categoryLabel, selected && styles.bold]}
                    numberOfLines={1}>
                    {item.label}
                  </Text>
                  <View
                    style={[
                      styles.selectionBar,
                      selected && styles.selectionBarOn,
                    ]}
                  />
                </Pressable>
                <DottedSeparator />
              </React.Fragment>
            );
          })}
        </View>

        <ScrollView
          style={styles.panel}
          contentContainerStyle={styles.panelContent}>
          {category === 'boards' ? (
            <>
              <Section title={t('settings.publicBoards')}>
                <PublicBoardsSettings
                  client={client}
                  ensureNetwork={ensureNetwork}
                  preferences={boardsPreferences}
                  onChange={onBoardsPreferencesChange}
                />
              </Section>

              <BoardLayoutSettings store={store} />

              <BoardModeSettings store={store} />
            </>
          ) : category === 'links' ? (
            <NoteLinkSettings store={store} />
          ) : category === 'trello' ? (
            <>
              <Section title={t('settings.account')}>
                {member && tokenStorage ? (
                  <AccountCard
                    member={member}
                    tokenStorage={tokenStorage}
                    saveFailed={saveFailed}
                    onRememberChange={onRememberChange}
                    onDisconnect={onDisconnect}
                  />
                ) : (
                  <>
                    <Switch
                      label={t('settings.showConnectCard')}
                      help={t('settings.showConnectCardHelp')}
                      value={boardsPreferences.showConnectCard}
                      onChange={showConnectCard =>
                        onBoardsPreferencesChange({
                          ...boardsPreferences,
                          showConnectCard,
                        })
                      }
                    />
                    <SignedOutCard onConnect={onConnect} />
                  </>
                )}
              </Section>
            </>
          ) : category === 'about' ? (
            <AboutSettings />
          ) : (
            <Section title={t('settings.diagnostics')}>
              <InkLinkDiagnostics />
            </Section>
          )}
        </ScrollView>
      </View>
    </ScreenFrame>
  );
}

/** Categories of the left column, like the Supernote system settings. */
type SettingsCategory =
  | 'boards'
  | 'links'
  | 'trello'
  | 'about'
  | 'diagnostics';

/** Name, version and description of the plugin, then the non-affiliation notice. */
function AboutSettings(): React.JSX.Element {
  const {t} = useTranslation();
  return (
    <Section title={t('settings.about')}>
      <Text style={styles.name}>{t('app.name')}</Text>
      <Text style={styles.text}>
        {t('settings.version', {version: pluginConfig.versionName})}
      </Text>
      <Text style={styles.text}>{t('settings.aboutDescription')}</Text>
      <Text style={styles.disclaimer}>{t('settings.disclaimer')}</Text>
    </Section>
  );
}

/** Log of the s-INK link prototype, to check on the tablet what happens. */
function InkLinkDiagnostics(): React.JSX.Element {
  const {t} = useTranslation();
  const lines = useInkLinkLog();
  return (
    <View style={styles.diagnostics}>
      <View style={styles.diagnosticsHeader}>
        <Text style={[styles.text, styles.bold]}>
          {t('inkLink.diagnostics')}
        </Text>
        <SmallButton
          label={t('inkLink.clearLog')}
          accessibilityLabel={t('inkLink.clearLog')}
          onPress={clearInkLinkLog}
        />
      </View>
      <Text style={styles.logLine}>
        {lines.length ? lines.join('\n') : t('inkLink.emptyLog')}
      </Text>
    </View>
  );
}

/** Which tool opens an s-INK link tapped in a note. */
function NoteLinkSettings({store}: {store: KeyValueStore}): React.JSX.Element {
  const {t} = useTranslation();
  const [trigger, setTrigger] = useState<LinkTrigger>(getLinkTrigger);

  useEffect(() => {
    let active = true;
    loadLinkTrigger(store).then(loaded => {
      if (active) {
        setTrigger(loaded);
        setLinkTrigger(loaded);
      }
    });
    return () => {
      active = false;
    };
  }, [store]);

  const change = useCallback(
    (next: LinkTrigger) => {
      setTrigger(next);
      setLinkTrigger(next);
      saveLinkTrigger(store, next);
    },
    [store],
  );

  const triggers: {value: LinkTrigger; label: string}[] = [
    {value: 'finger', label: t('settings.linkTriggerFinger')},
    {value: 'pen', label: t('settings.linkTriggerPen')},
    {value: 'both', label: t('settings.linkTriggerBoth')},
  ];

  return (
    <Section title={t('settings.noteLinks')}>
      <SegmentedControl
        label={t('settings.linkTrigger')}
        help={t('settings.linkTriggerHelp')}
        segments={triggers}
        value={trigger}
        onChange={change}
      />
    </Section>
  );
}

/**
 * Column counts per orientation, the same settings the board view changes
 * from its toolbar: they are read and saved in the same place.
 */
function BoardLayoutSettings({
  store,
}: {
  store: KeyValueStore;
}): React.JSX.Element {
  const {t} = useTranslation();
  const [columns, setColumns] = useState<BoardPreferences>(DEFAULT_COLUMNS);

  useEffect(() => {
    let active = true;
    loadBoardPreferences(store).then(loaded => active && setColumns(loaded));
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

  const countsFor = (orientation: Orientation) =>
    COLUMN_COUNTS[orientation].map(count => ({
      value: count,
      label: String(count),
    }));

  return (
    <Section title={t('settings.boardLayouts')}>
      {(['portrait', 'landscape'] as const).map(orientation => (
        <View key={orientation} style={styles.columnsRow}>
          <TabletPreview
            orientation={orientation}
            columns={columns[orientation]}
          />
          <View style={styles.columnsControl}>
            <SegmentedControl
              label={t(
                orientation === 'portrait'
                  ? 'settings.columnsPortrait'
                  : 'settings.columnsLandscape',
              )}
              segments={countsFor(orientation)}
              value={columns[orientation]}
              onChange={count => changeColumns(orientation, count)}
            />
          </View>
        </View>
      ))}
    </Section>
  );
}

/**
 * Mode boards open in (all cards, focus or review), shared with the board
 * view's toolbar like the column counts.
 */
function BoardModeSettings({store}: {store: KeyValueStore}): React.JSX.Element {
  const {t} = useTranslation();
  const [focus, setFocus] = useState<FocusSettings>(DEFAULT_FOCUS_SETTINGS);

  useEffect(() => {
    let active = true;
    loadFocusSettings(store).then(loaded => active && setFocus(loaded));
    return () => {
      active = false;
    };
  }, [store]);

  const changeMode = useCallback(
    (choice: ModeChoice) => {
      const next = {...focus, mode: choice === 'all' ? null : choice};
      setFocus(next);
      saveFocusSettings(store, next);
    },
    [focus, store],
  );

  const modes: {value: ModeChoice; label: string}[] = [
    {value: 'all', label: t('settings.modeAll')},
    {value: 'focus', label: t('board.focus')},
    {value: 'review', label: t('board.review')},
  ];

  return (
    <Section title={t('settings.boardMode')}>
      <SegmentedControl
        label={t('settings.boardModeDefault')}
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

/**
 * No account connected: a way to connect. The "Quick connect button" switch
 * above it hides the "My boards" section (and its connect card) of the
 * boards page, for someone who only reads public boards.
 */
function SignedOutCard({
  onConnect,
}: {
  onConnect: () => void;
}): React.JSX.Element {
  const {t} = useTranslation();
  return (
    <View style={styles.card}>
      <Text style={[styles.text, styles.bold]}>
        {t('settings.notConnected')}
      </Text>
      <Text style={styles.text}>{t('boards.connectHint')}</Text>
      <Button primary label={t('boards.connectTitle')} onPress={onConnect} />
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

const SIDEBAR_WIDTH = 240;
const DOT_SIZE = 2;
/** Dots of a separator: one every three dot widths across the column. */
const DOT_COUNT = Math.floor(SIDEBAR_WIDTH / (DOT_SIZE * 3));

/**
 * Dotted line under a category. Drawn with small squares: Android renders
 * a dotted border on one side only unreliably.
 */
function DottedSeparator(): React.JSX.Element {
  return (
    <View style={styles.dots}>
      {Array.from({length: DOT_COUNT}, (_, index) => (
        <View key={index} style={styles.dot} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  layout: {
    flex: 1,
    flexDirection: 'row',
  },
  sidebar: {
    width: SIDEBAR_WIDTH,
    borderRightColor: colors.foreground,
    borderRightWidth: borders.width / 2,
  },
  category: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  categoryLabel: {
    flex: 1,
    color: colors.foreground,
    fontSize: typography.label,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  selectionBar: {
    width: borders.width * 2,
  },
  selectionBarOn: {
    backgroundColor: colors.foreground,
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    overflow: 'hidden',
    paddingHorizontal: spacing.xs,
  },
  dot: {
    width: DOT_SIZE,
    height: DOT_SIZE,
    backgroundColor: colors.foreground,
  },
  panel: {
    flex: 1,
  },
  panelContent: {
    padding: spacing.lg,
  },
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
  columnsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
  },
  columnsControl: {
    flex: 1,
  },
  diagnostics: {
    gap: spacing.sm,
    borderTopColor: colors.foreground,
    borderTopWidth: borders.width / 2,
    paddingTop: spacing.md,
  },
  diagnosticsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  logLine: {
    color: colors.foreground,
    fontSize: typography.small,
    fontFamily: 'monospace',
  },
});
