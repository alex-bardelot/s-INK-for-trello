import {TrelloClient} from '../trello/TrelloClient';
import {TrelloLabel, TrelloList} from '../trello/types';
import {planIsEmpty, planStartWork, StartWorkCard} from './plan';
import {cleanName, StartWorkSettings} from './settings';

/** One thing Start did, or tried to do, shown to the user afterwards. */
export type StartWorkStep =
  | {kind: 'assign'; ok: boolean}
  | {kind: 'removeLabel'; name: string; ok: boolean}
  | {kind: 'addLabel'; name: string; ok: boolean}
  | {kind: 'missingLabel'; name: string}
  | {kind: 'move'; name: string; ok: boolean}
  | {kind: 'missingList'; name: string}
  | {kind: 'boardUnreadable'}
  | {kind: 'nothingToChange'};

/** The card Start works on, as the detail page knows it. */
export interface StartWorkTarget extends StartWorkCard {
  id: string;
  idBoard: string;
}

export interface StartWorkResult {
  steps: StartWorkStep[];
  /** `true` if a change failed or could not be made. */
  failed: boolean;
}

function needsLabels(settings: StartWorkSettings): boolean {
  return (
    settings.removeLabelNames.length > 0 || settings.addLabelNames.length > 0
  );
}

function needsLists(settings: StartWorkSettings): boolean {
  return settings.moveToList && cleanName(settings.listName) !== '';
}

/**
 * Applies the Trello side of Start to a card: assigns the member, changes
 * the labels and moves the card, as the settings say. Each change is its
 * own request, so that one failing does not stop the others. The note is
 * made separately, on the tablet.
 *
 * @throws Only if the board's labels or lists cannot be read with an
 * expired token, so that the caller can ask to connect again.
 */
export async function applyStartWork(
  client: Pick<
    TrelloClient,
    | 'getBoardLabels'
    | 'getBoardLists'
    | 'addCardMember'
    | 'addCardLabel'
    | 'removeCardLabel'
    | 'moveCard'
  >,
  card: StartWorkTarget,
  settings: StartWorkSettings,
  memberId: string,
): Promise<StartWorkResult> {
  const steps: StartWorkStep[] = [];
  let boardLabels: TrelloLabel[] = [];
  let lists: TrelloList[] = [];
  try {
    [boardLabels, lists] = await Promise.all([
      needsLabels(settings) ? client.getBoardLabels(card.idBoard) : [],
      needsLists(settings) ? client.getBoardLists(card.idBoard) : [],
    ]);
  } catch (error) {
    if ((error as {kind?: string})?.kind === 'unauthorized') {
      throw error;
    }
    console.warn('[sINK] Failed to read the board for Start', error);
    return {steps: [{kind: 'boardUnreadable'}], failed: true};
  }

  const plan = planStartWork(card, settings, memberId, boardLabels, lists);

  const attempt = async (run: () => Promise<unknown>): Promise<boolean> => {
    try {
      await run();
      return true;
    } catch (error) {
      console.warn('[sINK] A Start change failed', error);
      return false;
    }
  };

  if (plan.assign) {
    steps.push({
      kind: 'assign',
      ok: await attempt(() => client.addCardMember(card.id, memberId)),
    });
  }
  for (const label of plan.removedLabels) {
    steps.push({
      kind: 'removeLabel',
      name: label.name,
      ok: await attempt(() => client.removeCardLabel(card.id, label.id)),
    });
  }
  for (const label of plan.addedLabels) {
    steps.push({
      kind: 'addLabel',
      name: label.name,
      ok: await attempt(() => client.addCardLabel(card.id, label.id)),
    });
  }
  if (plan.moveTo) {
    const list = plan.moveTo;
    steps.push({
      kind: 'move',
      name: list.name,
      ok: await attempt(() => client.moveCard(card.id, list.id)),
    });
  }
  for (const name of plan.missingLabelNames) {
    steps.push({kind: 'missingLabel', name});
  }
  if (plan.missingListName) {
    steps.push({kind: 'missingList', name: plan.missingListName});
  }
  if (
    planIsEmpty(plan) &&
    !plan.missingListName &&
    plan.missingLabelNames.length === 0
  ) {
    steps.push({kind: 'nothingToChange'});
  }

  return {
    steps,
    failed: steps.some(
      step =>
        ('ok' in step && !step.ok) ||
        step.kind === 'missingLabel' ||
        step.kind === 'missingList' ||
        step.kind === 'boardUnreadable',
    ),
  };
}
