/** What a secret is replaced with in messages and logs. */
export const MASKED = '[masked]';

/** Shortest secret masked by value: shorter strings would mask ordinary words. */
const MIN_SECRET_LENGTH = 16;

/**
 * Secrets recognizable by their shape, whatever their value: the token in
 * Trello's `/tokens/{token}` path, `token=` parameters (query or fragment),
 * the relay's `k=` key, and the credentials of an `Authorization` header.
 */
const SECRET_SHAPES: readonly [RegExp, string][] = [
  [/(\/tokens\/)[^/?#\s"']+/gi, `$1${MASKED}`],
  [/([?&#](?:token|k|key)=)[^&#\s"']+/gi, `$1${MASKED}`],
  [/(oauth_token=")[^"]*/gi, `$1${MASKED}`],
];

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Replaces the given secrets (the member's token...), as written and as
 * URL-encoded, and anything shaped like a secret, by `[masked]`: error
 * messages carry request paths and server answers, and end up in logs.
 */
export function maskSecrets(
  text: string,
  secrets: readonly (string | null | undefined)[] = [],
): string {
  let masked = text;
  for (const secret of secrets) {
    if (!secret || secret.length < MIN_SECRET_LENGTH) {
      continue;
    }
    for (const form of new Set([secret, encodeURIComponent(secret)])) {
      masked = masked.replace(new RegExp(escapeRegExp(form), 'g'), MASKED);
    }
  }
  for (const [shape, replacement] of SECRET_SHAPES) {
    masked = masked.replace(shape, replacement);
  }
  return masked;
}
