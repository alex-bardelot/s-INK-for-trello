import {labelKey} from '../board/focus';
import {KeyValueStore} from '../storage/keyValueStore';

/** Storage key of the Start work settings. */
export const START_WORK_SETTINGS_KEY = 'supertrello.startWork.settings';

/** Longest label or list name kept (Trello's own limit is higher). */
export const START_WORK_NAME_MAX_LENGTH = 100;

/**
 * What pressing **Start** on a card does. Every action can be turned off
 * (the labels by naming none); the label and list names are matched
 * without regard to case.
 */
export interface StartWorkSettings {
  /** Adds the signed-in member to the card's members. */
  assignMe: boolean;
  /** Takes these labels off the card. */
  removeLabelNames: string[];
  /** Puts these labels on the card, if its board has them. */
  addLabelNames: string[];
  /** Moves the card to the top of the list of this name. */
  moveToList: boolean;
  listName: string;
  /** Creates a note for the card on the tablet, titled with its s-INK link. */
  createNote: boolean;
  /** Page background of the notes created for cards. */
  noteTemplate: NoteTemplateChoice;
}

/**
 * Template of a card's new note: the blank page packaged with s-INK, one of
 * the tablet's own templates (by name, e.g. `style_8mm_ruled_line`), or a
 * PNG file of the tablet's `MyStyle` folder.
 */
export type NoteTemplateChoice =
  | {kind: 'blank'}
  | {kind: 'system'; name: string}
  | {kind: 'file'; path: string; name: string};

export const BLANK_TEMPLATE_CHOICE: NoteTemplateChoice = {kind: 'blank'};

/**
 * The tablet's "Task list" template, the default background of card notes.
 * Found again by its readable name if the tablet spells it otherwise.
 */
export const TASK_LIST_TEMPLATE_CHOICE: NoteTemplateChoice = {
  kind: 'system',
  name: 'style_task_list',
};

/** Identifies a template choice, to compare two of them. */
export function templateChoiceKey(choice: NoteTemplateChoice): string {
  switch (choice.kind) {
    case 'blank':
      return 'blank';
    case 'system':
      return `system:${choice.name}`;
    case 'file':
      return `file:${choice.path}`;
  }
}

function readTemplateChoice(
  value: unknown,
  fallback: NoteTemplateChoice,
): NoteTemplateChoice {
  const choice = value as Partial<Record<string, unknown>> | null;
  if (choice?.kind === 'blank') {
    return BLANK_TEMPLATE_CHOICE;
  }
  if (
    choice?.kind === 'system' &&
    typeof choice.name === 'string' &&
    choice.name
  ) {
    return {kind: 'system', name: choice.name};
  }
  if (
    choice?.kind === 'file' &&
    typeof choice.path === 'string' &&
    choice.path.startsWith('/')
  ) {
    return {
      kind: 'file',
      path: choice.path,
      name: typeof choice.name === 'string' ? choice.name : '',
    };
  }
  return fallback;
}

export const DEFAULT_START_WORK_SETTINGS: StartWorkSettings = {
  assignMe: true,
  removeLabelNames: ['TODO'],
  addLabelNames: ['WIP'],
  // No list by default: the card stays where it is.
  moveToList: false,
  listName: '',
  createNote: true,
  noteTemplate: TASK_LIST_TEMPLATE_CHOICE,
};

/** Trims a name and cuts it to the length kept. */
export function cleanName(name: string): string {
  return name.trim().slice(0, START_WORK_NAME_MAX_LENGTH);
}

/** Adds a label name to a list, unless it is empty or already there. */
export function addLabelName(names: readonly string[], name: string): string[] {
  const clean = cleanName(name);
  if (!clean || names.some(other => labelKey(other) === labelKey(clean))) {
    return [...names];
  }
  return [...names, clean];
}

/** Removes a label name from a list, whatever its case. */
export function removeLabelName(
  names: readonly string[],
  name: string,
): string[] {
  return names.filter(other => labelKey(other) !== labelKey(name));
}

/** `true` if Start would do nothing at all. */
export function startWorkDisabled(settings: StartWorkSettings): boolean {
  return (
    !settings.assignMe &&
    settings.removeLabelNames.length === 0 &&
    settings.addLabelNames.length === 0 &&
    !(settings.moveToList && cleanName(settings.listName) !== '') &&
    !settings.createNote
  );
}

function readBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

/**
 * Reads a list of label names. Settings saved before the label switches
 * were dropped may have one turned off: its names then no longer apply.
 */
function readNames(
  value: unknown,
  fallback: readonly string[],
  formerSwitch: unknown,
): string[] {
  if (formerSwitch === false) {
    return [];
  }
  if (!Array.isArray(value)) {
    return [...fallback];
  }
  return value
    .filter((name): name is string => typeof name === 'string')
    .reduce<string[]>((names, name) => addLabelName(names, name), []);
}

/** Reads the settings; any missing or corrupted value yields its default. */
export async function loadStartWorkSettings(
  store: KeyValueStore,
): Promise<StartWorkSettings> {
  const defaults = DEFAULT_START_WORK_SETTINGS;
  try {
    const raw = await store.getItem(START_WORK_SETTINGS_KEY);
    const parsed: Partial<
      Record<keyof StartWorkSettings | 'removeLabels' | 'addLabels', unknown>
    > = (raw ? JSON.parse(raw) : null) ?? {};
    return {
      assignMe: readBoolean(parsed.assignMe, defaults.assignMe),
      removeLabelNames: readNames(
        parsed.removeLabelNames,
        defaults.removeLabelNames,
        parsed.removeLabels,
      ),
      addLabelNames: readNames(
        parsed.addLabelNames,
        defaults.addLabelNames,
        parsed.addLabels,
      ),
      moveToList: readBoolean(parsed.moveToList, defaults.moveToList),
      listName:
        typeof parsed.listName === 'string'
          ? cleanName(parsed.listName)
          : defaults.listName,
      createNote: readBoolean(parsed.createNote, defaults.createNote),
      noteTemplate: readTemplateChoice(
        parsed.noteTemplate,
        defaults.noteTemplate,
      ),
    };
  } catch (error) {
    console.warn('[sINK] Failed to read the Start work settings', error);
    return defaults;
  }
}

export async function saveStartWorkSettings(
  store: KeyValueStore,
  settings: StartWorkSettings,
): Promise<void> {
  try {
    await store.setItem(START_WORK_SETTINGS_KEY, JSON.stringify(settings));
  } catch (error) {
    console.warn('[sINK] Failed to save the Start work settings', error);
  }
}
