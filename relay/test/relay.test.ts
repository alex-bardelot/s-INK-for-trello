/**
 * Relay tests, run by the plugin's Jest setup (`npx jest relay`).
 *
 * They run the real Worker router against real SessionBox objects backed
 * by an in-memory storage, and the exact browser code the page serves.
 */
/* eslint-disable no-new-func -- the page script is run as served. */
/* eslint-disable no-bitwise -- XOR of the reference decryption. */
import {createHash, createHmac, webcrypto} from 'crypto';

import {Env, handleRequest, SessionNamespace} from '../src/index';
import {renderConnectPage} from '../src/page';
import {CRYPTO_JS, PAGE_JS} from '../src/pageScript';
import {parseRelayMessage, SESSION_TTL_MS} from '../src/protocol';
import {SessionBox, SessionStorage} from '../src/sessionBox';

if (!(globalThis as {crypto?: unknown}).crypto) {
  (globalThis as {crypto?: unknown}).crypto = webcrypto;
}

const ID = 'AAAAAAAAAAAAAAAAAAAAAA';
const KEY = 'q1w2e3r4t5y6u7i8o9p0aZ';
const TOKEN = 'ATTA' + '0123456789abcdef'.repeat(4) + '01234567';

type EncryptToken = (
  token: string,
  key: string,
  id: string,
) => Promise<{v: number; ct: string; tag: string}>;

const encryptToken = new Function(
  `${CRYPTO_JS}; return encryptToken;`,
)() as EncryptToken;

function fromBase64Url(text: string): Buffer {
  return Buffer.from(text.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

/** Reference decryption written from the README, with Node's crypto. */
function decryptToken(
  message: {ct: string; tag: string},
  key: string,
  id: string,
): string | null {
  const k = fromBase64Url(key);
  const ct = fromBase64Url(message.ct);
  const macKey = createHash('sha256')
    .update(Buffer.concat([k, Buffer.from('sINK-mac')]))
    .digest();
  const tag = createHmac('sha256', macKey)
    .update(Buffer.concat([Buffer.from('sINK-v1'), Buffer.from(id), ct]))
    .digest();
  if (!tag.equals(fromBase64Url(message.tag))) {
    return null;
  }
  const stream: number[] = [];
  for (let block = 0; stream.length < ct.length; block++) {
    const counter = Buffer.alloc(4);
    counter.writeUInt32BE(block);
    stream.push(
      ...createHash('sha256')
        .update(Buffer.concat([k, Buffer.from('sINK-enc'), counter]))
        .digest(),
    );
  }
  return Buffer.from(ct.map((byte, i) => byte ^ stream[i])).toString('utf8');
}

class MemoryStorage implements SessionStorage {
  data = new Map<string, unknown>();
  alarm: number | null = null;
  async get<T>(key: string) {
    return this.data.get(key) as T | undefined;
  }
  async put<T>(key: string, value: T) {
    this.data.set(key, value);
  }
  async deleteAll() {
    this.data.clear();
  }
  async setAlarm(time: number) {
    this.alarm = time;
  }
  async deleteAlarm() {
    this.alarm = null;
  }
}

function makeEnv() {
  const boxes = new Map<string, {box: SessionBox; storage: MemoryStorage}>();
  const namespace: SessionNamespace = {
    idFromName: name => name,
    get: id => {
      const name = id as string;
      if (!boxes.has(name)) {
        const storage = new MemoryStorage();
        boxes.set(name, {box: new SessionBox({storage}), storage});
      }
      const {box} = boxes.get(name)!;
      return {fetch: request => box.fetch(request)};
    },
  };
  const env: Env = {SESSIONS: namespace, TRELLO_API_KEY: 'public-key'};
  return {env, boxes};
}

const api = (id: string) => `https://relay.example/api/v1/sessions/${id}`;

describe('encryption', () => {
  it('round-trips through the reference decryption', async () => {
    const message = await encryptToken(TOKEN, KEY, ID);
    expect(message.v).toBe(1);
    expect(message.ct).not.toContain(TOKEN.slice(4, 20));
    expect(decryptToken(message, KEY, ID)).toBe(TOKEN);
    expect(parseRelayMessage(JSON.stringify(message))).not.toBeNull();
  });

  it('is bound to the key and the session id', async () => {
    const message = await encryptToken(TOKEN, KEY, ID);
    expect(decryptToken(message, KEY, 'BBBBBBBBBBBBBBBBBBBBBB')).toBeNull();
    expect(decryptToken(message, 'x' + KEY.slice(1), ID)).toBeNull();
  });
});

describe('parseRelayMessage', () => {
  it.each([
    'not json',
    '{}',
    JSON.stringify({v: 2, ct: 'abc', tag: 'a'.repeat(43)}),
    JSON.stringify({v: 1, ct: 'a b', tag: 'a'.repeat(43)}),
    JSON.stringify({v: 1, ct: 'abc', tag: 'short'}),
  ])('rejects %s', body => {
    expect(parseRelayMessage(body)).toBeNull();
  });

  it('keeps only the known fields', () => {
    const body = JSON.stringify({
      v: 1,
      ct: 'abc',
      tag: 'a'.repeat(43),
      extra: 'dropped',
    });
    expect(JSON.parse(parseRelayMessage(body)!)).toEqual({
      v: 1,
      ct: 'abc',
      tag: 'a'.repeat(43),
    });
  });
});

describe('sessions API', () => {
  afterEach(() => jest.useRealTimers());

  const put = (env: Env, id: string, body: string) =>
    handleRequest(new Request(api(id), {method: 'PUT', body}), env);
  const get = (env: Env, id: string) =>
    handleRequest(new Request(api(id)), env);

  it('hands a deposited message over exactly once', async () => {
    const {env} = makeEnv();
    const body = JSON.stringify(await encryptToken(TOKEN, KEY, ID));

    expect((await get(env, ID)).status).toBe(204);
    expect((await put(env, ID, body)).status).toBe(201);
    expect((await put(env, ID, body)).status).toBe(409);

    const collected = await get(env, ID);
    expect(collected.status).toBe(200);
    expect(collected.headers.get('Cache-Control')).toBe('no-store');
    expect(decryptToken(await collected.json(), KEY, ID)).toBe(TOKEN);

    expect((await get(env, ID)).status).toBe(204);
  });

  it('forgets a message nobody collected', async () => {
    jest.useFakeTimers({now: 1_000_000});
    const {env, boxes} = makeEnv();
    const body = JSON.stringify(await encryptToken(TOKEN, KEY, ID));
    await put(env, ID, body);
    expect(boxes.get(ID)!.storage.alarm).toBe(1_000_000 + SESSION_TTL_MS);

    jest.setSystemTime(1_000_000 + SESSION_TTL_MS);
    expect((await get(env, ID)).status).toBe(204);
    expect(boxes.get(ID)!.storage.data.size).toBe(0);
  });

  it('erases everything when the alarm fires', async () => {
    const {env, boxes} = makeEnv();
    await put(env, ID, JSON.stringify(await encryptToken(TOKEN, KEY, ID)));
    await boxes.get(ID)!.box.alarm();
    expect((await get(env, ID)).status).toBe(204);
  });

  it('rejects bad ids, bodies and methods', async () => {
    const {env} = makeEnv();
    expect((await get(env, 'short')).status).toBe(404);
    expect((await put(env, ID, '{"v":1}')).status).toBe(400);
    expect((await put(env, ID, 'x'.repeat(2000))).status).toBe(413);
    const del = await handleRequest(
      new Request(api(ID), {method: 'DELETE'}),
      env,
    );
    expect(del.status).toBe(405);
  });
});

/**
 * Runs the page script against a fake browser whose `fetch` goes to the
 * real router. Returns what the page did.
 */
async function runPage(env: Env, href: string, storage: Map<string, string>) {
  const url = new URL(href);
  const elements: Record<string, {textContent: string; hidden: boolean}> = {};
  const element = (id: string) =>
    (elements[id] ??= {textContent: '', hidden: false});
  let redirect: string | null = null;
  let addressBar = href;
  const browser = {
    navigator: {language: 'fr-FR', clipboard: {writeText: async () => {}}},
    document: {documentElement: {lang: ''}, getElementById: element},
    location: {
      search: url.search,
      hash: url.hash,
      pathname: url.pathname,
      origin: url.origin,
      replace: (to: string) => {
        redirect = to;
      },
    },
    history: {
      replaceState: (_s: unknown, _t: string, to: string) => {
        addressBar = to;
      },
    },
    sessionStorage: {
      setItem: (k: string, v: string) => storage.set(k, v),
      getItem: (k: string) => storage.get(k) ?? null,
      removeItem: (k: string) => storage.delete(k),
    },
    fetch: (path: string, init: RequestInit) =>
      handleRequest(new Request(url.origin + path, init), env),
  };
  const script = renderConnectPage(
    {
      apiKey: 'public-key',
      appName: 'sINK',
      scope: 'read,write',
      expiration: 'never',
    },
    'n',
  )
    .split('<script nonce="n">')[1]
    .split('</script>')[0];
  new Function(...Object.keys(browser), script)(...Object.values(browser));
  await new Promise(resolve => setTimeout(resolve, 50));
  return {
    redirect: redirect as string | null,
    addressBar,
    status: element('status').textContent,
    manualHidden: element('manual').hidden,
  };
}

describe('page flow', () => {
  it('goes to Trello, then deposits the encrypted token', async () => {
    const {env} = makeEnv();
    const storage = new Map<string, string>();

    const start = await runPage(
      env,
      `https://relay.example/connect?s=${ID}#k=${KEY}`,
      storage,
    );
    expect(start.addressBar).toBe(`/connect?s=${ID}`);
    const trello = new URL(start.redirect!);
    expect(trello.origin + trello.pathname).toBe(
      'https://trello.com/1/authorize',
    );
    expect(trello.searchParams.get('callback_method')).toBe('fragment');
    expect(trello.searchParams.get('return_url')).toBe(
      `https://relay.example/connect/done?s=${ID}`,
    );
    expect(trello.search).not.toContain(KEY);

    const done = await runPage(
      env,
      `https://relay.example/connect/done?s=${ID}#token=${TOKEN}`,
      storage,
    );
    expect(done.addressBar).toBe(`/connect/done?s=${ID}`);
    expect(done.status).toContain('C’est fait');
    expect(storage.size).toBe(0);

    const collected = await handleRequest(new Request(api(ID)), env);
    expect(decryptToken(await collected.json(), KEY, ID)).toBe(TOKEN);
  });

  it('shows the token for manual entry when the key is lost', async () => {
    const {env} = makeEnv();
    const done = await runPage(
      env,
      `https://relay.example/connect/done?s=${ID}#token=${TOKEN}`,
      new Map(),
    );
    expect(done.manualHidden).toBe(false);
    expect((await handleRequest(new Request(api(ID)), env)).status).toBe(204);
  });

  it('reports a refusal when Trello sends no token', async () => {
    const {env} = makeEnv();
    const storage = new Map([[`sink-relay:${ID}`, KEY]]);
    const done = await runPage(
      env,
      `https://relay.example/connect/done?s=${ID}`,
      storage,
    );
    expect(done.status).toContain('pas donné');
  });
});

describe('connection page', () => {
  it('is served with a strict, nonce-based policy', async () => {
    const {env} = makeEnv();
    const response = await handleRequest(
      new Request('https://relay.example/connect?s=' + ID),
      env,
    );
    expect(response.status).toBe(200);
    const policy = response.headers.get('Content-Security-Policy')!;
    const nonce = /'nonce-([^']+)'/.exec(policy)![1];
    const html = await response.text();
    expect(html).toContain(`<script nonce="${nonce}">`);
    expect(html).toContain('"apiKey":"public-key"');
    expect(response.headers.get('Referrer-Policy')).toBe('no-referrer');
  });

  it('embeds valid JavaScript and no raw "<" in its data', () => {
    expect(() => new Function(CRYPTO_JS + PAGE_JS)).not.toThrow();
    const html = renderConnectPage(
      {
        apiKey: '</script><b>',
        appName: 'x',
        scope: 'read',
        expiration: 'never',
      },
      'n',
    );
    expect(html).not.toContain('</script><b>');
  });
});
