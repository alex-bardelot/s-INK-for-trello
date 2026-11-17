import {groupCardsByList} from '../src/board/layout';
import {withBoardCardComplete} from '../src/cards/completion';
import {TrelloBoardCard} from '../src/trello';

function card(
  id: string,
  idList: string,
  dueComplete = false,
): TrelloBoardCard {
  return {
    id,
    name: id,
    idList,
    pos: 0,
    due: null,
    dueComplete,
    badges: {checkItems: 0, checkItemsChecked: 0, description: false},
    labels: [],
    idMembers: [],
  };
}

describe('withBoardCardComplete', () => {
  const board = groupCardsByList([
    card('a', 'l1'),
    card('b', 'l1', true),
    card('c', 'l2'),
  ]);

  it('marks a card complete, leaving the other lists as they were', () => {
    const next = withBoardCardComplete(board, 'a', true);
    expect(next).not.toBe(board);
    expect(next.get('l1')?.map(c => [c.id, c.dueComplete])).toEqual([
      ['a', true],
      ['b', true],
    ]);
    expect(next.get('l2')).toBe(board.get('l2'));
    // The board given is not changed.
    expect(board.get('l1')?.[0].dueComplete).toBe(false);
  });

  it('marks a complete card incomplete', () => {
    const next = withBoardCardComplete(board, 'b', false);
    expect(next.get('l1')?.[1].dueComplete).toBe(false);
  });

  it('keeps the same board for an unknown card or an unchanged state', () => {
    expect(withBoardCardComplete(board, 'zz', true)).toBe(board);
    expect(withBoardCardComplete(board, 'b', true)).toBe(board);
  });
});
