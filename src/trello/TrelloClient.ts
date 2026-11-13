import {TRELLO_API_BASE_URL, TRELLO_REQUEST_TIMEOUT_MS} from './config';
import {TrelloApiError} from './errors';
import {
  NewCard,
  TrelloBoard,
  TrelloBoardCard,
  TrelloBoardMember,
  TrelloCard,
  TrelloList,
  TrelloMember,
} from './types';

type QueryValue = string | number | boolean | undefined;

export interface TrelloClientOptions {
  apiKey: string;
  token: string;
  /** Injected for tests; defaults to the global `fetch`. */
  fetchImpl?: typeof fetch;
  baseUrl?: string;
  timeoutMs?: number;
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  query?: Readonly<Record<string, QueryValue>>;
  /** Sent as JSON. Used for user content, which may exceed URL limits. */
  body?: Readonly<Record<string, unknown>>;
}

const MEMBER_FIELDS = 'username,fullName,initials,url,avatarUrl';
const BOARD_FIELDS =
  'name,url,shortLink,closed,starred,idOrganization,prefs,dateLastActivity';
const LIST_FIELDS = 'name,closed,pos,idBoard';
const BOARD_CARD_FIELDS =
  'name,idList,pos,due,dueComplete,badges,labels,idMembers';
const BOARD_MEMBER_FIELDS = 'fullName,initials,username,avatarUrl';

/** Trello limits, from the REST reference of `POST /1/cards`. */
export const CARD_NAME_MAX_LENGTH = 16384;
export const CARD_DESC_MAX_LENGTH = 16384;

/**
 * Minimal client for the Trello REST API.
 *
 * Credentials are sent in the `Authorization` header rather than in the query
 * string, so that the token never appears in URLs or request logs.
 *
 * @see https://developer.atlassian.com/cloud/trello/guides/rest-api/api-introduction/
 */
export class TrelloClient {
  private readonly apiKey: string;
  private readonly token: string;
  private readonly fetchImpl: typeof fetch;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor({
    apiKey,
    token,
    fetchImpl = fetch,
    baseUrl = TRELLO_API_BASE_URL,
    timeoutMs = TRELLO_REQUEST_TIMEOUT_MS,
  }: TrelloClientOptions) {
    this.apiKey = apiKey;
    this.token = token;
    this.fetchImpl = fetchImpl;
    this.baseUrl = baseUrl;
    this.timeoutMs = timeoutMs;
  }

  /** Returns the member who owns the token. Fails with `unauthorized` if the token is not valid. */
  getMe(): Promise<TrelloMember> {
    return this.request<TrelloMember>('/members/me', {
      query: {fields: MEMBER_FIELDS},
    });
  }

  /** Returns the open boards of the member, starred first, then by name. */
  async getMyBoards(): Promise<TrelloBoard[]> {
    const boards = await this.request<TrelloBoard[]>('/members/me/boards', {
      query: {filter: 'open', fields: BOARD_FIELDS},
    });
    if (!Array.isArray(boards)) {
      throw new TrelloApiError('invalidResponse', 'Expected a list of boards');
    }
    return [...boards].sort(
      (a, b) =>
        Number(b.starred) - Number(a.starred) ||
        a.name.localeCompare(b.name, undefined, {sensitivity: 'base'}),
    );
  }

  /**
   * Returns a board by id or short link. Public boards can be read by any
   * member, even one who does not belong to them.
   */
  getBoard(idOrShortLink: string): Promise<TrelloBoard> {
    return this.request<TrelloBoard>(
      `/boards/${encodeURIComponent(idOrShortLink)}`,
      {query: {fields: BOARD_FIELDS}},
    );
  }

  /** Returns the open lists of a board, in board order. */
  async getBoardLists(boardId: string): Promise<TrelloList[]> {
    const lists = await this.request<TrelloList[]>(
      `/boards/${encodeURIComponent(boardId)}/lists`,
      {query: {filter: 'open', fields: LIST_FIELDS}},
    );
    if (!Array.isArray(lists)) {
      throw new TrelloApiError('invalidResponse', 'Expected a list of lists');
    }
    return [...lists].sort((a, b) => a.pos - b.pos);
  }

  /** Returns the open cards of a board, sorted by position within their list. */
  async getBoardCards(boardId: string): Promise<TrelloBoardCard[]> {
    const cards = await this.request<TrelloBoardCard[]>(
      `/boards/${encodeURIComponent(boardId)}/cards`,
      {query: {filter: 'open', fields: BOARD_CARD_FIELDS}},
    );
    if (!Array.isArray(cards)) {
      throw new TrelloApiError('invalidResponse', 'Expected a list of cards');
    }
    return [...cards].sort((a, b) => a.pos - b.pos);
  }

  /** Returns the members of a board. */
  async getBoardMembers(boardId: string): Promise<TrelloBoardMember[]> {
    const members = await this.request<TrelloBoardMember[]>(
      `/boards/${encodeURIComponent(boardId)}/members`,
      {query: {fields: BOARD_MEMBER_FIELDS}},
    );
    if (!Array.isArray(members)) {
      throw new TrelloApiError('invalidResponse', 'Expected a list of members');
    }
    return members;
  }

  /** Creates a card at the bottom of a list. */
  createCard({idList, name, desc = ''}: NewCard): Promise<TrelloCard> {
    return this.request<TrelloCard>('/cards', {
      method: 'POST',
      body: {
        idList,
        name: name.slice(0, CARD_NAME_MAX_LENGTH),
        desc: desc.slice(0, CARD_DESC_MAX_LENGTH),
        pos: 'bottom',
      },
    });
  }

  /** Revokes the token on Trello's side (used when disconnecting). */
  async revokeToken(): Promise<void> {
    await this.request<unknown>(`/tokens/${encodeURIComponent(this.token)}`, {
      method: 'DELETE',
    });
  }

  private async request<T>(
    path: string,
    {method = 'GET', query = {}, body}: RequestOptions = {},
  ): Promise<T> {
    const url = this.baseUrl + path + buildQueryString(query);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method,
        body: body ? JSON.stringify(body) : undefined,
        headers: {
          Accept: 'application/json',
          ...(body ? {'Content-Type': 'application/json'} : {}),
          Authorization: `OAuth oauth_consumer_key="${this.apiKey}", oauth_token="${this.token}"`,
        },
        signal: controller.signal,
      });
    } catch (error) {
      throw new TrelloApiError(
        'network',
        `${method} ${path} failed: ${describe(error)}`,
      );
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      const kind =
        response.status === 401
          ? 'unauthorized'
          : response.status === 429
          ? 'rateLimited'
          : 'http';
      const detail = await response.text().catch(() => '');
      throw new TrelloApiError(
        kind,
        `${method} ${path} returned HTTP ${response.status}${
          detail ? `: ${detail.slice(0, 200)}` : ''
        }`,
        response.status,
      );
    }

    try {
      return (await response.json()) as T;
    } catch (error) {
      throw new TrelloApiError(
        'invalidResponse',
        `${method} ${path} returned invalid JSON: ${describe(error)}`,
        response.status,
      );
    }
  }
}

function buildQueryString(query: Readonly<Record<string, QueryValue>>): string {
  const parts = Object.entries(query)
    .filter((entry): entry is [string, string | number | boolean] => {
      return entry[1] !== undefined;
    })
    .map(
      ([name, value]) =>
        `${encodeURIComponent(name)}=${encodeURIComponent(String(value))}`,
    );
  return parts.length > 0 ? `?${parts.join('&')}` : '';
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
