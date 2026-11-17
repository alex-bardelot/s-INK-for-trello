import {
  buildDetailBlocks,
  cardMembers,
  descriptionParagraphs,
  formatCardDate,
  paginateBlocks,
  plainMarkdown,
  webUrl,
  withCheckItemState,
} from '../src/cards/detail';
import {TrelloClient} from '../src/trello/TrelloClient';
import {TrelloBoardMember, TrelloCardDetail} from '../src/trello/types';

function card(overrides: Partial<TrelloCardDetail> = {}): TrelloCardDetail {
  return {
    id: 'card',
    name: 'Write the report',
    desc: '',
    idList: 'list',
    url: '',
    shortUrl: '',
    start: null,
    due: null,
    dueComplete: false,
    dateLastActivity: null,
    labels: [],
    idMembers: [],
    ...overrides,
  };
}

function member(id: string): TrelloBoardMember {
  return {id, fullName: id, initials: id, username: id, avatarUrl: null};
}

describe('buildDetailBlocks', () => {
  it('keeps the description, attachments and comments of a bare card', () => {
    const blocks = buildDetailBlocks(card());
    expect(blocks.map(block => block.key)).toEqual([
      'summary',
      'h-description',
      'e-description',
      'h-attachments',
      'e-attachments',
      'h-comments',
      'e-comments',
    ]);
    expect(blocks[3]).not.toHaveProperty('count');
    expect(blocks[4]).toEqual({
      kind: 'empty',
      key: 'e-attachments',
      section: 'attachments',
    });
  });

  it('lays out every section in reading order', () => {
    const blocks = buildDetailBlocks(
      card({
        desc: 'First\n\nSecond',
        checklists: [
          {
            id: 'late',
            name: 'Later',
            pos: 2,
            checkItems: [{id: 'z', name: 'Z', state: 'incomplete', pos: 1}],
          },
          {
            id: 'early',
            name: 'Now',
            pos: 1,
            checkItems: [
              {id: 'b', name: 'B', state: 'incomplete', pos: 2},
              {id: 'a', name: 'A', state: 'complete', pos: 1},
            ],
          },
        ],
        attachments: [{id: 'f', name: '', url: 'https://x.test/f', date: ''}],
        actions: [
          {id: 'old', date: '2026-01-01T00:00:00Z', data: {text: 'old'}},
          {
            id: 'new',
            date: '2026-02-01T00:00:00Z',
            data: {text: '**new**'},
            memberCreator: {id: 'm', fullName: 'Ann', initials: 'A'},
          },
        ],
      }),
    );
    expect(blocks.map(block => block.key)).toEqual([
      'summary',
      'h-description',
      'p-0',
      'p-1',
      'h-checklists',
      'cl-early',
      'ci-a',
      'ci-b',
      'cl-late',
      'ci-z',
      'h-attachments',
      'a-f',
      'h-comments',
      'c-new',
      'c-old',
    ]);
    expect(blocks[5]).toMatchObject({done: 1, total: 2});
    expect(blocks[6]).toEqual({
      kind: 'checkItem',
      key: 'ci-a',
      itemId: 'a',
      name: 'A',
      complete: true,
    });
    expect(blocks[11]).toMatchObject({name: 'https://x.test/f'});
    expect(blocks[13]).toMatchObject({author: 'Ann', text: 'new'});
  });

  it('keeps an attachment that is not a web page, without its address', () => {
    const blocks = buildDetailBlocks(
      card({
        attachments: [
          {id: 'f', name: 'Report', url: 'file:///sdcard/a.note', date: ''},
        ],
      }),
    );
    expect(blocks.find(block => block.kind === 'attachment')).toEqual({
      kind: 'attachment',
      key: 'a-f',
      name: 'Report',
      url: null,
    });
  });
});

describe('withCheckItemState', () => {
  const withLists = card({
    checklists: [
      {
        id: 'l1',
        name: 'One',
        pos: 1,
        checkItems: [
          {id: 'a', name: 'A', state: 'incomplete', pos: 1},
          {id: 'b', name: 'B', state: 'complete', pos: 2},
        ],
      },
      {
        id: 'l2',
        name: 'Two',
        pos: 2,
        checkItems: [{id: 'c', name: 'C', state: 'incomplete', pos: 1}],
      },
    ],
  });

  it('ticks and unticks one item, leaving the others', () => {
    const ticked = withCheckItemState(withLists, 'a', true);
    expect(ticked.checklists?.[0].checkItems.map(item => item.state)).toEqual([
      'complete',
      'complete',
    ]);
    expect(ticked.checklists?.[1]).toBe(withLists.checklists?.[1]);
    const unticked = withCheckItemState(withLists, 'b', false);
    expect(unticked.checklists?.[0].checkItems[1].state).toBe('incomplete');
    // The card it was given is left as it was.
    expect(withLists.checklists?.[0].checkItems[0].state).toBe('incomplete');
  });

  it('updates the count of its checklist', () => {
    const blocks = buildDetailBlocks(withCheckItemState(withLists, 'c', true));
    expect(blocks.find(block => block.key === 'cl-l2')).toMatchObject({
      done: 1,
      total: 1,
    });
  });

  it('returns the card as it is without such an item', () => {
    expect(withCheckItemState(withLists, 'x', true)).toBe(withLists);
    const bare = card();
    expect(withCheckItemState(bare, 'a', true)).toBe(bare);
  });
});

describe('webUrl', () => {
  it('keeps web addresses', () => {
    expect(webUrl('https://trello.com/1/cards/c/attachments/a/download/x.pdf'))
      .toBe('https://trello.com/1/cards/c/attachments/a/download/x.pdf');
    expect(webUrl('HTTP://example.test')).toBe('HTTP://example.test');
    expect(webUrl('  https://x.test/a?b=c#d  ')).toBe('https://x.test/a?b=c#d');
  });

  it('refuses every other scheme', () => {
    for (const url of [
      'intent://scan/#Intent;scheme=zxing;package=com.example;end',
      'file:///storage/emulated/0/Note/a.note',
      'content://com.android.externalstorage.documents/x',
      // eslint-disable-next-line no-script-url
      'javascript:alert(1)',
      'market://details?id=com.example',
      'tel:+33100000000',
      'sms:+33100000000',
      'otherapp://open',
      '//x.test/a',
      'x.test/a',
    ]) {
      expect(webUrl(url)).toBeNull();
    }
  });

  it('refuses malformed web addresses', () => {
    expect(webUrl('https://')).toBeNull();
    expect(webUrl('https:///path')).toBeNull();
    expect(webUrl('https://user@x.test/')).toBeNull();
    expect(webUrl('https://x.test/a b')).toBeNull();
    expect(webUrl('https://x.test/\na')).toBeNull();
    expect(webUrl('https://x.test/\u0000')).toBeNull();
    expect(webUrl('')).toBeNull();
    expect(webUrl(null)).toBeNull();
    expect(webUrl(undefined)).toBeNull();
  });
});

describe('cardMembers', () => {
  const board = new Map([
    ['a', member('a')],
    ['b', member('b')],
  ]);

  it('prefers the members returned with the card', () => {
    expect(cardMembers(card({members: [member('c')]}), board)).toEqual([
      member('c'),
    ]);
  });

  it('falls back to the board members', () => {
    expect(cardMembers(card({idMembers: ['b', 'gone']}), board)).toEqual([
      member('b'),
    ]);
  });
});

describe('plainMarkdown', () => {
  it.each([
    ['# Title', 'Title'],
    ['**bold** and __strong__', 'bold and strong'],
    ['~~old~~', 'old'],
    ['- item', '• item'],
    ['- [x] done', '☑ done'],
    ['* [ ] todo', '☐ todo'],
    ['[Trello](https://trello.com)', 'Trello'],
    ['[](https://trello.com)', 'https://trello.com'],
    ['`code`', 'code'],
    ['1\\. Step', '1. Step'],
    ['> quoted', 'quoted'],
    ['---', ''],
    ['2 * 3 * 4', '2 * 3 * 4'],
  ])('turns %p into %p', (markdown, plain) => {
    expect(plainMarkdown(markdown)).toBe(plain);
  });
});

describe('descriptionParagraphs', () => {
  it('splits on blank lines and drops empty ones', () => {
    expect(descriptionParagraphs('One\r\ntwo\r\n\r\n\r\n  \nThree\n')).toEqual([
      'One\ntwo',
      'Three',
    ]);
  });

  it('cuts very long paragraphs line by line', () => {
    const lines = Array.from({length: 10}, (_, i) => `line ${i}`);
    expect(descriptionParagraphs(lines.join('\n'))).toEqual(lines);
  });
});

describe('paginateBlocks', () => {
  it('fills pages with whole blocks', () => {
    expect(
      paginateBlocks([40, 40, 40], [false, false, false], 100, 10),
    ).toEqual([
      {start: 0, end: 2},
      {start: 2, end: 3},
    ]);
  });

  it('moves a heading ending a page to the next one', () => {
    expect(
      paginateBlocks([50, 20, 40, 20], [false, true, false, false], 100, 10),
    ).toEqual([
      {start: 0, end: 1},
      {start: 1, end: 4},
    ]);
  });

  it('keeps a heading starting the page with its content', () => {
    expect(paginateBlocks([20, 200], [true, false], 100, 10)).toEqual([
      {start: 0, end: 1},
      {start: 1, end: 2},
    ]);
  });
});

describe('formatCardDate', () => {
  it('returns unparsable dates unchanged', () => {
    expect(formatCardDate('soon', 'en')).toBe('soon');
  });

  it('formats valid dates', () => {
    expect(formatCardDate('2026-03-05T10:00:00.000Z', 'en')).toMatch(/5|Mar/);
  });
});

describe('TrelloClient.getCardDetail', () => {
  it('fetches the card with its nested resources in one request', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => card(),
      text: async () => '',
    } as Response);
    const client = new TrelloClient({apiKey: 'k', token: 't', fetchImpl});

    await expect(client.getCardDetail('abc/1')).resolves.toMatchObject({
      id: 'card',
    });
    const url: string = fetchImpl.mock.calls[0][0];
    expect(url).toContain('/cards/abc%2F1?');
    for (const part of [
      'checklists=all',
      'attachments=true',
      'actions=commentCard',
      'members=true',
      'list=true',
    ]) {
      expect(url).toContain(part);
    }
  });

  it('rejects a response that is not a card', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [],
      text: async () => '',
    } as Response);
    const client = new TrelloClient({apiKey: 'k', token: 't', fetchImpl});
    await expect(client.getCardDetail('x')).rejects.toMatchObject({
      kind: 'invalidResponse',
    });
  });
});
