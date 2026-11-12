/** Categories of failures returned by {@link TrelloClient}. */
export type TrelloErrorKind =
  /** HTTP 401: the token is invalid, expired or revoked. */
  | 'unauthorized'
  /** HTTP 429: a Trello rate limit was exceeded. */
  | 'rateLimited'
  /** Any other non-2xx HTTP status. */
  | 'http'
  /** The request could not be sent or timed out (no Wi-Fi, DNS, ...). */
  | 'network'
  /** The response body is not the JSON we expected. */
  | 'invalidResponse';

/** Error raised for every failed Trello API call. */
export class TrelloApiError extends Error {
  readonly kind: TrelloErrorKind;
  /** HTTP status, when a response was received. */
  readonly status?: number;

  constructor(kind: TrelloErrorKind, message: string, status?: number) {
    super(message);
    this.name = 'TrelloApiError';
    this.kind = kind;
    this.status = status;
  }
}

/** Type guard for {@link TrelloApiError}. */
export function isTrelloApiError(error: unknown): error is TrelloApiError {
  return error instanceof TrelloApiError;
}
