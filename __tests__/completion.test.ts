import {groupCardsByList} from '../src/board/layout';
import {
  withBoardCardComplete,
  withBoardCardDetail,
} from '../src/cards/completion';
import {TrelloBoardCard, TrelloCardDetail} from '../src/trello';

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

describe('withBoardCardDetail', () => {
  const board = groupCardsByList([
    card('a', 'l1'),
    card('b', 'l1'),
    card('c', 'l2'),
  ]);
  const label = {id: 'g', name: 'Urgent', color: 'red'};

  function detail(id: string, idList: string): TrelloCardDetail {
    return {
      id,
      name: id,
      desc: '',
      idList,
      url: '',
      shortUrl: '',
      start: null,
      due: null,
      dueComplete: false,
      dateLastActivity: null,
      labels: [],
      idMembers: [],
    };
  }

  it('shows the labels and members changed on the card page', () => {
    const next = withBoardCardDetail(board, {
      ...detail('b', 'l1'),
      labels: [label],
      idMembers: ['m1'],
    });
    expect(next).not.toBe(board);
    const b = next?.get('l1')?.[1];
    expect(b?.labels).toEqual([label]);
    expect(b?.idMembers).toEqual(['m1']);
    expect(next?.get('l1')?.[0]).toBe(board.get('l1')?.[0]);
    expect(next?.get('l2')).toBe(board.get('l2'));
    // The board given is not changed.
    expect(board.get('l1')?.[1].labels).toEqual([]);
  });

  it('counts the checklist items and notes a description', () => {
    const next = withBoardCardDetail(board, {
      ...detail('a', 'l1'),
      desc: 'Notes',
      checklists: [
        {
          id: 'k',
          name: 'Steps',
          pos: 0,
          checkItems: [
            {id: 'i1', name: 'One', state: 'complete', pos: 0},
            {id: 'i2', name: 'Two', state: 'incomplete', pos: 1},
          ],
        },
      ],
    });
    expect(next?.get('l1')?.[0].badges).toEqual({
      checkItems: 2,
      checkItemsChecked: 1,
      description: true,
    });
  });

  it('keeps the same board for an unknown or unchanged card', () => {
    expect(withBoardCardDetail(board, detail('zz', 'l1'))).toBe(board);
    expect(withBoardCardDetail(board, detail('c', 'l2'))).toBe(board);
  });

  it('asks for the board again when the card moved to another list', () => {
    expect(withBoardCardDetail(board, detail('a', 'l2'))).toBeNull();
  });
});
