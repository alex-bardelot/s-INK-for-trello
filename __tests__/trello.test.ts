import {
  buildAuthorizeUrl,
  normalizeToken,
  TrelloApiError,
  TrelloClient,
} from '../src/trello';

const API_KEY = 'testkey';
const TOKEN = 'ATTA' + 'a'.repeat(64);

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response;
}

function clientWith(fetchImpl: jest.Mock): TrelloClient {
  return new TrelloClient({apiKey: API_KEY, token: TOKEN, fetchImpl});
}

describe('buildAuthorizeUrl', () => {
  it('builds a manual token flow URL', () => {
    const url = buildAuthorizeUrl({apiKey: ' testkey '});
    expect(url).toBe(
      'https://trello.com/1/authorize?key=testkey&name=s-INK%20for%20Trello' +
        '&scope=read%2Cwrite&expiration=never&response_type=token',
    );
  });
});

describe('normalizeToken', () => {
  it('strips whitespace and line breaks', () => {
    expect(normalizeToken(`  ${TOKEN.slice(0, 30)}\n${TOKEN.slice(30)} `)).toBe(
      TOKEN,
    );
  });

  it('accepts a 64-character legacy token', () => {
    expect(normalizeToken('a'.repeat(64))).toBe('a'.repeat(64));
  });

  it.each(['', 'abc', 'not a token!', 'x'.repeat(63), 'x'.repeat(200)])(
    'rejects %p',
    raw => {
      expect(normalizeToken(raw)).toBeNull();
    },
  );
});

describe('TrelloClient', () => {
  it('sends credentials in the Authorization header, not the URL', async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValue(
        jsonResponse({id: '1', username: 'ada', fullName: 'Ada'}),
      );
    await clientWith(fetchImpl).getMe();

    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe(
      'https://api.trello.com/1/members/me?fields=username%2CfullName%2Cinitials%2Curl%2CavatarUrl',
    );
    expect(url).not.toContain(TOKEN);
    expect(init.headers.Authorization).toBe(
      `OAuth oauth_consumer_key="${API_KEY}", oauth_token="${TOKEN}"`,
    );
  });

  it('reads public boards anonymously without any credentials', async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValue(jsonResponse({id: 'b', name: 'Roadmap'}));
    const client = new TrelloClient({apiKey: API_KEY, fetchImpl});
    await client.getBoard('l0COP24j');

    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toContain('/boards/l0COP24j?');
    expect(url).not.toContain('key=');
    expect(init.headers.Authorization).toBeUndefined();
  });

  it('does nothing when revoking without a token', async () => {
    const fetchImpl = jest.fn();
    await new TrelloClient({apiKey: API_KEY, fetchImpl}).revokeToken();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('sorts boards starred first, then by name', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(
      jsonResponse([
        {id: 'a', name: 'zeta', starred: false},
        {id: 'b', name: 'Beta', starred: false},
        {id: 'c', name: 'omega', starred: true},
        {id: 'd', name: 'alpha', starred: false},
      ]),
    );
    const boards = await clientWith(fetchImpl).getMyBoards();
    expect(boards.map(board => board.id)).toEqual(['c', 'd', 'b', 'a']);
    expect(fetchImpl.mock.calls[0][0]).toContain('filter=open');
  });

  it.each([
    [401, 'unauthorized'],
    [429, 'rateLimited'],
    [500, 'http'],
  ])('maps HTTP %i to %s', async (status, kind) => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValue(jsonResponse('invalid token', status));
    await expect(clientWith(fetchImpl).getMe()).rejects.toMatchObject({
      kind,
      status,
    });
  });

  it('reports transport failures as network errors', async () => {
    const fetchImpl = jest
      .fn()
      .mockRejectedValue(new TypeError('Network request failed'));
    const error = await clientWith(fetchImpl)
      .getMe()
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(TrelloApiError);
    expect(error).toMatchObject({kind: 'network'});
  });

  it('revokes the token with DELETE /tokens/{token}', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(jsonResponse({}));
    await clientWith(fetchImpl).revokeToken();
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe(`https://api.trello.com/1/tokens/${TOKEN}`);
    expect(init.method).toBe('DELETE');
  });
  it('returns open lists of a board sorted by position', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(
      jsonResponse([
        {id: 'b', name: 'Doing', pos: 2048},
        {id: 'a', name: 'To do', pos: 1024},
      ]),
    );
    const lists = await clientWith(fetchImpl).getBoardLists('board 1');
    expect(lists.map(l => l.id)).toEqual(['a', 'b']);
    expect(fetchImpl.mock.calls[0][0]).toBe(
      'https://api.trello.com/1/boards/board%201/lists?filter=open&fields=name%2Cclosed%2Cpos%2CidBoard',
    );
  });

  it('returns open cards of a board sorted by position', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(
      jsonResponse([
        {id: 'y', idList: 'l1', pos: 200},
        {id: 'x', idList: 'l1', pos: 100},
      ]),
    );
    const cards = await clientWith(fetchImpl).getBoardCards('b1');
    expect(cards.map(c => c.id)).toEqual(['x', 'y']);
    expect(fetchImpl.mock.calls[0][0]).toBe(
      'https://api.trello.com/1/boards/b1/cards?filter=open&fields=name%2CidList%2Cpos%2Cdue%2CdueComplete%2Cbadges%2Clabels%2CidMembers',
    );
  });

  it('returns the members of a board', async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValue(jsonResponse([{id: 'm1', initials: 'AL'}]));
    const members = await clientWith(fetchImpl).getBoardMembers('b1');
    expect(members.map(m => m.id)).toEqual(['m1']);
    expect(fetchImpl.mock.calls[0][0]).toBe(
      'https://api.trello.com/1/boards/b1/members?fields=fullName%2Cinitials%2Cusername%2CavatarUrl',
    );
  });

  it('creates a card with a JSON body', async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValue(jsonResponse({id: 'c1', name: 'Buy milk'}));
    const card = await clientWith(fetchImpl).createCard({
      idList: 'l1',
      name: 'Buy milk',
      desc: '2 litres',
    });
    expect(card.id).toBe('c1');
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://api.trello.com/1/cards');
    expect(init.method).toBe('POST');
    expect(init.headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(init.body)).toEqual({
      idList: 'l1',
      name: 'Buy milk',
      desc: '2 litres',
      pos: 'bottom',
    });
  });
});
