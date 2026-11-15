/**
 * Funding tests: the real Worker router against a real FundingBox backed
 * by an in-memory storage.
 */
import {Env, handleRequest, SessionNamespace} from '../src/index';
import {
  FundingBox,
  FundingStorage,
  parseCents,
  parseKofiWebhook,
  sameSecret,
} from '../src/funding';

const KOFI_TOKEN = 'kofi-verification-token';
const ADMIN_TOKEN = 'admin-token';

class MemoryStorage implements FundingStorage {
  data = new Map<string, unknown>();
  async get<T>(key: string) {
    return this.data.get(key) as T | undefined;
  }
  async put<T>(key: string, value: T) {
    this.data.set(key, value);
  }
}

function makeEnv(overrides: Partial<Env> = {}) {
  const storage = new MemoryStorage();
  const box = new FundingBox({storage});
  const funding: SessionNamespace = {
    idFromName: name => name,
    get: () => ({fetch: request => box.fetch(request)}),
  };
  const env: Env = {
    SESSIONS: funding,
    TRELLO_API_KEY: 'public-key',
    FUNDING: funding,
    FUNDING_CURRENCY: 'EUR',
    KOFI_VERIFICATION_TOKEN: KOFI_TOKEN,
    FUNDING_ADMIN_TOKEN: ADMIN_TOKEN,
    ...overrides,
  };
  return {env, storage};
}

function kofiBody(data: Record<string, unknown>): string {
  return new URLSearchParams({
    data: JSON.stringify({
      verification_token: KOFI_TOKEN,
      message_id: 'message',
      kofi_transaction_id: 'tx-1',
      type: 'Donation',
      amount: '5.00',
      currency: 'EUR',
      from_name: 'Jo',
      email: 'jo@example.com',
      message: 'Thanks',
      ...data,
    }),
  }).toString();
}

const webhook = (env: Env, body: string) =>
  handleRequest(
    new Request('https://relay.example/api/v1/kofi', {
      method: 'POST',
      headers: {'Content-Type': 'application/x-www-form-urlencoded'},
      body,
    }),
    env,
  );

const read = async (env: Env) => {
  const response = await handleRequest(
    new Request('https://relay.example/api/v1/funding'),
    env,
  );
  expect(response.status).toBe(200);
  return response.json();
};

const setTotal = (env: Env, body: unknown, token = ADMIN_TOKEN) =>
  handleRequest(
    new Request('https://relay.example/api/v1/funding', {
      method: 'PUT',
      headers: {Authorization: `Bearer ${token}`},
      body: JSON.stringify(body),
    }),
    env,
  );

describe('parseCents', () => {
  it.each([
    ['5', 500],
    ['5.5', 550],
    ['3.07', 307],
    [' 12.00 ', 1200],
  ])('reads %p as %p cents', (amount, cents) => {
    expect(parseCents(amount)).toBe(cents);
  });

  it.each(['', '0', '0.00', '-3', '1,50', '1.234', 'abc', '1e3'])(
    'rejects %p',
    amount => {
      expect(parseCents(amount)).toBeNull();
    },
  );
});

describe('sameSecret', () => {
  it('compares secrets', () => {
    expect(sameSecret('abc', 'abc')).toBe(true);
    expect(sameSecret('abc', 'abd')).toBe(false);
    expect(sameSecret('abc', 'abcd')).toBe(false);
    expect(sameSecret('', '')).toBe(false);
  });
});

describe('parseKofiWebhook', () => {
  it('reads the payment and nothing about the donor', () => {
    expect(parseKofiWebhook(kofiBody({}))).toEqual({
      verificationToken: KOFI_TOKEN,
      transactionId: 'tx-1',
      type: 'Donation',
      cents: 500,
      currency: 'EUR',
    });
  });

  it.each([
    '',
    'data=not-json',
    kofiBody({amount: 'free'}),
    kofiBody({kofi_transaction_id: undefined}),
  ])('rejects %p', body => {
    expect(parseKofiWebhook(body)).toBeNull();
  });
});

describe('funding API', () => {
  beforeEach(() => jest.spyOn(console, 'log').mockImplementation(() => {}));
  afterEach(() => jest.restoreAllMocks());

  it('starts at zero', async () => {
    const {env} = makeEnv();
    expect(await read(env)).toEqual({raised: 0, currency: 'EUR', updatedAt: 0});
  });

  it('adds each Ko-fi donation once', async () => {
    const {env, storage} = makeEnv();
    expect((await webhook(env, kofiBody({}))).status).toBe(200);
    expect((await webhook(env, kofiBody({}))).status).toBe(200);
    expect(
      (
        await webhook(
          env,
          kofiBody({kofi_transaction_id: 'tx-2', amount: '3.50'}),
        )
      ).status,
    ).toBe(200);
    const total = await read(env);
    expect(total.raised).toBe(8.5);
    expect(total.updatedAt).toBeGreaterThan(0);
    // Nothing about the donors is kept.
    expect(JSON.stringify([...storage.data])).not.toMatch(/Jo|example|Thanks/);
  });

  it('counts subscriptions but not shop orders nor other currencies', async () => {
    const {env} = makeEnv();
    await webhook(env, kofiBody({type: 'Subscription'}));
    await webhook(
      env,
      kofiBody({kofi_transaction_id: 'b', type: 'Shop Order'}),
    );
    await webhook(env, kofiBody({kofi_transaction_id: 'c', currency: 'USD'}));
    expect((await read(env)).raised).toBe(5);
  });

  it('refuses a wrong verification token', async () => {
    const {env} = makeEnv();
    const response = await webhook(
      env,
      kofiBody({verification_token: 'forged'}),
    );
    expect(response.status).toBe(401);
    expect((await read(env)).raised).toBe(0);
  });

  it('lets the admin set the total', async () => {
    const {env} = makeEnv();
    expect((await setTotal(env, {raised: 182.5})).status).toBe(204);
    expect((await read(env)).raised).toBe(182.5);
    await webhook(env, kofiBody({}));
    expect((await read(env)).raised).toBe(187.5);
    expect((await setTotal(env, {raised: 0})).status).toBe(204);
    expect((await read(env)).raised).toBe(0);
  });

  it('refuses a wrong admin token or amount', async () => {
    const {env} = makeEnv();
    expect((await setTotal(env, {raised: 10}, 'nope')).status).toBe(401);
    expect((await setTotal(env, {raised: -1})).status).toBe(400);
    expect((await setTotal(env, {raised: '10'})).status).toBe(400);
    expect(
      (await setTotal(makeEnv({FUNDING_ADMIN_TOKEN: ''}).env, {raised: 1}))
        .status,
    ).toBe(401);
  });

  it('is off without its Durable Object or Ko-fi secret', async () => {
    const {env} = makeEnv({FUNDING: undefined});
    expect(
      (
        await handleRequest(
          new Request('https://relay.example/api/v1/funding'),
          env,
        )
      ).status,
    ).toBe(404);
    const noSecret = makeEnv({KOFI_VERIFICATION_TOKEN: undefined}).env;
    expect((await webhook(noSecret, kofiBody({}))).status).toBe(404);
  });
});
