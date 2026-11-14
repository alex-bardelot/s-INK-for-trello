/**
 * base64url without padding (RFC 4648 §5), written out because `atob` and
 * `btoa` are not guaranteed on the plugin's JavaScript engine.
 */

/* eslint-disable no-bitwise -- 6-bit groups. */

const ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

const VALUES: Record<string, number> = {};
for (let i = 0; i < ALPHABET.length; i++) {
  VALUES[ALPHABET[i]] = i;
}

export function encodeBase64Url(bytes: Uint8Array): string {
  let text = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const chunk =
      (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    const chars = Math.min(4, Math.ceil(((bytes.length - i) * 8) / 6));
    for (let j = 0; j < chars; j++) {
      text += ALPHABET[(chunk >> (18 - 6 * j)) & 63];
    }
  }
  return text;
}

/** @returns The bytes, or `null` if `text` is not base64url. */
export function decodeBase64Url(text: string): Uint8Array | null {
  if (text.length % 4 === 1) {
    return null;
  }
  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const char of text) {
    const value = VALUES[char];
    if (value === undefined) {
      return null;
    }
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
    }
  }
  return Uint8Array.from(bytes);
}
