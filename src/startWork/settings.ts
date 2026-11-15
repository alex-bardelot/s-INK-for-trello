import {labelKey} from '../board/focus';
import {KeyValueStore} from '../storage/keyValueStore';

/** Storage key of the Start work settings. */
export const START_WORK_SETTINGS_KEY = 'supertrello.startWork.settings';

/** Longest label or list name kept (Trello's own limit is higher). */
export const START_WORK_NAME_MAX_LENGTH = 100;

/**
 * What pressing **Start** on a card does. Every action can be turned off;
 * the label and list names are matched without regard to case.
 */
export interface StartWorkSettings {
  /** Adds the signed-in member to the card's members. */
  assignMe: boolean;
  /** Takes these labels off the card. */
  removeLabels: boolean;
  removeLabelNames: string[];
  /** Puts these labels on the card, creating them on the board if needed. */
  addLabels: boolean;
  addLabelNames: string[];
  /** Moves the card to the top of the list of this name. */
  moveToList: boolean;
  listName: string;
  /** Creates a note for the card on the tablet, titled with its s-INK link. */
  createNote: boolean;
}

export const DEFAULT_START_WORK_SETTINGS: StartWorkSettings = {
  assignMe: true,
  removeLabels: true,
  removeLabelNames: ['TODO'],
  addLabels: true,
  addLabelNames: ['WIP'],
  // No list by default: the card stays where it is.
  moveToList: false,
  listName: '',
  createNote: true,
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
    !(settings.removeLabels && settings.removeLabelNames.length > 0) &&
    !(settings.addLabels && settings.addLabelNames.length > 0) &&
    !(settings.moveToList && cleanName(settings.listName) !== '') &&
    !settings.createNote
  );
}

function readBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function readNames(value: unknown, fallback: readonly string[]): string[] {
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
    const parsed: Partial<Record<keyof StartWorkSettings, unknown>> =
      (raw ? JSON.parse(raw) : null) ?? {};
    return {
      assignMe: readBoolean(parsed.assignMe, defaults.assignMe),
      removeLabels: readBoolean(parsed.removeLabels, defaults.removeLabels),
      removeLabelNames: readNames(
        parsed.removeLabelNames,
        defaults.removeLabelNames,
      ),
      addLabels: readBoolean(parsed.addLabels, defaults.addLabels),
      addLabelNames: readNames(parsed.addLabelNames, defaults.addLabelNames),
      moveToList: readBoolean(parsed.moveToList, defaults.moveToList),
      listName:
        typeof parsed.listName === 'string'
          ? cleanName(parsed.listName)
          : defaults.listName,
      createNote: readBoolean(parsed.createNote, defaults.createNote),
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
