import {
  isSupernoteRoadmap,
  SUPERNOTE_ROADMAP_SHORT_LINK,
  TrelloClient,
} from '../src/trello';

function jsonResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response;
}

describe('isSupernoteRoadmap', () => {
  it('recognizes the roadmap by its short link', () => {
    expect(
      isSupernoteRoadmap({shortLink: SUPERNOTE_ROADMAP_SHORT_LINK, url: ''}),
    ).toBe(true);
  });

  it('recognizes the roadmap by its URL', () => {
    expect(
      isSupernoteRoadmap({
        shortLink: '',
        url: `https://trello.com/b/${SUPERNOTE_ROADMAP_SHORT_LINK}/supernote-roadmap`,
      }),
    ).toBe(true);
  });

  it('ignores other boards', () => {
    expect(
      isSupernoteRoadmap({
        shortLink: 'abcd1234',
        url: 'https://trello.com/b/abcd1234/my-board',
      }),
    ).toBe(false);
  });
});

describe('TrelloClient.getBoard', () => {
  it('fetches a board by short link', async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValue(jsonResponse({id: 'x', name: 'Roadmap'}));
    const client = new TrelloClient({apiKey: 'key', token: 'token', fetchImpl});

    const board = await client.getBoard(SUPERNOTE_ROADMAP_SHORT_LINK);

    expect(board.name).toBe('Roadmap');
    const url: string = fetchImpl.mock.calls[0][0];
    expect(url).toContain(`/boards/${SUPERNOTE_ROADMAP_SHORT_LINK}?fields=`);
    expect(url).toContain('shortLink');
  });
});
