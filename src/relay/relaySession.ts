/**
 * Plugin side of the s-INK relay (see relay/README.md): starts a session,
 * waits for the encrypted token the browser deposits, and decrypts it.
 */
import {randomBytes} from '../platform/random';
import {utf8Bytes} from '../qr/qrCode';
import {
  DEFAULT_TOKEN_EXPIRATION,
  normalizeToken,
  TokenExpiration,
} from '../trello';
import {decodeBase64Url, encodeBase64Url} from './base64url';
import {concatBytes, equalBytes, hmacSha256, sha256} from './sha256';

/* eslint-disable no-bitwise -- keystream XOR and counter bytes. */

/** Delay between two polls of the relay, in milliseconds. */
export const RELAY_POLL_INTERVAL_MS = 2000;

/** A session is abandoned (and replaced) after this long, like on the relay. */
export const RELAY_SESSION_LIFETIME_MS = 10 * 60 * 1000;

export interface RelaySession {
  id: string;
  key: string;
  /** Address of the connection page, for the QR code and the browser. */
  pageUrl: string;
  /** Address the plugin polls. */
  mailboxUrl: string;
}

/**
 * Starts a session: 16 random bytes of id and 16 of key. The page asks
 * Trello for a token of the given lifetime (`e=`).
 */
export function createRelaySession(
  relayUrl: string,
  expiration: TokenExpiration = DEFAULT_TOKEN_EXPIRATION,
): RelaySession {
  const base = relayUrl.replace(/\/+$/, '');
  const id = encodeBase64Url(randomBytes(16));
  const key = encodeBase64Url(randomBytes(16));
  return {
    id,
    key,
    pageUrl: `${base}/connect?s=${id}&e=${expiration}#k=${key}`,
    mailboxUrl: `${base}/api/v1/sessions/${id}`,
  };
}

/**
 * Decrypts a relay message (`{v: 1, ct, tag}`).
 *
 * @returns The token, or `null` if the message is malformed, was not
 *   encrypted with this session's key and id, or holds no token.
 */
export function decryptRelayMessage(
  message: unknown,
  session: Pick<RelaySession, 'id' | 'key'>,
): string | null {
  const {v, ct, tag} = (message ?? {}) as Record<string, unknown>;
  if (v !== 1 || typeof ct !== 'string' || typeof tag !== 'string') {
    return null;
  }
  const key = decodeBase64Url(session.key);
  const ciphertext = decodeBase64Url(ct);
  const receivedTag = decodeBase64Url(tag);
  if (!key || !ciphertext || !receivedTag) {
    return null;
  }

  const ascii = (text: string) => Uint8Array.from(utf8Bytes(text));
  const macKey = sha256(concatBytes(key, ascii('sINK-mac')));
  const expectedTag = hmacSha256(
    macKey,
    concatBytes(ascii('sINK-v1'), ascii(session.id), ciphertext),
  );
  if (!equalBytes(expectedTag, receivedTag)) {
    return null;
  }

  let text = '';
  let stream = new Uint8Array(0);
  for (let i = 0; i < ciphertext.length; i++) {
    if (i % 32 === 0) {
      const block = i / 32;
      const counter = Uint8Array.from([
        block >>> 24,
        (block >>> 16) & 255,
        (block >>> 8) & 255,
        block & 255,
      ]);
      stream = sha256(concatBytes(key, ascii('sINK-enc'), counter));
    }
    text += String.fromCharCode(ciphertext[i] ^ stream[i % 32]);
  }
  // Tokens are ASCII; normalizeToken rejects anything else.
  return normalizeToken(text);
}

export interface RelayWatchOptions {
  session: RelaySession;
  /** Called once with the decrypted token; polling stops first. */
  onToken: (token: string) => void;
  /** Called when the session outlived its lifetime; polling stops first. */
  onExpired: () => void;
  /** While it returns `true`, polls are skipped. */
  isPaused?: () => boolean;
  fetchImpl?: typeof fetch;
  intervalMs?: number;
  now?: () => number;
}

/**
 * Polls the relay until the browser has deposited the token. Network
 * failures and messages that do not decrypt are ignored: the user can still
 * paste the token by hand meanwhile.
 *
 * @returns A function that stops polling.
 */
export function watchRelaySession({
  session,
  onToken,
  onExpired,
  isPaused = () => false,
  fetchImpl = fetch,
  intervalMs = RELAY_POLL_INTERVAL_MS,
  now = Date.now,
}: RelayWatchOptions): () => void {
  const startedAt = now();
  let stopped = false;
  let polling = false;

  const stop = () => {
    stopped = true;
    clearInterval(timer);
  };

  const poll = async () => {
    if (stopped || polling || isPaused()) {
      return;
    }
    if (now() - startedAt >= RELAY_SESSION_LIFETIME_MS) {
      stop();
      onExpired();
      return;
    }
    polling = true;
    try {
      const response = await fetchImpl(session.mailboxUrl, {
        headers: {Accept: 'application/json'},
      });
      if (stopped || response.status !== 200) {
        return;
      }
      const token = decryptRelayMessage(await response.json(), session);
      if (token && !stopped) {
        stop();
        onToken(token);
      } else if (!token) {
        console.warn('[sINK] Ignored a relay message that does not decrypt');
      }
    } catch (error) {
      console.warn('[sINK] Relay poll failed', error);
    } finally {
      polling = false;
    }
  };

  const timer = setInterval(poll, intervalMs);
  return stop;
}
