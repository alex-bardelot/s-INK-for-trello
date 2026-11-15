/**
 * Choices made for a new card before it is created: which board and list
 * are picked by default, and the add/remove of labels and members.
 */

/**
 * The choice to fill in by itself: the one used last if it is still
 * offered, else the only one offered, else none (the user must choose).
 */
export function defaultChoice<T extends {id: string}>(
  choices: readonly T[],
  lastUsedId: string | undefined,
): T | null {
  const lastUsed = lastUsedId
    ? choices.find(choice => choice.id === lastUsedId)
    : undefined;
  if (lastUsed) {
    return lastUsed;
  }
  return choices.length === 1 ? choices[0] : null;
}

/** Adds `id` to the ids, or removes it if it is already there. */
export function toggleId(ids: readonly string[], id: string): string[] {
  return ids.includes(id) ? ids.filter(other => other !== id) : [...ids, id];
}

/** Members of a board with the connected member first, then by name. */
export function membersMeFirst<T extends {id: string; fullName: string}>(
  members: readonly T[],
  memberId: string,
): T[] {
  return [...members].sort(
    (a, b) =>
      Number(b.id === memberId) - Number(a.id === memberId) ||
      a.fullName.localeCompare(b.fullName, undefined, {sensitivity: 'base'}),
  );
}

/**
 * The chips shown for labels or members: the suggested ones first, in
 * their order, then the ones added from the + list, in board order.
 */
export function chipIds(
  all: readonly string[],
  suggested: readonly string[],
  selected: readonly string[],
): string[] {
  const shown = new Set(suggested);
  return [
    ...suggested,
    ...all.filter(id => selected.includes(id) && !shown.has(id)),
  ];
}

/**
 * Short link of a new card, to link a note to it: given by Trello, or
 * taken from its short URL (`https://trello.com/c/{shortLink}`).
 */
export function cardShortLink(card: {
  shortLink?: string;
  shortUrl?: string;
}): string | null {
  if (card.shortLink) {
    return card.shortLink;
  }
  return /\/c\/([A-Za-z0-9]+)/.exec(card.shortUrl ?? '')?.[1] ?? null;
}

/** A checklist item on the form; `key` identifies its row while editing. */
export interface FormCheckItem {
  key: string;
  name: string;
  checked: boolean;
}

/** The items to create: blank rows are dropped, names are trimmed. */
export function checkItemsToCreate(
  items: readonly FormCheckItem[],
): {name: string; checked: boolean}[] {
  return items
    .map(item => ({name: item.name.trim(), checked: item.checked}))
    .filter(item => item.name.length > 0);
}
