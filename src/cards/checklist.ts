import type {TrelloClient} from '../trello';
import type {CardCheckItem} from './ordering';

/** Name of the checklist made from the squares of the selection. */
export const NEW_CARD_CHECKLIST_NAME = 'Check-list';

/**
 * Adds the "Check-list" checklist to a new card, with its items in order.
 * Items are added one after the other, so that Trello keeps their order.
 * Does nothing without items.
 */
export async function addCardChecklist(
  client: Pick<TrelloClient, 'createChecklist' | 'addCheckItem'>,
  cardId: string,
  items: readonly CardCheckItem[],
): Promise<void> {
  if (items.length === 0) {
    return;
  }
  const checklist = await client.createChecklist(
    cardId,
    NEW_CARD_CHECKLIST_NAME,
  );
  for (const item of items) {
    await client.addCheckItem(checklist.id, item.name, item.checked);
  }
}
