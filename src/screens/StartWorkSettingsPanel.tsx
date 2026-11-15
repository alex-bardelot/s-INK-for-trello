import React, {useCallback, useEffect, useState} from 'react';
import {
  Image,
  ImageSourcePropType,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';

import {Button} from '../components/Button';
import {CloseIcon} from '../components/CloseIcon';
import {ScreenFrame} from '../components/ScreenFrame';
import {SettingsSection} from '../components/SettingsSection';
import {Switch} from '../components/Switch';
import {ToggleChip} from '../components/ToggleChip';
import {WaitingBox} from '../components/WaitingBox';
import {labelKey} from '../board/focus';
import {labelShade} from '../board/labels';
import {TrelloBoard, TrelloClient, TrelloLabel} from '../trello';
import {useTranslation} from '../i18n';
import {
  listCustomTemplates,
  listSystemTemplates,
  PACKAGED_TEMPLATES,
} from '../startWork/cardNote';
import {
  addLabelName,
  BLANK_TEMPLATE_CHOICE,
  cleanName,
  DEFAULT_START_WORK_SETTINGS,
  loadStartWorkSettings,
  NoteTemplateChoice,
  removeLabelName,
  saveStartWorkSettings,
  START_WORK_NAME_MAX_LENGTH,
  StartWorkSettings,
  templateChoiceKey,
} from '../startWork/settings';
import {
  CARD_NOTES_FOLDER,
  matchSystemTemplate,
  systemTemplateLabel,
  templateFileLabel,
  TEMPLATES_FOLDER,
} from '../startWork/noteFiles';
import {KeyValueStore} from '../storage/keyValueStore';
import {borders, colors, spacing, typography} from '../theme';

/**
 * "Start work" category of Settings: what the **Start** button of a card
 * does. Each action has its own switch, but the labels: those taken off
 * (−) and put on (+) are listed side by side, and none listed changes
 * none. The note template is only shown; it is changed on a page of its
 * own, which lists the templates.
 */
export function StartWorkSettingsPanel({
  store,
  client,
  board,
  reloadKey = 0,
  onBrowseTemplates,
}: {
  store: KeyValueStore;
  client: TrelloClient;
  /** Board Settings was opened from, whose labels **Add** offers. */
  board: TrelloBoard | null;
  /** Changes when the settings were saved elsewhere, to read them again. */
  reloadKey?: number;
  /** Opens the page listing the templates, to choose another. */
  onBrowseTemplates: () => void;
}): React.JSX.Element {
  const {t} = useTranslation();
  const [settings, setSettings] = useState<StartWorkSettings>(
    DEFAULT_START_WORK_SETTINGS,
  );

  useEffect(() => {
    let active = true;
    loadStartWorkSettings(store).then(loaded => active && setSettings(loaded));
    return () => {
      active = false;
    };
  }, [store, reloadKey]);

  const change = useCallback(
    (patch: Partial<StartWorkSettings>) => {
      const next = {...settings, ...patch};
      setSettings(next);
      saveStartWorkSettings(store, next);
    },
    [settings, store],
  );

  // The named labels of the board Settings was opened from, read once
  // **Add** is first pressed.
  const [labelsState, setLabelsState] = useState<BoardLabelsState>({
    status: 'idle',
  });
  const boardLabels: BoardLabels | null = board
    ? {
        boardName: board.name,
        state: labelsState,
        load: () => {
          if (labelsState.status === 'loading') {
            return;
          }
          setLabelsState({status: 'loading'});
          client
            .getBoardLabels(board.id)
            .then(labels =>
              setLabelsState({
                status: 'loaded',
                labels: labels.filter(label => label.name.trim() !== ''),
              }),
            )
            .catch(error => {
              console.warn('[sINK] Failed to read the board labels', error);
              setLabelsState({status: 'failed'});
            });
        },
      }
    : null;

  return (
    <>
      <SettingsSection title={t('settings.startWork')}>
        <Text style={styles.text}>{t('startWork.settingsIntro')}</Text>
      </SettingsSection>

      <SettingsSection title={t('startWork.membersSection')}>
        <Switch
          label={t('startWork.assignMe')}
          help={t('startWork.assignMeHelp')}
          value={settings.assignMe}
          onChange={assignMe => change({assignMe})}
        />
      </SettingsSection>

      <SettingsSection title={t('startWork.labelsSection')}>
        <Text style={styles.small}>{t('startWork.labelsHelp')}</Text>
        <View style={styles.labelSides}>
          <LabelNamesSide
            sign="−"
            accessibilityLabel={t('startWork.labelsRemoved')}
            names={settings.removeLabelNames}
            onChange={removeLabelNames => change({removeLabelNames})}
            boardLabels={boardLabels}
          />
          <LabelNamesSide
            sign="+"
            accessibilityLabel={t('startWork.labelsAdded')}
            names={settings.addLabelNames}
            onChange={addLabelNames => change({addLabelNames})}
            boardLabels={boardLabels}
          />
        </View>
      </SettingsSection>

      <SettingsSection title={t('startWork.listSection')}>
        <Switch
          label={t('startWork.moveToList')}
          help={t('startWork.moveToListHelp')}
          value={settings.moveToList}
          onChange={moveToList => change({moveToList})}
        />
        {settings.moveToList && (
          <ListNameInput
            value={settings.listName}
            onChange={listName => change({listName})}
          />
        )}
      </SettingsSection>

      <SettingsSection title={t('startWork.noteSection')}>
        <Switch
          label={t('startWork.createNote')}
          help={t('startWork.createNoteHelp', {folder: CARD_NOTES_FOLDER})}
          value={settings.createNote}
          onChange={createNote => change({createNote})}
          // The note's template, which a tap changes on a page of its own.
          accessory={
            settings.createNote ? (
              <CurrentTemplate
                value={settings.noteTemplate}
                onPress={onBrowseTemplates}
              />
            ) : null
          }
        />
      </SettingsSection>
    </>
  );
}

interface TemplateOption {
  choice: NoteTemplateChoice;
  label: string;
  preview: ImageSourcePropType | null;
}

/**
 * The chosen template alone, with its preview: the tablet's templates are
 * only listed to find this one's picture, none of theirs is loaded.
 */
function CurrentTemplate({
  value,
  onPress,
}: {
  value: NoteTemplateChoice;
  onPress: () => void;
}): React.JSX.Element {
  const {t} = useTranslation();
  const {width, height} = useWindowDimensions();
  const portrait = height >= width;
  const [option, setOption] = useState<TemplateOption | null>(null);

  useEffect(() => {
    let active = true;
    const show = (next: TemplateOption) => active && setOption(next);
    switch (value.kind) {
      case 'blank':
        show({
          choice: value,
          label: t('startWork.templateBlank'),
          preview:
            PACKAGED_TEMPLATES[portrait ? 'portrait' : 'landscape'].asset,
        });
        break;
      case 'file':
        show({
          choice: value,
          label: value.name,
          preview: {uri: `file://${value.path}`},
        });
        break;
      case 'system':
        show({
          choice: value,
          label: systemTemplateLabel(value.name),
          preview: null,
        });
        listSystemTemplates().then(system => {
          const name = matchSystemTemplate(
            value.name,
            system.map(template => template.name),
          );
          const found = system.find(template => template.name === name);
          const uri = found && (portrait ? found.vUri : found.hUri);
          if (found) {
            show({
              choice: value,
              label: systemTemplateLabel(found.name),
              preview: uri ? {uri} : null,
            });
          }
        });
        break;
    }
    return () => {
      active = false;
    };
  }, [portrait, t, value]);

  return option ? (
    <TemplateTile
      option={option}
      portrait={portrait}
      selected={false}
      onPress={onPress}
    />
  ) : (
    <View />
  );
}

/**
 * Page of Settings listing the templates of card notes: a tap picks one,
 * **Use this template** saves it and goes back to Settings.
 */
export function NoteTemplateScreen({
  store,
  onBack,
}: {
  store: KeyValueStore;
  /** Goes back to Settings, saying whether another template was saved. */
  onBack: (changed: boolean) => void;
}): React.JSX.Element {
  const {t} = useTranslation();
  const [settings, setSettings] = useState<StartWorkSettings | null>(null);
  const [draft, setDraft] = useState<NoteTemplateChoice | null>(null);

  useEffect(() => {
    let active = true;
    loadStartWorkSettings(store).then(loaded => {
      if (active) {
        setSettings(loaded);
        setDraft(loaded.noteTemplate);
      }
    });
    return () => {
      active = false;
    };
  }, [store]);

  const unchanged =
    !settings ||
    !draft ||
    templateChoiceKey(draft) === templateChoiceKey(settings.noteTemplate);
  const confirm = async () => {
    if (settings && draft) {
      await saveStartWorkSettings(store, {...settings, noteTemplate: draft});
    }
    onBack(true);
  };

  return (
    <ScreenFrame
      title={t('startWork.templateSection')}
      onBack={() => onBack(false)}
      actions={
        <Button
          primary
          disabled={unchanged}
          label={t('startWork.templateChoose')}
          onPress={confirm}
        />
      }>
      <ScrollView contentContainerStyle={styles.templatePage}>
        <Text style={styles.small}>
          {t('startWork.templateHelp', {folder: TEMPLATES_FOLDER})}
        </Text>
        {draft && <TemplatePicker value={draft} onChange={setDraft} />}
      </ScrollView>
    </ScreenFrame>
  );
}

type TemplateList =
  | {status: 'loading'}
  | {
      status: 'loaded';
      custom: TemplateOption[];
      system: TemplateOption[];
      customDir: string;
    };

/**
 * Templates as tiles with a small preview: the blank page of s-INK, the
 * user's own templates (PNG files of `MyStyle`), then the tablet's.
 */
function TemplatePicker({
  value,
  onChange,
}: {
  value: NoteTemplateChoice;
  onChange: (choice: NoteTemplateChoice) => void;
}): React.JSX.Element {
  const {t} = useTranslation();
  const {width, height} = useWindowDimensions();
  const portrait = height >= width;
  const [list, setList] = useState<TemplateList>({status: 'loading'});

  useEffect(() => {
    let active = true;
    Promise.all([listCustomTemplates(), listSystemTemplates()]).then(
      ([custom, system]) => {
        if (!active) {
          return;
        }
        setList({
          status: 'loaded',
          customDir: custom.dir,
          custom: custom.paths.map(path => {
            const name = templateFileLabel(path);
            return {
              choice: {kind: 'file', path, name},
              label: name,
              preview: {uri: `file://${path}`},
            };
          }),
          system: system
            .filter(template => template.name !== 'style_white')
            .map(template => {
              const uri = portrait ? template.vUri : template.hUri;
              return {
                choice: {kind: 'system', name: template.name},
                label: systemTemplateLabel(template.name),
                preview: uri ? {uri} : null,
              };
            }),
        });
      },
    );
    return () => {
      active = false;
    };
  }, [portrait]);

  const blank: TemplateOption = {
    choice: BLANK_TEMPLATE_CHOICE,
    label: t('startWork.templateBlank'),
    preview: PACKAGED_TEMPLATES[portrait ? 'portrait' : 'landscape'].asset,
  };
  const selected = templateChoiceKey(value);

  const tiles = (options: TemplateOption[]) => (
    <View style={styles.tiles}>
      {options.map(option => (
        <TemplateTile
          key={templateChoiceKey(option.choice)}
          option={option}
          portrait={portrait}
          selected={templateChoiceKey(option.choice) === selected}
          onPress={() => onChange(option.choice)}
        />
      ))}
    </View>
  );

  return (
    <View style={styles.templates}>
      {tiles([blank])}
      {list.status === 'loading' ? (
        <WaitingBox message={t('startWork.templateLoading')} />
      ) : (
        <>
          <Text style={styles.groupTitle}>{t('startWork.templateCustom')}</Text>
          {list.custom.length > 0 ? (
            tiles(list.custom)
          ) : (
            <Text style={styles.small}>
              {t('startWork.templateNoCustom', {folder: list.customDir})}
            </Text>
          )}
          {/* A choice whose file was removed stays shown, to change it. */}
          {value.kind === 'file' &&
            !list.custom.some(
              option => templateChoiceKey(option.choice) === selected,
            ) && (
              <Text style={styles.small}>
                {t('startWork.templateMissing', {name: value.name})}
              </Text>
            )}
          {list.system.length > 0 && (
            <>
              <Text style={styles.groupTitle}>
                {t('startWork.templateSystem')}
              </Text>
              {tiles(list.system)}
            </>
          )}
        </>
      )}
    </View>
  );
}

/** A template: its preview over its name, framed thickly when chosen. */
function TemplateTile({
  option,
  portrait,
  selected,
  onPress,
}: {
  option: TemplateOption;
  portrait: boolean;
  selected: boolean;
  onPress: () => void;
}): React.JSX.Element {
  const size = portrait
    ? {width: TILE_SHORT_SIDE, height: TILE_LONG_SIDE}
    : {width: TILE_LONG_SIDE, height: TILE_SHORT_SIDE};
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{selected}}
      accessibilityLabel={option.label}
      onPress={onPress}
      style={[styles.tile, {width: size.width + spacing.sm * 2}]}>
      <View style={[styles.preview, size, selected && styles.previewSelected]}>
        {option.preview && (
          <Image
            source={option.preview}
            resizeMode="contain"
            style={styles.previewImage}
          />
        )}
      </View>
      <Text
        style={[styles.tileLabel, selected && styles.tileLabelSelected]}
        numberOfLines={2}>
        {selected ? `✓ ${option.label}` : option.label}
      </Text>
    </Pressable>
  );
}

type BoardLabelsState =
  | {status: 'idle' | 'loading' | 'failed'}
  | {status: 'loaded'; labels: TrelloLabel[]};

/** The labels of the board Settings was opened from, read on demand. */
interface BoardLabels {
  boardName: string;
  state: BoardLabelsState;
  load: () => void;
}

/**
 * One side of the Start labels: a round − (taken off) or + (put on), the
 * label names as chips a tap removes, then a dashed **Add**. Opened from a
 * board, **Add** lists that board's labels, a tap adding or removing one;
 * otherwise it opens a field to type a name.
 */
function LabelNamesSide({
  sign,
  accessibilityLabel,
  names,
  onChange,
  boardLabels,
}: {
  sign: '−' | '+';
  accessibilityLabel: string;
  names: readonly string[];
  onChange: (names: string[]) => void;
  boardLabels: BoardLabels | null;
}): React.JSX.Element {
  const {t} = useTranslation();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');

  const toggleOpen = () => {
    if (!open && boardLabels?.state.status === 'idle') {
      boardLabels.load();
    }
    setOpen(!open);
  };
  const addTyped = () => {
    if (cleanName(draft)) {
      onChange(addLabelName(names, draft));
    }
    setDraft('');
  };
  const listed = new Set(names.map(labelKey));

  return (
    <View accessibilityLabel={accessibilityLabel} style={styles.labelSide}>
      <View style={styles.chips}>
        <View style={styles.signCircle}>
          <Text style={styles.signText}>{sign}</Text>
        </View>
        {names.map(name => (
          <Pressable
            key={name}
            accessibilityRole="button"
            accessibilityLabel={t('startWork.removeName', {name})}
            onPress={() => onChange(removeLabelName(names, name))}
            style={({pressed}) => [styles.chip, pressed && styles.pressed]}>
            {({pressed}) => (
              <>
                <Text
                  style={[styles.chipText, pressed && styles.pressedText]}
                  numberOfLines={1}>
                  {name}
                </Text>
                <CloseIcon
                  size={CHIP_ICON_SIZE}
                  color={pressed ? colors.background : colors.foreground}
                />
              </>
            )}
          </Pressable>
        ))}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('startWork.addLabel')}
          accessibilityState={{expanded: open}}
          onPress={toggleOpen}
          style={({pressed}) => [
            styles.addButton,
            (pressed || open) && styles.pressed,
          ]}>
          {({pressed}) => (
            <Text
              style={[
                styles.addButtonText,
                (pressed || open) && styles.pressedText,
              ]}>
              {t('startWork.addLabel')}
            </Text>
          )}
        </Pressable>
      </View>

      {open && !boardLabels && (
        <View style={styles.addRow}>
          <TextInput
            accessibilityLabel={t('startWork.labelPlaceholder')}
            autoCapitalize="none"
            autoComplete="off"
            autoCorrect={false}
            autoFocus
            maxLength={START_WORK_NAME_MAX_LENGTH}
            onChangeText={setDraft}
            onSubmitEditing={addTyped}
            placeholder={t('startWork.labelPlaceholder')}
            placeholderTextColor={colors.labelBorder}
            returnKeyType="done"
            spellCheck={false}
            style={[styles.input, styles.addInput]}
            value={draft}
          />
          <Button
            label={t('common.ok')}
            disabled={!cleanName(draft)}
            onPress={addTyped}
          />
        </View>
      )}

      {open && boardLabels && (
        <View style={styles.boardLabels}>
          <Text style={styles.small}>
            {t('startWork.boardLabels', {board: boardLabels.boardName})}
          </Text>
          {boardLabels.state.status === 'loaded' ? (
            boardLabels.state.labels.length > 0 ? (
              <View style={styles.chips}>
                {boardLabels.state.labels.map(label => {
                  const selected = listed.has(labelKey(label.name));
                  return (
                    <ToggleChip
                      key={label.id}
                      selected={selected}
                      accessibilityLabel={t(
                        selected ? 'card.remove' : 'card.add',
                        {name: label.name},
                      )}
                      onPress={() =>
                        onChange(
                          selected
                            ? removeLabelName(names, label.name)
                            : addLabelName(names, label.name),
                        )
                      }>
                      <View
                        style={[
                          styles.swatch,
                          {backgroundColor: labelShade(label.color).background},
                        ]}
                      />
                      <Text style={styles.toggleText} numberOfLines={1}>
                        {label.name}
                      </Text>
                    </ToggleChip>
                  );
                })}
              </View>
            ) : (
              <Text style={styles.small}>{t('startWork.boardNoLabels')}</Text>
            )
          ) : boardLabels.state.status === 'failed' ? (
            <View style={styles.addRow}>
              <Text style={styles.small}>
                {t('startWork.boardLabelsFailed')}
              </Text>
              <Button label={t('common.retry')} onPress={boardLabels.load} />
            </View>
          ) : (
            <Text style={styles.small}>{t('card.loading')}</Text>
          )}
        </View>
      )}
    </View>
  );
}

/** Name of the list the card moves to, saved when editing ends. */
function ListNameInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (name: string) => void;
}): React.JSX.Element {
  const {t} = useTranslation();
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = () => onChange(cleanName(draft));

  return (
    <View style={styles.editor}>
      <TextInput
        accessibilityLabel={t('startWork.listPlaceholder')}
        autoCorrect={false}
        maxLength={START_WORK_NAME_MAX_LENGTH}
        onBlur={commit}
        onChangeText={setDraft}
        onEndEditing={commit}
        onSubmitEditing={commit}
        placeholder={t('startWork.listPlaceholder')}
        placeholderTextColor={colors.labelBorder}
        returnKeyType="done"
        spellCheck={false}
        style={styles.input}
        value={draft}
      />
      {!cleanName(draft) && (
        <Text style={styles.small}>{t('startWork.noList')}</Text>
      )}
    </View>
  );
}

const CHIP_ICON_SIZE = 20;
/** Label chips, the round sign and Add share one height. */
const CHIP_HEIGHT = 40;
const SIGN_SIZE = 32;
/** Preview size of a template, about a twentieth of the page. */
const TILE_SHORT_SIDE = 96;
const TILE_LONG_SIDE = 128;

const styles = StyleSheet.create({
  text: {
    color: colors.foreground,
    fontSize: typography.body,
  },
  small: {
    color: colors.foreground,
    fontSize: typography.small,
  },
  editor: {
    gap: spacing.sm,
    marginLeft: spacing.lg,
    marginBottom: spacing.sm,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.sm,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    height: CHIP_HEIGHT,
    borderColor: colors.foreground,
    borderWidth: borders.width,
    borderRadius: CHIP_HEIGHT / 2,
    paddingLeft: spacing.md,
    paddingRight: spacing.sm,
  },
  labelSides: {
    flexDirection: 'row',
    gap: spacing.lg,
  },
  labelSide: {
    flex: 1,
    gap: spacing.sm,
  },
  signCircle: {
    width: SIGN_SIZE,
    height: SIGN_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    borderColor: colors.foreground,
    borderWidth: borders.width,
    borderRadius: SIGN_SIZE / 2,
  },
  signText: {
    color: colors.foreground,
    fontSize: typography.label,
    fontWeight: '700',
    lineHeight: typography.label + 2,
  },
  addButton: {
    height: CHIP_HEIGHT,
    justifyContent: 'center',
    borderColor: colors.foreground,
    borderStyle: 'dashed',
    borderWidth: borders.width,
    borderRadius: CHIP_HEIGHT / 2,
    paddingHorizontal: spacing.md,
  },
  addButtonText: {
    color: colors.foreground,
    fontSize: typography.body,
    fontWeight: '700',
  },
  boardLabels: {
    gap: spacing.sm,
  },
  swatch: {
    width: 22,
    height: 22,
    borderRadius: 4,
    borderColor: colors.labelBorder,
    borderWidth: 1.5,
  },
  toggleText: {
    flexShrink: 1,
    color: colors.foreground,
    fontSize: typography.body,
  },
  chipText: {
    color: colors.foreground,
    fontSize: typography.body,
    fontWeight: '600',
  },
  pressed: {
    backgroundColor: colors.foreground,
  },
  pressedText: {
    color: colors.background,
  },
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  input: {
    color: colors.foreground,
    borderColor: colors.foreground,
    borderRadius: borders.radius,
    borderWidth: borders.width,
    fontSize: typography.body,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  addInput: {
    flex: 1,
  },
  templates: {
    gap: spacing.md,
  },
  templatePage: {
    gap: spacing.md,
    paddingBottom: spacing.xl,
  },
  groupTitle: {
    color: colors.foreground,
    fontSize: typography.body,
    fontWeight: '700',
    marginTop: spacing.sm,
  },
  tiles: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  tile: {
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  preview: {
    borderColor: colors.labelBorder,
    borderWidth: borders.width / 2,
    backgroundColor: colors.background,
    overflow: 'hidden',
  },
  previewSelected: {
    borderColor: colors.foreground,
    borderWidth: borders.width * 2,
  },
  previewImage: {
    width: '100%',
    height: '100%',
  },
  tileLabel: {
    color: colors.foreground,
    fontSize: typography.small,
    textAlign: 'center',
  },
  tileLabelSelected: {
    fontWeight: '700',
  },
});
