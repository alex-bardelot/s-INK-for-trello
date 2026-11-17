import type {TrelloBoardCard} from '../trello/types';

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
