import type {TrelloBoardCard, TrelloCardDetail} from '../trello/types';

/**
 * The board's cards with one of them marked complete, or not, as shown
 * while Trello is told. A card not on the board, or already in that state,
 * leaves the map as it is (the same object).
 */
export function withBoardCardComplete(
  cardsByList: ReadonlyMap<string, TrelloBoardCard[]>,
  cardId: string,
  complete: boolean,
): ReadonlyMap<string, TrelloBoardCard[]> {
  for (const [listId, cards] of cardsByList) {
    const index = cards.findIndex(card => card.id === cardId);
    if (index < 0) {
      continue;
    }
    if (cards[index].dueComplete === complete) {
      return cardsByList;
    }
    const next = new Map(cardsByList);
    next.set(
      listId,
      cards.map((card, i) =>
        i === index ? {...card, dueComplete: complete} : card,
      ),
    );
    return next;
  }
  return cardsByList;
}

/**
 * The board's cards with one of them as its page last showed it: name,
 * dates, labels, members and the badges drawn on its tile. This costs no
 * request, the page having read the card from Trello when it opened and
 * kept it up to date with its own changes.
 *
 * A card not on the board, or unchanged, leaves the map as it is (the same
 * object). A card now in another list gives `null`: its place in that list
 * is not known, so the board has to be read again.
 */
export function withBoardCardDetail(
  cardsByList: ReadonlyMap<string, TrelloBoardCard[]>,
  detail: TrelloCardDetail,
): ReadonlyMap<string, TrelloBoardCard[]> | null {
  for (const [listId, cards] of cardsByList) {
    const index = cards.findIndex(card => card.id === detail.id);
    if (index < 0) {
      continue;
    }
    if (detail.idList !== listId) {
      return null;
    }
    const shown = cards[index];
    const items = detail.checklists?.flatMap(list => list.checkItems);
    const updated: TrelloBoardCard = {
      ...shown,
      name: detail.name,
      due: detail.due,
      dueComplete: detail.dueComplete,
      labels: detail.labels ?? [],
      idMembers: detail.idMembers ?? [],
      badges: {
        ...shown.badges,
        description: detail.desc.trim().length > 0,
        // Without its attachments or checklists read, the card keeps the
        // counts it had.
        ...(detail.attachments && {attachments: detail.attachments.length}),
        ...(items && {
          checkItems: items.length,
          checkItemsChecked: items.filter(item => item.state === 'complete')
            .length,
        }),
      },
    };
    if (sameTile(shown, updated)) {
      return cardsByList;
    }
    const next = new Map(cardsByList);
    next.set(
      listId,
      cards.map((card, i) => (i === index ? updated : card)),
    );
    return next;
  }
  return cardsByList;
}

function sameTile(a: TrelloBoardCard, b: TrelloBoardCard): boolean {
  return (
    a.name === b.name &&
    a.due === b.due &&
    a.dueComplete === b.dueComplete &&
    a.badges.checkItems === b.badges.checkItems &&
    a.badges.checkItemsChecked === b.badges.checkItemsChecked &&
    a.badges.description === b.badges.description &&
    a.badges.attachments === b.badges.attachments &&
    sameIds(a.idMembers, b.idMembers) &&
    a.labels.length === b.labels.length &&
    a.labels.every(
      (label, i) =>
        label.id === b.labels[i].id &&
        label.name === b.labels[i].name &&
        label.color === b.labels[i].color,
    )
  );
}

function sameIds(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id, i) => id === b[i]);
}
