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
      'https://api.trello.com/1/boards/b1/cards?filter=open&fields=name%2CidList%2Cpos%2Cdue%2CdueComplete%2Cbadges%2Clabels%2CidMembers%2CshortLink',
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

  it('creates a card with labels and members', async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValue(jsonResponse({id: 'c1', name: 'Buy milk'}));
    await clientWith(fetchImpl).createCard({
      idList: 'l1',
      name: 'Buy milk',
      idLabels: ['a', 'b'],
      idMembers: ['m1'],
    });
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toEqual({
      idList: 'l1',
      name: 'Buy milk',
      desc: '',
      pos: 'bottom',
      idLabels: 'a,b',
      idMembers: 'm1',
    });
  });

  it('adds a checklist and its items to a card', async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(jsonResponse({id: 'cl1', name: 'Check-list'}))
      .mockResolvedValueOnce(jsonResponse({id: 'i1'}));
    const client = clientWith(fetchImpl);
    const checklist = await client.createChecklist('c1', 'Check-list');
    await client.addCheckItem(checklist.id, 'Buy me a coffee', true);

    const [listUrl, listInit] = fetchImpl.mock.calls[0];
    expect(listUrl).toBe('https://api.trello.com/1/checklists');
    expect(listInit.method).toBe('POST');
    expect(JSON.parse(listInit.body)).toEqual({
      idCard: 'c1',
      name: 'Check-list',
      pos: 'bottom',
    });
    const [itemUrl, itemInit] = fetchImpl.mock.calls[1];
    expect(itemUrl).toBe('https://api.trello.com/1/checklists/cl1/checkItems');
    expect(itemInit.method).toBe('POST');
    expect(JSON.parse(itemInit.body)).toEqual({
      name: 'Buy me a coffee',
      checked: true,
      pos: 'bottom',
    });
  });

  it('reads the labels of a board', async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValue(jsonResponse([{id: 'l1', name: 'WIP', color: null}]));
    const labels = await clientWith(fetchImpl).getBoardLabels('b1');
    expect(labels.map(label => label.name)).toEqual(['WIP']);
    expect(fetchImpl.mock.calls[0][0]).toBe(
      'https://api.trello.com/1/boards/b1/labels?fields=name%2Ccolor&limit=1000',
    );
  });

  it('changes the members, labels and list of a card', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(jsonResponse({}));
    const client = clientWith(fetchImpl);
    await client.addCardMember('c1', 'm1');
    await client.addCardLabel('c1', 'l1');
    await client.removeCardLabel('c1', 'l2');
    await client.createCardLabel('c1', 'Doing');
    await client.moveCard('c1', 'list2');
    await client.setCardComplete('c1', true);
    await client.setCardComplete('c1', false);
    await client.setCardDescription('c1', 'New **text**');
    await client.archiveCard('c1');
    const calls = fetchImpl.mock.calls.map(([url, init]) => [
      init.method,
      url,
      init.body ? JSON.parse(init.body) : undefined,
    ]);
    expect(calls).toEqual([
      ['POST', 'https://api.trello.com/1/cards/c1/idMembers', {value: 'm1'}],
      ['POST', 'https://api.trello.com/1/cards/c1/idLabels', {value: 'l1'}],
      ['DELETE', 'https://api.trello.com/1/cards/c1/idLabels/l2', undefined],
      [
        'POST',
        'https://api.trello.com/1/cards/c1/labels',
        {name: 'Doing', color: null},
      ],
      [
        'PUT',
        'https://api.trello.com/1/cards/c1',
        {idList: 'list2', pos: 'top'},
      ],
      ['PUT', 'https://api.trello.com/1/cards/c1', {dueComplete: true}],
      ['PUT', 'https://api.trello.com/1/cards/c1', {dueComplete: false}],
      ['PUT', 'https://api.trello.com/1/cards/c1', {desc: 'New **text**'}],
      ['PUT', 'https://api.trello.com/1/cards/c1', {closed: true}],
    ]);
  });

  it('ticks and unticks a checklist item of a card', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(jsonResponse({}));
    const client = clientWith(fetchImpl);
    await client.setCheckItemState('c1', 'i1', true);
    await client.setCheckItemState('c1', 'i/2', false);
    const calls = fetchImpl.mock.calls.map(([url, init]) => [
      init.method,
      url,
      JSON.parse(init.body),
    ]);
    expect(calls).toEqual([
      [
        'PUT',
        'https://api.trello.com/1/cards/c1/checkItem/i1',
        {state: 'complete'},
      ],
      [
        'PUT',
        'https://api.trello.com/1/cards/c1/checkItem/i%2F2',
        {state: 'incomplete'},
      ],
    ]);
  });

  it('writes a comment on a card and returns it', async () => {
    const created = {
      id: 'a1',
      date: '2026-11-17T10:00:00.000Z',
      data: {text: 'Done'},
      memberCreator: {id: 'm1', fullName: 'Ada', initials: 'A'},
    };
    const fetchImpl = jest.fn().mockResolvedValue(jsonResponse(created));
    const client = clientWith(fetchImpl);
    await expect(client.addCardComment('c/1', 'Done')).resolves.toEqual(
      created,
    );
    const [url, init] = fetchImpl.mock.calls[0];
    expect(init.method).toBe('POST');
    expect(url).toBe('https://api.trello.com/1/cards/c%2F1/actions/comments');
    expect(JSON.parse(init.body)).toEqual({text: 'Done'});
  });

  it('rejects an answer to a comment that is not a comment', async () => {
    const client = clientWith(jest.fn().mockResolvedValue(jsonResponse({})));
    await expect(client.addCardComment('c1', 'Done')).rejects.toMatchObject({
      kind: 'invalidResponse',
    });
  });

  it('uploads an attachment as a multipart form', async () => {
    // Jest runs Node's FormData, which turns React Native's {uri, name,
    // type} file into text: a fake keeps what is appended.
    class FakeFormData {
      readonly parts: Array<[string, unknown]> = [];
      append(name: string, value: unknown) {
        this.parts.push([name, value]);
      }
    }
    const scope = global as unknown as {FormData: unknown};
    const nodeFormData = scope.FormData;
    scope.FormData = FakeFormData;
    try {
      const created = {
        id: 'a1',
        name: 'report.pdf',
        url: 'https://x',
        date: '',
      };
      const fetchImpl = jest.fn().mockResolvedValue(jsonResponse(created));
      const file = {
        uri: 'file:///storage/report.pdf',
        name: 'report.pdf',
        mimeType: 'application/pdf',
      };
      await expect(
        clientWith(fetchImpl).addCardAttachment('c/1', file),
      ).resolves.toEqual(created);
      const [url, init] = fetchImpl.mock.calls[0];
      expect(url).toBe('https://api.trello.com/1/cards/c%2F1/attachments');
      expect(init.method).toBe('POST');
      // The form sets its own Content-Type, with the multipart boundary.
      expect(init.headers['Content-Type']).toBeUndefined();
      expect(init.headers.Authorization).toContain(TOKEN);
      expect(Object.fromEntries((init.body as FakeFormData).parts)).toEqual({
        name: 'report.pdf',
        mimeType: 'application/pdf',
        setCover: 'false',
        file: {uri: file.uri, name: 'report.pdf', type: 'application/pdf'},
      });
    } finally {
      scope.FormData = nodeFormData;
    }
  });

  it('reports a file Trello finds too large with its status', async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValue(jsonResponse({message: 'too large'}, 413));
    await expect(
      clientWith(fetchImpl).addCardAttachment('c1', {
        uri: 'file:///big.zip',
        name: 'big.zip',
        mimeType: 'application/zip',
      }),
    ).rejects.toMatchObject({kind: 'http', status: 413});
  });
});
