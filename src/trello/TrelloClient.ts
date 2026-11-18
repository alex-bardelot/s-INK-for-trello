import {connectivity, ConnectivityMonitor} from '../network/connectivity';
import {TRELLO_API_BASE_URL, TRELLO_REQUEST_TIMEOUT_MS} from './config';
import {TrelloApiError} from './errors';
import {
  NewCard,
  TrelloBoard,
  TrelloBoardCard,
  TrelloBoardMember,
  TrelloCard,
  TrelloCardDetail,
  TrelloCardLocation,
  TrelloComment,
  TrelloLabel,
  TrelloList,
  TrelloMember,
  TrelloNewChecklist,
  TrelloOrganization,
} from './types';

type QueryValue = string | number | boolean | undefined;

export interface TrelloClientOptions {
  apiKey: string;
  /**
   * Member token. Without one, the client is anonymous: it can only read
   * public boards, such as Supernote's roadmap.
   */
  token?: string;
  /** Injected for tests; defaults to the global `fetch`. */
  fetchImpl?: typeof fetch;
  baseUrl?: string;
  timeoutMs?: number;
  /** Told whether each request got an answer; defaults to the plugin's. */
  connectivity?: Pick<ConnectivityMonitor, 'reportOnline' | 'reportNoAnswer'>;
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  query?: Readonly<Record<string, QueryValue>>;
  /** Sent as JSON. Used for user content, which may exceed URL limits. */
  body?: Readonly<Record<string, unknown>>;
}

const MEMBER_FIELDS = 'username,fullName,initials,url,avatarUrl';
const BOARD_FIELDS =
  'name,url,shortLink,closed,starred,idOrganization,prefs,dateLastActivity,memberships';
const LIST_FIELDS = 'name,closed,pos,idBoard';
const BOARD_CARD_FIELDS =
  'name,idList,pos,due,dueComplete,badges,labels,idMembers,shortLink';
const BOARD_MEMBER_FIELDS = 'fullName,initials,username,avatarUrl';
const CARD_DETAIL_FIELDS =
  'name,desc,idBoard,idList,url,shortUrl,shortLink,start,due,dueComplete,dateLastActivity,labels,idMembers';
/** Labels read from a board (Trello's maximum). */
const BOARD_LABELS_LIMIT = 1000;
/** Comments shown on the card detail page, newest first. */
export const CARD_COMMENTS_LIMIT = 20;
const ORGANIZATION_FIELDS = 'displayName,name,logoUrl,logoHash';

/**
 * URL of a workspace logo at about `size` pixels. Trello gives `logoUrl` as
 * a base URL to complete with `/{size}.png`, like member avatars; older
 * workspaces only have a `logoHash`.
 */
export function organizationLogoUrl(
  organization: Pick<TrelloOrganization, 'id' | 'logoUrl' | 'logoHash'>,
  size: 30 | 50 | 170,
): string | null {
  const {logoUrl, logoHash} = organization;
  if (logoUrl) {
    return /\.(png|jpe?g|gif)$/i.test(logoUrl)
      ? logoUrl
      : `${logoUrl.replace(/\/$/, '')}/${size}.png`;
  }
  if (logoHash) {
    return `https://trello-logos.s3.amazonaws.com/${organization.id}/${logoHash}/${size}.png`;
  }
  return null;
}

/** Trello limits, from the REST reference of `POST /1/cards`. */
export const CARD_NAME_MAX_LENGTH = 16384;
export const CARD_DESC_MAX_LENGTH = 16384;
/** Trello limit of a checklist or checklist item name. */
export const CHECKLIST_NAME_MAX_LENGTH = 16384;
/** Trello limit of a comment's text. */
export const COMMENT_MAX_LENGTH = 16384;

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
  private readonly token: string | undefined;
  private readonly fetchImpl: typeof fetch;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly connectivity: NonNullable<
    TrelloClientOptions['connectivity']
  >;

  constructor({
    apiKey,
    token,
    fetchImpl = fetch,
    baseUrl = TRELLO_API_BASE_URL,
    timeoutMs = TRELLO_REQUEST_TIMEOUT_MS,
    connectivity: monitor = connectivity,
  }: TrelloClientOptions) {
    this.apiKey = apiKey;
    this.token = token;
    this.fetchImpl = fetchImpl;
    this.baseUrl = baseUrl;
    this.timeoutMs = timeoutMs;
    this.connectivity = monitor;
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

  /** Returns a workspace by id (its logo is shown on the board tiles). */
  getOrganization(id: string): Promise<TrelloOrganization> {
    return this.request<TrelloOrganization>(
      `/organizations/${encodeURIComponent(id)}`,
      {query: {fields: ORGANIZATION_FIELDS}},
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

  /**
   * Returns a card with what its detail page shows, in one request: its
   * checklists, attachments, members, list and latest comments.
   */
  async getCardDetail(cardId: string): Promise<TrelloCardDetail> {
    const card = await this.request<TrelloCardDetail>(
      `/cards/${encodeURIComponent(cardId)}`,
      {
        query: {
          fields: CARD_DETAIL_FIELDS,
          members: true,
          member_fields: BOARD_MEMBER_FIELDS,
          checklists: 'all',
          checklist_fields: 'name,pos',
          attachments: true,
          attachment_fields: 'name,url,date',
          actions: 'commentCard',
          actions_limit: CARD_COMMENTS_LIMIT,
          action_fields: 'data,date',
          action_memberCreator_fields: 'fullName,initials,avatarUrl',
          list: true,
          list_fields: 'name',
        },
      },
    );
    if (!card || typeof card !== 'object' || typeof card.id !== 'string') {
      throw new TrelloApiError('invalidResponse', 'Expected a card');
    }
    return card;
  }

  /** Returns the id and board of a card, given its id or short link. */
  async getCardLocation(idOrShortLink: string): Promise<TrelloCardLocation> {
    const card = await this.request<TrelloCardLocation>(
      `/cards/${encodeURIComponent(idOrShortLink)}`,
      {query: {fields: 'idBoard'}},
    );
    if (
      !card ||
      typeof card.id !== 'string' ||
      typeof card.idBoard !== 'string'
    ) {
      throw new TrelloApiError('invalidResponse', 'Expected a card');
    }
    return card;
  }

  /** Creates a card at the bottom of a list, with labels and members. */
  createCard({
    idList,
    name,
    desc = '',
    idLabels = [],
    idMembers = [],
  }: NewCard): Promise<TrelloCard> {
    return this.request<TrelloCard>('/cards', {
      method: 'POST',
      body: {
        idList,
        name: name.slice(0, CARD_NAME_MAX_LENGTH),
        desc: desc.slice(0, CARD_DESC_MAX_LENGTH),
        pos: 'bottom',
        // Trello takes both as comma-separated lists of ids.
        ...(idLabels.length > 0 ? {idLabels: idLabels.join(',')} : {}),
        ...(idMembers.length > 0 ? {idMembers: idMembers.join(',')} : {}),
      },
    });
  }

  /** Adds an empty checklist at the bottom of a card. */
  createChecklist(cardId: string, name: string): Promise<TrelloNewChecklist> {
    return this.request<TrelloNewChecklist>('/checklists', {
      method: 'POST',
      body: {
        idCard: cardId,
        name: name.slice(0, CHECKLIST_NAME_MAX_LENGTH),
        pos: 'bottom',
      },
    });
  }

  /** Adds an item at the bottom of a checklist, ticked or not. */
  async addCheckItem(
    checklistId: string,
    name: string,
    checked = false,
  ): Promise<void> {
    await this.request<unknown>(
      `/checklists/${encodeURIComponent(checklistId)}/checkItems`,
      {
        method: 'POST',
        body: {
          name: name.slice(0, CHECKLIST_NAME_MAX_LENGTH),
          checked,
          pos: 'bottom',
        },
      },
    );
  }

  /** Ticks or unticks an item of one of the card's checklists. */
  async setCheckItemState(
    cardId: string,
    checkItemId: string,
    complete: boolean,
  ): Promise<void> {
    await this.request<unknown>(
      `/cards/${encodeURIComponent(cardId)}/checkItem/${encodeURIComponent(
        checkItemId,
      )}`,
      {
        method: 'PUT',
        body: {state: complete ? 'complete' : 'incomplete'},
      },
    );
  }

  /**
   * Writes a comment on a card, as the signed-in member, and returns it as
   * Trello stored it (with its id, date and author).
   */
  async addCardComment(cardId: string, text: string): Promise<TrelloComment> {
    const comment = await this.request<TrelloComment>(
      `/cards/${encodeURIComponent(cardId)}/actions/comments`,
      {method: 'POST', body: {text: text.slice(0, COMMENT_MAX_LENGTH)}},
    );
    if (
      !comment ||
      typeof comment.id !== 'string' ||
      typeof comment.data?.text !== 'string'
    ) {
      throw new TrelloApiError('invalidResponse', 'Expected a comment');
    }
    return comment;
  }

  /** Returns the labels of a board, named or not. */
  async getBoardLabels(boardId: string): Promise<TrelloLabel[]> {
    const labels = await this.request<TrelloLabel[]>(
      `/boards/${encodeURIComponent(boardId)}/labels`,
      {query: {fields: 'name,color', limit: BOARD_LABELS_LIMIT}},
    );
    if (!Array.isArray(labels)) {
      throw new TrelloApiError('invalidResponse', 'Expected a list of labels');
    }
    return labels;
  }

  /** Adds a member to a card. */
  async addCardMember(cardId: string, memberId: string): Promise<void> {
    await this.request<unknown>(
      `/cards/${encodeURIComponent(cardId)}/idMembers`,
      {method: 'POST', body: {value: memberId}},
    );
  }

  /** Takes a member off a card; they stay on the board. */
  async removeCardMember(cardId: string, memberId: string): Promise<void> {
    await this.request<unknown>(
      `/cards/${encodeURIComponent(cardId)}/idMembers/${encodeURIComponent(
        memberId,
      )}`,
      {method: 'DELETE'},
    );
  }

  /** Puts a label of the board on a card. */
  async addCardLabel(cardId: string, labelId: string): Promise<void> {
    await this.request<unknown>(
      `/cards/${encodeURIComponent(cardId)}/idLabels`,
      {method: 'POST', body: {value: labelId}},
    );
  }

  /** Takes a label off a card; the label stays on the board. */
  async removeCardLabel(cardId: string, labelId: string): Promise<void> {
    await this.request<unknown>(
      `/cards/${encodeURIComponent(cardId)}/idLabels/${encodeURIComponent(
        labelId,
      )}`,
      {method: 'DELETE'},
    );
  }

  /**
   * Creates a label on the card's board, without a color, and puts it on
   * the card.
   */
  createCardLabel(cardId: string, name: string): Promise<TrelloLabel> {
    return this.request<TrelloLabel>(
      `/cards/${encodeURIComponent(cardId)}/labels`,
      {method: 'POST', body: {name, color: null}},
    );
  }

  /** Moves a card to the top of a list of the same board. */
  async moveCard(cardId: string, listId: string): Promise<void> {
    await this.request<unknown>(`/cards/${encodeURIComponent(cardId)}`, {
      method: 'PUT',
      body: {idList: listId, pos: 'top'},
    });
  }

  /**
   * Marks a card complete, or not: the round check before its name on
   * Trello, kept in the card's `dueComplete` even when it has no due date.
   */
  async setCardComplete(cardId: string, complete: boolean): Promise<void> {
    await this.request<unknown>(`/cards/${encodeURIComponent(cardId)}`, {
      method: 'PUT',
      body: {dueComplete: complete},
    });
  }

  /** Replaces a card's description (Markdown, as Trello stores it). */
  async setCardDescription(cardId: string, desc: string): Promise<void> {
    await this.request<unknown>(`/cards/${encodeURIComponent(cardId)}`, {
      method: 'PUT',
      body: {desc: desc.slice(0, CARD_DESC_MAX_LENGTH)},
    });
  }

  /** Archives a card: it leaves its list, and can be sent back from Trello. */
  async archiveCard(cardId: string): Promise<void> {
    await this.request<unknown>(`/cards/${encodeURIComponent(cardId)}`, {
      method: 'PUT',
      body: {closed: true},
    });
  }

  /** Revokes the token on Trello's side (used when disconnecting). */
  async revokeToken(): Promise<void> {
    if (!this.token) {
      return;
    }
    await this.request<unknown>(`/tokens/${encodeURIComponent(this.token)}`, {
      method: 'DELETE',
    });
  }

  private async request<T>(
    path: string,
    {method = 'GET', query = {}, body}: RequestOptions = {},
  ): Promise<T> {
    // Anonymous requests carry no credentials at all: Trello rejects a key
    // without a token with HTTP 401 "missing scopes", while public boards
    // are readable with no key.
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
          ...(this.token
            ? {
                Authorization: `OAuth oauth_consumer_key="${this.apiKey}", oauth_token="${this.token}"`,
              }
            : {}),
        },
        signal: controller.signal,
      });
    } catch (error) {
      this.connectivity.reportNoAnswer();
      throw new TrelloApiError(
        'network',
        `${method} ${path} failed: ${describe(error)}`,
      );
    } finally {
      clearTimeout(timeout);
    }
    this.connectivity.reportOnline();

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
