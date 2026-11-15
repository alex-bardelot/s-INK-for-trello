import {labelKey} from '../board/focus';
import {TrelloLabel, TrelloList} from '../trello/types';
import {cleanName, StartWorkSettings} from './settings';

/** What a card looks like before Start: the fields Start changes. */
export interface StartWorkCard {
  idList: string;
  idMembers: readonly string[];
  labels: readonly Pick<TrelloLabel, 'id' | 'name'>[];
}

/** What Start changes on the card, worked out before any request. */
export interface StartWorkPlan {
  /** The member is added to the card. */
  assign: boolean;
  /** Labels taken off the card. */
  removedLabels: Pick<TrelloLabel, 'id' | 'name'>[];
  /** Labels of the board put on the card. */
  addedLabels: Pick<TrelloLabel, 'id' | 'name'>[];
  /** Label names missing from the board: they are created, then put on. */
  createdLabelNames: string[];
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
  const addKeys = new Set(
    settings.addLabels ? settings.addLabelNames.map(labelKey) : [],
  );
  const removeKeys = new Set(
    settings.removeLabels
      ? settings.removeLabelNames.map(labelKey).filter(key => !addKeys.has(key))
      : [],
  );

  const removedLabels = card.labels.filter(label =>
    removeKeys.has(labelKey(label.name ?? '')),
  );

  const onCard = new Set(card.labels.map(label => labelKey(label.name ?? '')));
  const addedLabels: Pick<TrelloLabel, 'id' | 'name'>[] = [];
  const createdLabelNames: string[] = [];
  if (settings.addLabels) {
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
        createdLabelNames.push(name.trim());
      }
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
    createdLabelNames,
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
    plan.createdLabelNames.length === 0 &&
    !plan.moveTo
  );
}
