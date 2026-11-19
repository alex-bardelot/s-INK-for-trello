/* eslint-disable no-new-func -- runs the relay page's own crypto code. */
import {
  createHash,
  createHmac,
  randomBytes as nodeRandom,
  webcrypto,
} from 'crypto';

import {CRYPTO_JS} from '../relay/src/pageScript';
import {randomBytes, randomSource} from '../src/platform/random';
import {decodeBase64Url, encodeBase64Url} from '../src/relay/base64url';
import {
  createRelaySession,
  decryptRelayMessage,
  RELAY_SESSION_LIFETIME_MS,
  watchRelaySession,
} from '../src/relay/relaySession';
import {hmacSha256, sha256} from '../src/relay/sha256';

const TOKEN = 'ATTA' + '0123456789abcdef'.repeat(4) + '01234567';

type EncryptToken = (
  token: string,
  key: string,
  id: string,
) => Promise<{v: number; ct: string; tag: string}>;

/** The relay page's encryption, run as served, with Node's WebCrypto. */
const encryptToken = new Function(
  'crypto',
  'atob',
  'btoa',
  `${CRYPTO_JS}; return encryptToken;`,
)(
  webcrypto,
  (s: string) => Buffer.from(s, 'base64').toString('binary'),
  (s: string) => Buffer.from(s, 'binary').toString('base64'),
) as EncryptToken;

describe('sha256 and hmacSha256', () => {
  it.each([0, 1, 3, 55, 56, 63, 64, 65, 119, 120, 1000])(
    'match Node for %i bytes',
    length => {
      const data = nodeRandom(length);
      const key = nodeRandom(length % 100);
      expect(Buffer.from(sha256(data)).toString('hex')).toBe(
        createHash('sha256').update(data).digest('hex'),
      );
      expect(Buffer.from(hmacSha256(key, data)).toString('hex')).toBe(
        createHmac('sha256', key).update(data).digest('hex'),
      );
    },
  );

  it('handles keys longer than a block', () => {
    const key = nodeRandom(100);
    expect(Buffer.from(hmacSha256(key, Uint8Array.of(1))).toString('hex')).toBe(
      createHmac('sha256', key).update(Uint8Array.of(1)).digest('hex'),
    );
  });
});

describe('base64url', () => {
  it.each([0, 1, 2, 3, 16, 32, 33])('round-trips %i bytes', length => {
    const bytes = nodeRandom(length);
    const text = encodeBase64Url(bytes);
    expect(text).toBe(bytes.toString('base64url'));
    expect(Buffer.from(decodeBase64Url(text)!)).toEqual(bytes);
  });

  it('rejects other characters', () => {
    expect(decodeBase64Url('ab+c')).toBeNull();
    expect(decodeBase64Url('a')).toBeNull();
  });
});

describe('randomBytes', () => {
  const original = (globalThis as {crypto?: unknown}).crypto;
  afterEach(() => {
    (globalThis as {crypto?: unknown}).crypto = original;
  });

  it('falls back to a hashed pool without WebCrypto', () => {
    (globalThis as {crypto?: unknown}).crypto = undefined;
    expect(randomSource()).toBe('entropyPool');
    const a = randomBytes(40);
    const b = randomBytes(40);
    expect(a).toHaveLength(40);
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(false);
  });

  it('uses crypto.getRandomValues when present', () => {
    (globalThis as {crypto?: unknown}).crypto = webcrypto;
    expect(randomSource()).toBe('crypto');
    expect(randomBytes(16)).toHaveLength(16);
  });
});

describe('relay session', () => {
  it('builds the page and mailbox addresses', () => {
    const session = createRelaySession('https://relay.example/');
    expect(session.id).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(session.key).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(session.pageUrl).toBe(
      `https://relay.example/connect?s=${session.id}&e=30days#k=${session.key}`,
    );
    expect(
      createRelaySession('https://relay.example', 'never').pageUrl,
    ).toMatch(/\/connect\?s=[A-Za-z0-9_-]{22}&e=never#k=/);
    expect(session.mailboxUrl).toBe(
      `https://relay.example/api/v1/sessions/${session.id}`,
    );
  });

  it('decrypts what the relay page encrypts', async () => {
    const session = createRelaySession('https://relay.example');
    const message = await encryptToken(TOKEN, session.key, session.id);
    expect(decryptRelayMessage(message, session)).toBe(TOKEN);
  });

  it('rejects a message for another session or tampered with', async () => {
    const session = createRelaySession('https://relay.example');
    const other = createRelaySession('https://relay.example');
    const message = await encryptToken(TOKEN, session.key, session.id);
    expect(decryptRelayMessage(message, other)).toBeNull();
    const flipped = message.ct[0] === 'A' ? 'B' : 'A';
    expect(
      decryptRelayMessage(
        {...message, ct: flipped + message.ct.slice(1)},
        session,
      ),
    ).toBeNull();
    expect(decryptRelayMessage({v: 2}, session)).toBeNull();
    expect(decryptRelayMessage(null, session)).toBeNull();
  });
});

describe('watchRelaySession', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  const response = (status: number, body?: unknown) =>
    ({status, json: async () => body} as Response);

  it('polls until the token arrives, then stops', async () => {
    const session = createRelaySession('https://relay.example');
    const message = await encryptToken(TOKEN, session.key, session.id);
    const replies = [response(204), response(204), response(200, message)];
    const fetchImpl = jest.fn(async () => replies.shift() ?? response(204));
    const onToken = jest.fn();
    watchRelaySession({
      session,
      onToken,
      onExpired: jest.fn(),
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await jest.advanceTimersByTimeAsync(10_000);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(fetchImpl).toHaveBeenCalledWith(
      session.mailboxUrl,
      expect.anything(),
    );
    expect(onToken).toHaveBeenCalledWith(TOKEN);
  });

  it('ignores network failures and bad messages', async () => {
    const session = createRelaySession('https://relay.example');
    const fetchImpl = jest
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(response(200, {v: 1, ct: 'AA', tag: 'x'}))
      .mockResolvedValue(response(204));
    const onToken = jest.fn();
    const stop = watchRelaySession({
      session,
      onToken,
      onExpired: jest.fn(),
      fetchImpl,
    });
    await jest.advanceTimersByTimeAsync(10_000);
    expect(fetchImpl.mock.calls.length).toBeGreaterThan(3);
    expect(onToken).not.toHaveBeenCalled();
    stop();
  });

  it('expires after the session lifetime', async () => {
    let clock = 0;
    const onExpired = jest.fn();
    const fetchImpl = jest.fn(async () => response(204));
    watchRelaySession({
      session: createRelaySession('https://relay.example'),
      onToken: jest.fn(),
      onExpired,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      now: () => clock,
    });
    clock = RELAY_SESSION_LIFETIME_MS;
    await jest.advanceTimersByTimeAsync(2000);
    expect(onExpired).toHaveBeenCalledTimes(1);
    const calls = fetchImpl.mock.calls.length;
    await jest.advanceTimersByTimeAsync(10_000);
    expect(fetchImpl).toHaveBeenCalledTimes(calls);
  });

  it('skips polls while paused', async () => {
    const fetchImpl = jest.fn(async () => response(204));
    const stop = watchRelaySession({
      session: createRelaySession('https://relay.example'),
      onToken: jest.fn(),
      onExpired: jest.fn(),
      isPaused: () => true,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await jest.advanceTimersByTimeAsync(10_000);
    expect(fetchImpl).not.toHaveBeenCalled();
    stop();
  });
});
