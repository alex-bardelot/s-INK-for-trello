import {labelKey} from '../board/focus';
import {TrelloLabel, TrelloList} from '../trello/types';
import {cleanName, StartWorkSettings} from './settings';

/** What a card looks like before Start: the fields Start changes. */
export interface StartWorkCard {
  idList: string;
  idMembers: readonly string[];
  /** Their color, when known, draws them in the Start work popup. */
  labels: readonly (Pick<TrelloLabel, 'id' | 'name'> & {
    color?: string | null;
  })[];
}

/** What Start changes on the card, worked out before any request. */
export interface StartWorkPlan {
  /** The member is added to the card. */
  assign: boolean;
  /** Labels taken off the card. */
  removedLabels: Pick<TrelloLabel, 'id' | 'name'>[];
  /** Labels of the board put on the card. */
  addedLabels: Pick<TrelloLabel, 'id' | 'name'>[];
  /** Label names to put on that the board does not have: left out. */
  missingLabelNames: string[];
  /** List the card moves to, if it is not already in it. */
  moveTo: Pick<TrelloList, 'id' | 'name'> | null;
  /** Name of the list to move to when the board has none of that name. */
  missingListName: string | null;
}

/**
 * Works out what Start changes on a card, from the settings and what the
 * board holds. Names are matched without regard to case or surrounding
 * spaces. A label both removed and added stays on the card. Lists are only
 * needed when the move is turned on, labels when labels change.
 */
export function planStartWork(
  card: StartWorkCard,
  settings: StartWorkSettings,
  memberId: string,
  boardLabels: readonly Pick<TrelloLabel, 'id' | 'name'>[],
  lists: readonly Pick<TrelloList, 'id' | 'name'>[],
): StartWorkPlan {
  const addKeys = new Set(settings.addLabelNames.map(labelKey));
  const removeKeys = new Set(
    settings.removeLabelNames.map(labelKey).filter(key => !addKeys.has(key)),
  );

  const removedLabels = card.labels.filter(label =>
    removeKeys.has(labelKey(label.name ?? '')),
  );

  const onCard = new Set(card.labels.map(label => labelKey(label.name ?? '')));
  const addedLabels: Pick<TrelloLabel, 'id' | 'name'>[] = [];
  const missingLabelNames: string[] = [];
  for (const name of settings.addLabelNames) {
    const key = labelKey(name);
    if (!key || onCard.has(key)) {
      continue;
    }
    onCard.add(key);
    // Boards may hold several labels of the same name: the first one is used.
    const existing = boardLabels.find(
      label => labelKey(label.name ?? '') === key,
    );
    if (existing) {
      addedLabels.push(existing);
    } else {
      // Not created on the board: only its own labels are put on.
      missingLabelNames.push(name.trim());
    }
  }

  let moveTo: StartWorkPlan['moveTo'] = null;
  let missingListName: string | null = null;
  const listName = cleanName(settings.listName);
  if (settings.moveToList && listName) {
    const key = labelKey(listName);
    const list = lists.find(candidate => labelKey(candidate.name) === key);
    if (!list) {
      missingListName = listName;
    } else if (list.id !== card.idList) {
      moveTo = list;
    }
  }

  return {
    assign:
      settings.assignMe && !!memberId && !card.idMembers.includes(memberId),
    removedLabels,
    addedLabels,
    missingLabelNames,
    moveTo,
    missingListName,
  };
}

/** `true` if the plan changes nothing on Trello. */
export function planIsEmpty(plan: StartWorkPlan): boolean {
  return (
    !plan.assign &&
    plan.removedLabels.length === 0 &&
    plan.addedLabels.length === 0 &&
    !plan.moveTo
  );
}

/**
 * One step Start is about to take, listed before it runs. `on` says
 * whether this run takes it: it starts as the settings say and can be
 * turned off for this run alone.
 */
export type StartWorkPreviewStep = {on: boolean} & (
  | {kind: 'assign'}
  /** `color`: that of the label, `null` when unknown or colorless. */
  | {kind: 'removeLabel' | 'addLabel'; name: string; color: string | null}
  | {kind: 'move'; name: string}
  | {kind: 'createNote'}
  | {kind: 'openNote'}
);

/**
 * What Start is about to do on a card, from the card and the settings, to
 * be confirmed before it runs: the board's lists are not read, so a label
 * or list the board lacks is still listed (the report says so afterwards).
 * Steps with nothing to change are left out, in the order Start takes them,
 * all on. The note's step is always listed, on as the settings say, so that
 * it can be made this once.
 *
 * @param listName - Name of the card's list.
 * @param hasNote - The card's note was found: Start opens it again.
 * @param boardLabels - The board's labels, if read: give the labels put on
 *   their color and name as on the board.
 */
export function previewStartWork(
  card: StartWorkCard,
  listName: string,
  settings: StartWorkSettings,
  memberId: string,
  hasNote: boolean,
  boardLabels: readonly Pick<TrelloLabel, 'name' | 'color'>[] = [],
): StartWorkPreviewStep[] {
  const steps: StartWorkPreviewStep[] = [];
  if (settings.assignMe && !!memberId && !card.idMembers.includes(memberId)) {
    steps.push({kind: 'assign', on: true});
  }

  const addKeys = new Set(settings.addLabelNames.map(labelKey));
  for (const label of card.labels) {
    const key = labelKey(label.name ?? '');
    if (
      key &&
      !addKeys.has(key) &&
      settings.removeLabelNames.some(name => labelKey(name) === key)
    ) {
      steps.push({
        kind: 'removeLabel',
        name: label.name,
        color: label.color ?? null,
        on: true,
      });
    }
  }
  const onCard = new Set(card.labels.map(label => labelKey(label.name ?? '')));
  for (const name of settings.addLabelNames) {
    const key = labelKey(name);
    if (key && !onCard.has(key)) {
      onCard.add(key);
      const onBoard = boardLabels.find(
        label => labelKey(label.name ?? '') === key,
      );
      steps.push({
        kind: 'addLabel',
        name: onBoard?.name ?? name.trim(),
        color: onBoard?.color ?? null,
        on: true,
      });
    }
  }

  const target = cleanName(settings.listName);
  if (
    settings.moveToList &&
    target &&
    labelKey(listName) !== labelKey(target)
  ) {
    steps.push({kind: 'move', name: target, on: true});
  }

  steps.push({
    kind: hasNote ? 'openNote' : 'createNote',
    on: settings.createNote,
  });
  return steps;
}

/**
 * The settings of one run of Start, once its steps were confirmed: those
 * turned off in the popup are left out, the note's step sets whether a
 * note is made. The saved settings are not changed.
 */
export function settingsForRun(
  settings: StartWorkSettings,
  steps: readonly StartWorkPreviewStep[],
): StartWorkSettings {
  const off = (kind: StartWorkPreviewStep['kind']) =>
    steps.some(step => step.kind === kind && !step.on);
  const offLabels = (kind: 'removeLabel' | 'addLabel') =>
    new Set(
      steps
        .filter(step => step.kind === kind && !step.on)
        .map(step => labelKey((step as {name: string}).name)),
    );
  const offRemoved = offLabels('removeLabel');
  const offAdded = offLabels('addLabel');
  const note = steps.find(
    step => step.kind === 'createNote' || step.kind === 'openNote',
  );
  return {
    ...settings,
    assignMe: settings.assignMe && !off('assign'),
    removeLabelNames: settings.removeLabelNames.filter(
      name => !offRemoved.has(labelKey(name)),
    ),
    addLabelNames: settings.addLabelNames.filter(
      name => !offAdded.has(labelKey(name)),
    ),
    moveToList: settings.moveToList && !off('move'),
    createNote: note ? note.on : settings.createNote,
  };
}

/**
 * Whether Start was already done on a card, as the settings say it: the
 * member assigned, none of the labels taken off still on it, all those put
 * on there, the card in the named list and its note made. Start is then
 * not offered again. Names are matched without regard to case.
 *
 * @param listName - Name of the card's list.
 * @param hasNote - The card's note was found on the tablet.
 */
export function cardIsStarted(
  card: StartWorkCard,
  listName: string,
  settings: StartWorkSettings,
  memberId: string,
  hasNote: boolean,
): boolean {
  const onCard = new Set(card.labels.map(label => labelKey(label.name ?? '')));
  const addKeys = settings.addLabelNames.map(labelKey).filter(Boolean);
  const target = cleanName(settings.listName);
  return (
    (!settings.assignMe || !memberId || card.idMembers.includes(memberId)) &&
    settings.removeLabelNames
      .map(labelKey)
      .every(key => addKeys.includes(key) || !onCard.has(key)) &&
    addKeys.every(key => onCard.has(key)) &&
    (!settings.moveToList ||
      !target ||
      labelKey(listName) === labelKey(target)) &&
    (!settings.createNote || hasNote)
  );
}
