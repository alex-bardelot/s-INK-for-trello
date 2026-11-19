import React, {useCallback, useEffect, useRef, useState} from 'react';
import {Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';

import pluginConfig from '../../PluginConfig.json';
import {
  BoardMode,
  DEFAULT_FOCUS_SETTINGS,
  FocusSettings,
  focusLabelChoices,
  labelKey,
  loadFocusSettings,
  ModeChoice,
  ModeFilter,
  ModeMember,
  modeMemberChoices,
  ReviewCompletion,
  saveFocusSettings,
  SELF_MEMBER,
  toggleFocusLabel,
  toggleModeMember,
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
import {StartIcon} from '../components/ActionIcons';
import {BlockIcon} from '../components/BlockIcon';
import {Button} from '../components/Button';
import {ChainIcon} from '../components/ChainIcon';
import {
  ChipPickerButton,
  LabelChipContent,
  MemberChipContent,
} from '../components/ChipPicker';
import {
  FloatingPicker,
  FloatingPickerPosition,
  measurePickerPosition,
} from '../components/FloatingPicker';
import {ToggleChip} from '../components/ToggleChip';
import {GearIcon} from '../components/GearIcon';
import {MemberAvatar} from '../components/MemberAvatar';
import {ScreenFrame} from '../components/ScreenFrame';
import {SegmentedControl, SegmentGroup} from '../components/SegmentedControl';
import {SettingsSection} from '../components/SettingsSection';
import {
  HeartIcon,
  InfoIcon,
  InspectIcon,
  NewCardIcon,
} from '../components/SettingsIcons';
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
import {
  language,
  LANGUAGE_CHOICES,
  LANGUAGE_NAMES,
  LanguageChoice,
  loadLanguageChoice,
  saveLanguageChoice,
  useTranslation,
} from '../i18n';
import {registerInspectButton} from '../plugin/buttons';
import {TokenStorage} from '../session/trelloSession';
import {
  diagnosticsUnlocked,
  RapidTapCounter,
  unlockDiagnostics,
} from '../settings/rapidTaps';
import {KeyValueStore} from '../storage/keyValueStore';
import {
  isSupernoteRoadmap,
  TrelloBoard,
  TrelloBoardMember,
  TrelloClient,
  TrelloLabel,
  TrelloMember,
} from '../trello';
import {NewCardSettingsPanel} from './NewCardSettingsPanel';
import {PublicBoardsSettings} from './PublicBoardsSettings';
import {SupportSettings} from './SupportSettings';
import {
  NoteTemplateScreen,
  StartWorkSettingsPanel,
} from './StartWorkSettingsPanel';
import {
  RELEASE_NOTES,
  ReleaseNotesScreen,
  ReleaseNoteView,
} from './ReleaseNotes';
import {borders, colors, spacing, typography} from '../theme';

const AVATAR_SIZE = 64;

export interface SettingsScreenProps {
  /**
   * Selected category, kept by the parent so that it survives the
   * connection screen opening over Settings.
   */
  category: SettingsCategory;
  onCategoryChange: (category: SettingsCategory) => void;
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
  /** Board Settings was opened from, if any: Start work offers its labels. */
  currentBoard?: TrelloBoard | null;
}

/**
 * Settings that are rarely needed, kept off the boards page. Laid out like
 * the Supernote system settings: categories in a left column, separated by
 * dotted lines, and the selected one's sections on the right. "General"
 * holds the public boards (and the "+" card adding one), the Trello account
 * (where its token is kept, or the connect card when signed out) and the
 * language; "Board" the settings of an open board (layout and mode); "New
 * card" what the New Trello Card page offers and does; "Start
 * work" what the Start button of a card does; "Links"
 * the tool opening s-INK links; "Support s-INK" feedback (through
 * InkHub) and donations toward the funding goal; "About" the version and the
 * non-affiliation notice.
 */
export function SettingsScreen({
  category,
  onCategoryChange: setCategory,
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
  currentBoard = null,
}: SettingsScreenProps): React.JSX.Element {
  const {t} = useTranslation();
  // Diagnostics is hidden until About is pressed 7 times quickly.
  const [showDiagnostics, setShowDiagnostics] = useState(diagnosticsUnlocked);
  const aboutTaps = useRef(new RapidTapCounter()).current;
  // Sub page of About listing every release.
  const [releaseNotesOpen, setReleaseNotesOpen] = useState(false);
  // Sub page of Start work listing the note templates, drawn over Settings
  // so that it comes back to the same place; the panel then reads the
  // template chosen there.
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [templateChanges, setTemplateChanges] = useState(0);

  const categories: {value: SettingsCategory; label: string}[] = [
    {value: 'general', label: t('settings.general')},
    {value: 'boards', label: t('settings.boards')},
    {value: 'newCard', label: t('settings.newCard')},
    {value: 'startWork', label: t('settings.startWork')},
    {value: 'links', label: t('settings.links')},
    {value: 'support', label: t('settings.support')},
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

  if (releaseNotesOpen) {
    return <ReleaseNotesScreen onBack={() => setReleaseNotesOpen(false)} />;
  }

  return (
    <View style={styles.screen}>
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
                    <View style={styles.categoryIcon}>
                      <CategoryIcon category={item.value} />
                    </View>
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
            {category === 'general' ? (
              <>
                <Section title={t('settings.publicBoards')}>
                  {/* The "+" card adding a public board on the boards page. */}
                  <Switch
                    label={t('settings.showAddPublicBoard')}
                    help={t('settings.showAddPublicBoardHelp')}
                    value={boardsPreferences.showAddPublicBoard}
                    onChange={showAddPublicBoard =>
                      onBoardsPreferencesChange({
                        ...boardsPreferences,
                        showAddPublicBoard,
                      })
                    }
                  />
                  <PublicBoardsSettings
                    client={client}
                    ensureNetwork={ensureNetwork}
                    preferences={boardsPreferences}
                    onChange={onBoardsPreferencesChange}
                  />
                </Section>

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
                      <SignedOutCard onConnect={onConnect} />
                      {/* Signed in, the boards page has no connect button. */}
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
                    </>
                  )}
                </Section>

                <LanguageSettings store={store} />
              </>
            ) : category === 'boards' ? (
              <BoardPageSettings
                store={store}
                client={client}
                board={currentBoard}
                member={member}
              />
            ) : category === 'newCard' ? (
              <NewCardSettingsPanel store={store} />
            ) : category === 'startWork' ? (
              <StartWorkSettingsPanel
                store={store}
                client={client}
                board={currentBoard}
                reloadKey={templateChanges}
                onBrowseTemplates={() => setTemplatesOpen(true)}
              />
            ) : category === 'links' ? (
              <NoteLinkSettings store={store} />
            ) : category === 'support' ? (
              <SupportSettings store={store} ensureNetwork={ensureNetwork} />
            ) : category === 'about' ? (
              <AboutSettings
                onOpenReleaseNotes={() => setReleaseNotesOpen(true)}
              />
            ) : (
              <Section title={t('settings.diagnostics')}>
                <InkLinkDiagnostics />
              </Section>
            )}
          </ScrollView>
        </View>
      </ScreenFrame>
      {templatesOpen && (
        <View style={styles.subPage}>
          <NoteTemplateScreen
            store={store}
            onBack={changed => {
              setTemplatesOpen(false);
              if (changed) {
                setTemplateChanges(count => count + 1);
              }
            }}
          />
        </View>
      )}
    </View>
  );
}

/** Categories of the left column, like the Supernote system settings. */
export type SettingsCategory =
  | 'general'
  | 'boards'
  | 'newCard'
  | 'startWork'
  | 'links'
  | 'support'
  | 'about'
  | 'diagnostics';

/** Name, version and description of the plugin, then the non-affiliation notice. */
function AboutSettings({
  onOpenReleaseNotes,
}: {
  onOpenReleaseNotes: () => void;
}): React.JSX.Element {
  const {t} = useTranslation();
  const latest = RELEASE_NOTES[0];
  return (
    <>
      <Section title={t('settings.about')}>
        <Text style={styles.name}>{t('app.name')}</Text>
        <Text style={styles.text}>
          {t('settings.version', {version: pluginConfig.versionName})}
        </Text>
        <Text style={styles.text}>{t('settings.aboutDescription')}</Text>
        <Text style={styles.disclaimer}>{t('settings.disclaimer')}</Text>
      </Section>

      {/* The latest release only; the others are one tap away. */}
      <Section title={t('settings.releaseNotesLatest')}>
        {latest && <ReleaseNoteView note={latest} />}
        <View style={styles.actions}>
          <Button
            label={t('settings.releaseNotesAll')}
            onPress={onOpenReleaseNotes}
          />
        </View>
      </Section>
    </>
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

/**
 * Language of the plugin: the Supernote's ("System") or a fixed one, each
 * named in itself. The toolbar and lasso buttons follow it too.
 */
function LanguageSettings({store}: {store: KeyValueStore}): React.JSX.Element {
  const {t} = useTranslation();
  const [choice, setChoice] = useState<LanguageChoice>(() =>
    language.getChoice(),
  );

  useEffect(() => {
    let active = true;
    loadLanguageChoice(store).then(loaded => {
      if (active) {
        setChoice(loaded);
        language.setChoice(loaded);
      }
    });
    return () => {
      active = false;
    };
  }, [store]);

  const change = useCallback(
    (next: LanguageChoice) => {
      setChoice(next);
      language.setChoice(next);
      saveLanguageChoice(store, next);
    },
    [store],
  );

  const choices = LANGUAGE_CHOICES.map(value => ({
    value,
    label:
      value === 'system' ? t('settings.languageSystem') : LANGUAGE_NAMES[value],
  }));

  return (
    <Section title={t('settings.language')}>
      {/* The choices speak for themselves: no label or help text. */}
      <View style={styles.languageRow}>
        <SegmentGroup
          label={t('settings.language')}
          segments={choices}
          value={choice}
          onChange={change}
        />
      </View>
    </Section>
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
 * The Board category: column counts, opening mode and what the Focus and
 * Review modes keep. They are read before anything is drawn, so the
 * controls do not first show the defaults and then jump to the saved values.
 */
function BoardPageSettings({
  store,
  client,
  board,
  member,
}: {
  store: KeyValueStore;
  client: TrelloClient;
  /** Board Settings was opened from, whose labels and members modes offer. */
  board: TrelloBoard | null;
  member: TrelloMember | null;
}): React.JSX.Element {
  const [loaded, setLoaded] = useState<{
    columns: BoardPreferences;
    focus: FocusSettings;
  } | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([loadBoardPreferences(store), loadFocusSettings(store)])
      .catch(() => [DEFAULT_COLUMNS, DEFAULT_FOCUS_SETTINGS] as const)
      .then(([columns, focus]) => active && setLoaded({columns, focus}));
    return () => {
      active = false;
    };
  }, [store]);

  if (!loaded) {
    return <></>;
  }
  return (
    <>
      <BoardLayoutSettings store={store} initial={loaded.columns} />

      <BoardModeSettings
        store={store}
        client={client}
        // Supernote's roadmap has no modes: its tags are not offered.
        board={board && !isSupernoteRoadmap(board) ? board : null}
        member={member}
        initial={loaded.focus}
      />
    </>
  );
}

/**
 * Column counts per orientation, the same settings the board view changes
 * from its toolbar: they are read and saved in the same place.
 */
function BoardLayoutSettings({
  store,
  initial,
}: {
  store: KeyValueStore;
  initial: BoardPreferences;
}): React.JSX.Element {
  const {t} = useTranslation();
  const [columns, setColumns] = useState<BoardPreferences>(initial);

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
 * Labels and members of the board Settings was opened from, offered to the
 * Focus and Review modes.
 */
type BoardChoicesState =
  | {status: 'noBoard' | 'loading' | 'failed'}
  | {status: 'loaded'; labels: TrelloLabel[]; members: TrelloBoardMember[]};

/**
 * Mode boards open in (all cards, focus or review), shared with the board
 * view's toolbar like the column counts, then a sub-section per mode with
 * the labels and members it keeps (and, for Review, the completion).
 * Opened from a board, the labels and members offered are that board's;
 * otherwise only the checked ones are listed, so that they can be
 * unchecked. The tablet's account is always offered.
 */
function BoardModeSettings({
  store,
  client,
  board,
  member,
  initial,
}: {
  store: KeyValueStore;
  client: TrelloClient;
  board: TrelloBoard | null;
  /** The connected member, offered as the tablet's account. */
  member: TrelloMember | null;
  initial: FocusSettings;
}): React.JSX.Element {
  const {t} = useTranslation();
  const [settings, setSettings] = useState<FocusSettings>(initial);
  const [choices, setChoices] = useState<BoardChoicesState>({
    status: board ? 'loading' : 'noBoard',
  });

  const update = useCallback(
    (change: Partial<FocusSettings>) => {
      const next = {...settings, ...change};
      setSettings(next);
      saveFocusSettings(store, next);
    },
    [settings, store],
  );
  const changeMode = useCallback(
    (choice: ModeChoice) => update({mode: choice === 'all' ? null : choice}),
    [update],
  );
  // Turned off, boards show all their cards; turned on again, they still
  // do until a mode is chosen.
  const changeEnabled = useCallback(
    (enabled: boolean) => {
      setPicker(null);
      update(enabled ? {enabled} : {enabled, mode: null});
    },
    [update],
  );

  // The floating list of the board's labels or members, as on the New
  // Trello Card page, drawn over the whole section under the "+" pressed.
  const areaRef = useRef<View>(null);
  const [picker, setPicker] = useState<{
    mode: BoardMode;
    kind: ModePickerKind;
    position: FloatingPickerPosition;
  } | null>(null);
  const openPicker = (mode: BoardMode, kind: ModePickerKind, button: View) => {
    if (areaRef.current) {
      measurePickerPosition(button, areaRef.current).then(position =>
        setPicker({mode, kind, position}),
      );
    }
  };
  const changeFocus = (focus: ModeFilter) => update({focus});
  const changeReview = (filter: ModeFilter) =>
    update({review: {...settings.review, ...filter}});

  const loadChoices = useCallback(() => {
    if (!board) {
      setChoices({status: 'noBoard'});
      return () => {};
    }
    let active = true;
    setChoices({status: 'loading'});
    Promise.all([
      client.getBoardLabels(board.id),
      client.getBoardMembers(board.id),
    ])
      .then(
        ([labels, members]) =>
          active &&
          setChoices({
            status: 'loaded',
            // Labels without a name are only a color: not offered.
            labels: labels.filter(label => labelKey(label.name) !== ''),
            members,
          }),
      )
      .catch(error => {
        console.warn('[sINK] Failed to read the board labels and members', error);
        if (active) {
          setChoices({status: 'failed'});
        }
      });
    return () => {
      active = false;
    };
  }, [board, client]);
  useEffect(loadChoices, [loadChoices]);

  const boardNote =
    choices.status === 'noBoard'
      ? t('settings.modeChoicesNoBoard')
      : choices.status === 'loading'
      ? t('settings.modeChoicesLoading')
      : choices.status === 'failed'
      ? t('settings.modeChoicesFailed')
      : null;
  const boardLabels = choices.status === 'loaded' ? choices.labels : [];
  const boardMembers = choices.status === 'loaded' ? choices.members : [];

  const modes: {value: ModeChoice; label: string}[] = [
    {value: 'all', label: t('settings.modeAll')},
    {value: 'focus', label: t('board.focus')},
    {value: 'review', label: t('board.review')},
  ];
  const completions: {value: ReviewCompletion; label: string}[] = [
    {value: 'all', label: t('settings.reviewAll')},
    {value: 'complete', label: t('settings.reviewComplete')},
    {value: 'incomplete', label: t('settings.reviewIncomplete')},
  ];

  const pickerFilter = picker
    ? picker.mode === 'focus'
      ? settings.focus
      : settings.review
    : null;
  const labelRows = (filter: ModeFilter) =>
    focusLabelChoices(
      boardLabels.map(label => label.name),
      filter.labels,
    ).map(name => ({
      id: labelKey(name),
      name,
      selected: filter.labels.some(label => labelKey(label) === labelKey(name)),
      content: (
        <LabelChipContent name={name} color={labelColor(boardLabels, name)} />
      ),
    }));
  const memberChoices = (filter: ModeFilter) =>
    modeMemberChoices(boardMembers, filter.members, member?.id ?? null);
  const memberRows = (filter: ModeFilter) =>
    memberChoices(filter).map(choice => {
      const shown = shownMember(choice, boardMembers, member, t);
      return {
        id: choice.id,
        name: shown.name,
        selected: filter.members.some(m => m.id === choice.id),
        content: <MemberChipContent {...shown} />,
      };
    });
  const pickerRows =
    picker && pickerFilter
      ? picker.kind === 'labels'
        ? labelRows(pickerFilter)
        : memberRows(pickerFilter)
      : [];
  const togglePicked = (id: string) => {
    if (!picker || !pickerFilter) {
      return;
    }
    let next: ModeFilter | null = null;
    if (picker.kind === 'labels') {
      const row = pickerRows.find(candidate => candidate.id === id);
      if (row) {
        next = {
          ...pickerFilter,
          labels: toggleFocusLabel(pickerFilter.labels, row.name),
        };
      }
    } else {
      const choice = memberChoices(pickerFilter).find(
        candidate => candidate.id === id,
      );
      if (choice) {
        next = {
          ...pickerFilter,
          members: toggleModeMember(pickerFilter.members, choice),
        };
      }
    }
    if (next) {
      (picker.mode === 'focus' ? changeFocus : changeReview)(next);
    }
  };

  return (
    <View
      ref={areaRef}
      collapsable={false}
      // Tall enough for the floating list opened near its bottom.
      style={
        picker && {
          minHeight: picker.position.top + picker.position.maxHeight,
        }
      }>
      <Section title={t('settings.boardMode')}>
        <Switch
          label={t('settings.modesEnabled')}
          help={t('settings.modesEnabledHelp')}
          value={settings.enabled}
          onChange={changeEnabled}
        />

        {settings.enabled && (
          <>
            <SegmentedControl
              label={t('settings.boardModeDefault')}
              help={t('settings.boardModeHelp')}
              segments={modes}
              value={settings.mode ?? 'all'}
              onChange={changeMode}
            />

            {boardNote && <Text style={styles.modeHelp}>{boardNote}</Text>}
            {choices.status === 'failed' && (
              <View style={styles.tagsRetry}>
                <SmallButton
                  label={t('common.retry')}
                  accessibilityLabel={t('common.retry')}
                  onPress={loadChoices}
                />
              </View>
            )}

            <ModeFilterSettings
              title={t('settings.focusSection')}
              help={t('settings.focusHelp')}
              filter={settings.focus}
              boardLabels={boardLabels}
              boardMembers={boardMembers}
              member={member}
              boardOpen={!!board}
              onChange={changeFocus}
              onPick={(kind, button) => openPicker('focus', kind, button)}
            />

            <ModeFilterSettings
              title={t('settings.reviewSection')}
              help={t('settings.reviewHelp')}
              filter={settings.review}
              boardLabels={boardLabels}
              boardMembers={boardMembers}
              member={member}
              boardOpen={!!board}
              onChange={changeReview}
              onPick={(kind, button) => openPicker('review', kind, button)}>
              <SegmentedControl
                label={t('settings.reviewCompletion')}
                segments={completions}
                value={settings.review.completion}
                onChange={completion =>
                  update({review: {...settings.review, completion}})
                }
              />
            </ModeFilterSettings>
          </>
        )}
      </Section>

      {picker && (
        <FloatingPicker
          title={t(picker.kind === 'labels' ? 'card.labels' : 'card.members')}
          position={picker.position}
          closeLabel={t('common.close')}
          onClose={() => setPicker(null)}
          emptyMessage={
            choices.status === 'loaded'
              ? t('settings.modeLabelsNone')
              : choices.status === 'failed'
              ? t('settings.modeChoicesFailed')
              : t('settings.modeChoicesLoading')
          }
          rows={pickerRows}
          onToggle={togglePicked}
        />
      )}
    </View>
  );
}

/** What a "+" of the mode settings opens. */
type ModePickerKind = 'labels' | 'members';

/**
 * Name and avatar a mode member shows: the tablet's account as "Name (this
 * tablet)" with its avatar, others with their avatar when on the board.
 */
function shownMember(
  choice: ModeMember,
  boardMembers: readonly TrelloBoardMember[],
  member: TrelloMember | null,
  t: ReturnType<typeof useTranslation>['t'],
): {name: string; initials?: string; avatarUrl?: string | null} {
  if (choice.id === SELF_MEMBER) {
    return member
      ? {
          name: t('settings.modeSelf', {name: member.fullName}),
          initials: member.initials,
          avatarUrl: member.avatarUrl,
        }
      : {name: t('settings.modeSelfSignedOut'), initials: '?'};
  }
  const onBoard = boardMembers.find(candidate => candidate.id === choice.id);
  return onBoard
    ? {
        name: onBoard.fullName,
        initials: onBoard.initials,
        avatarUrl: onBoard.avatarUrl,
      }
    : {name: choice.name};
}

/** Color of the board label of that name; `null` when not on the board. */
function labelColor(
  labels: readonly TrelloLabel[],
  name: string,
): string | null {
  return (
    labels.find(label => labelKey(label.name) === labelKey(name))?.color ??
    null
  );
}

/**
 * Sub-section of the Mode section for one mode: its help, any control of
 * its own (`children`), then the labels and the members it keeps, as on
 * the New Trello Card page: chips (a tap takes one off) and a "+" opening
 * the floating list. Labels need a board; the tablet's account can always
 * be added.
 */
function ModeFilterSettings({
  title,
  help,
  filter,
  boardLabels,
  boardMembers,
  member,
  boardOpen,
  onChange,
  onPick,
  children,
}: {
  title: string;
  help: string;
  filter: ModeFilter;
  boardLabels: readonly TrelloLabel[];
  boardMembers: readonly TrelloBoardMember[];
  member: TrelloMember | null;
  /** Whether Settings was opened from a board, whose labels "+" lists. */
  boardOpen: boolean;
  onChange: (filter: ModeFilter) => void;
  /** Opens the labels or members under the "+" pressed. */
  onPick: (kind: ModePickerKind, button: View) => void;
  children?: React.ReactNode;
}): React.JSX.Element {
  const {t} = useTranslation();
  const labelsButton = useRef<View>(null);
  const membersButton = useRef<View>(null);
  const pick = (kind: ModePickerKind, button: React.RefObject<View | null>) =>
    button.current && onPick(kind, button.current);

  return (
    <View style={styles.modeFilter}>
      <Text accessibilityRole="header" style={styles.modeFilterTitle}>
        {title}
      </Text>
      <Text style={styles.modeHelp}>{help}</Text>
      {children}

      <Text style={styles.modeGroupTitle}>{t('settings.modeLabels')}</Text>
      <View style={styles.labelChips}>
        {filter.labels.map(name => (
          <ToggleChip
            key={labelKey(name)}
            selected
            accessibilityLabel={t('card.remove', {name})}
            onPress={() =>
              onChange({
                ...filter,
                labels: toggleFocusLabel(filter.labels, name),
              })
            }>
            <LabelChipContent name={name} color={labelColor(boardLabels, name)} />
          </ToggleChip>
        ))}
        {boardOpen && (
          <ChipPickerButton
            buttonRef={labelsButton}
            label={t('card.pickLabel')}
            onPress={() => pick('labels', labelsButton)}
          />
        )}
        {filter.labels.length === 0 && !boardOpen && (
          <Text style={styles.modeHelp}>{t('settings.modeLabelsAny')}</Text>
        )}
      </View>

      <Text style={styles.modeGroupTitle}>{t('settings.modeMembers')}</Text>
      <View style={styles.labelChips}>
        {filter.members.map(choice => {
          const shown = shownMember(choice, boardMembers, member, t);
          return (
            <ToggleChip
              key={choice.id}
              selected
              accessibilityLabel={t('card.remove', {name: shown.name})}
              onPress={() =>
                onChange({
                  ...filter,
                  members: toggleModeMember(filter.members, choice),
                })
              }>
              <MemberChipContent {...shown} />
            </ToggleChip>
          );
        })}
        <ChipPickerButton
          buttonRef={membersButton}
          label={t('card.pickMember')}
          onPress={() => pick('members', membersButton)}
        />
        {filter.members.length === 0 && (
          <Text style={styles.modeHelp}>{t('settings.modeMembersAny')}</Text>
        )}
      </View>
    </View>
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
 * No account connected: a way to connect. The "Trello connect button" switch
 * under it hides the "My boards" section (and its connect
 * card) of the boards page, for someone who only reads public boards.
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

const Section = SettingsSection;

/** Size of the icon in front of each category name. */
const CATEGORY_ICON_SIZE = typography.icon;
/** Wide enough for the longest category names beside their icon. */
const SIDEBAR_WIDTH = 300;

/**
 * Icon in front of a category name: the same signs as elsewhere in the
 * plugin where there is one (gear, board, play, chain), and a heart for
 * Support s-INK.
 */
function CategoryIcon({
  category,
}: {
  category: SettingsCategory;
}): React.JSX.Element {
  const size = CATEGORY_ICON_SIZE;
  const color = colors.foreground;
  switch (category) {
    case 'general':
      return (
        <GearIcon size={size} color={color} holeColor={colors.background} />
      );
    case 'boards':
      return <BlockIcon kind="board" size={size} color={color} />;
    case 'newCard':
      return <NewCardIcon size={size} color={color} />;
    case 'startWork':
      return <StartIcon size={size} color={color} />;
    case 'links':
      return <ChainIcon size={size} color={color} />;
    case 'support':
      return <HeartIcon size={size} color={color} />;
    case 'about':
      return <InfoIcon size={size} color={color} />;
    case 'diagnostics':
      return <InspectIcon size={size} color={color} />;
  }
}
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
  screen: {
    flex: 1,
  },
  subPage: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.background,
  },
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
  categoryIcon: {
    justifyContent: 'center',
    paddingLeft: spacing.md,
  },
  categoryLabel: {
    flex: 1,
    color: colors.foreground,
    fontSize: typography.label,
    paddingLeft: spacing.sm + spacing.xs,
    paddingRight: spacing.md,
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
  languageRow: {
    // The segments keep their own width instead of the panel's.
    alignItems: 'flex-start',
    paddingVertical: spacing.sm,
  },
  columnsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
  },
  columnsControl: {
    flex: 1,
  },
  modeFilter: {
    gap: spacing.xs,
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopColor: colors.foreground,
    borderTopWidth: borders.width / 2,
  },
  modeFilterTitle: {
    color: colors.foreground,
    fontSize: typography.label,
    fontWeight: '700',
  },
  modeGroupTitle: {
    color: colors.foreground,
    fontSize: typography.label,
    fontWeight: '600',
    paddingTop: spacing.sm,
  },
  modeHelp: {
    color: colors.foreground,
    fontSize: typography.small,
  },
  labelChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.sm,
    paddingTop: spacing.xs,
  },
  tagsRetry: {
    alignItems: 'flex-start',
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
