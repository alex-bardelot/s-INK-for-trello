/**
 * Wire format shared by the relay, the connection page and the plugin.
 * See README.md ("Protocol") for the full description.
 */

/** Version of the message format, stored in the `v` field. */
export const PROTOCOL_VERSION = 1;

/** A session lives this long after the phone has deposited its message. */
export const SESSION_TTL_MS = 10 * 60 * 1000;

/** Largest accepted message body, in bytes. */
export const MAX_MESSAGE_BYTES = 1024;

/**
 * Session ids and keys are 16 random bytes, written in base64url without
 * padding: exactly 22 characters.
 */
export const ID_PATTERN = /^[A-Za-z0-9_-]{22}$/;

/** Encrypted token: up to 256 bytes once decoded. */
const CIPHERTEXT_PATTERN = /^[A-Za-z0-9_-]{1,342}$/;

/** HMAC-SHA256 tag: 32 bytes, so 43 base64url characters. */
const TAG_PATTERN = /^[A-Za-z0-9_-]{43}$/;

/** What the phone deposits and the tablet collects. */
export interface RelayMessage {
  v: typeof PROTOCOL_VERSION;
  /** Token XOR keystream, base64url. */
  ct: string;
  /** HMAC-SHA256 over "sINK-v1" || session id || ciphertext, base64url. */
  tag: string;
}

/**
 * Parses and checks a message body. The relay cannot decrypt it; it only
 * makes sure it has the expected shape and nothing else.
 *
 * @returns The message re-serialized with only the known fields, or `null`.
 */
export function parseRelayMessage(body: string): string | null {
  let value: unknown;
  try {
    value = JSON.parse(body);
  } catch {
    return null;
  }
  const message = value as Partial<RelayMessage> | null;
  if (
    typeof message !== 'object' ||
    message === null ||
    message.v !== PROTOCOL_VERSION ||
    typeof message.ct !== 'string' ||
    typeof message.tag !== 'string' ||
    !CIPHERTEXT_PATTERN.test(message.ct) ||
    !TAG_PATTERN.test(message.tag)
  ) {
    return null;
  }
  const clean: RelayMessage = {
    v: PROTOCOL_VERSION,
    ct: message.ct,
    tag: message.tag,
  };
  return JSON.stringify(clean);
}
