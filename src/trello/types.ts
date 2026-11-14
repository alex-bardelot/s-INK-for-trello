/**
 * Subset of the Trello REST API objects used by sINK.
 * Only the fields explicitly requested through `fields=` are declared.
 *
 * @see https://developer.atlassian.com/cloud/trello/rest/
 */

/** The member who owns the token (`GET /1/members/me`). */
export interface TrelloMember {
  id: string;
  username: string;
  fullName: string;
  initials: string;
  url: string;
  /** Base URL of the avatar image (`{avatarUrl}/50.png`), `null` without one. */
  avatarUrl?: string | null;
}

/** A board the member belongs to (`GET /1/members/me/boards`). */
export interface TrelloBoard {
  id: string;
  name: string;
  url: string;
  /** Short id used in board URLs (`trello.com/b/{shortLink}/...`). */
  shortLink: string;
  closed: boolean;
  starred: boolean;
  idOrganization: string | null;
  /** ISO date of the last activity on the board, by any member. */
  dateLastActivity?: string | null;
  /** Display preferences; only the background colors are used. */
  prefs?: TrelloBoardPrefs | null;
  /** Who belongs to the board and with which role. */
  memberships?: TrelloBoardMembership[] | null;
}

/**
 * Role of a member on a board. `observer` can read and comment but not add
 * cards; `normal` and `admin` can edit.
 */
export interface TrelloBoardMembership {
  id: string;
  idMember: string;
  memberType: 'admin' | 'normal' | 'observer' | string;
  deactivated?: boolean;
  unconfirmed?: boolean;
}

/**
 * Background of a board. Plain color backgrounds set `backgroundColor`;
 * photo backgrounds leave it `null` and describe their dominant colors with
 * `backgroundTopColor` / `backgroundBottomColor`.
 */
export interface TrelloBoardPrefs {
  /** Who can see the board: `public`, `org`, `private`… */
  permissionLevel?: string;
  backgroundColor?: string | null;
  backgroundTopColor?: string | null;
  backgroundBottomColor?: string | null;
  /** Full size photo background, `null` for plain colors. */
  backgroundImage?: string | null;
  /** The photo background in several sizes, smallest first. */
  backgroundImageScaled?: TrelloScaledImage[] | null;
}

export interface TrelloScaledImage {
  width: number;
  height: number;
  url: string;
}

/** A workspace owning boards (`GET /1/organizations/{id}`). */
export interface TrelloOrganization {
  id: string;
  /** Name shown to people, e.g. "Acme Design". */
  displayName: string;
  /** Short name used in URLs. */
  name: string;
  /** Base URL of the logo, `null` without one. */
  logoUrl?: string | null;
  logoHash?: string | null;
}

/** A list (column) of a board (`GET /1/boards/{id}/lists`). */
export interface TrelloList {
  id: string;
  name: string;
  closed: boolean;
  pos: number;
  idBoard: string;
}

/** Summary counters Trello computes for a card. */
export interface TrelloCardBadges {
  checkItems: number;
  checkItemsChecked: number;
  /** `true` when the card has a description. */
  description: boolean;
}

/** A label of a board. `color` is a Trello color name, e.g. `green` or `red_dark`. */
export interface TrelloLabel {
  id: string;
  name: string;
  color: string | null;
}

/** A member of a board (`GET /1/boards/{id}/members`). */
export interface TrelloBoardMember {
  id: string;
  fullName: string;
  initials: string;
  username: string;
  /** Base URL of the avatar; append `/50.png` (or 30, 170) for an image. */
  avatarUrl: string | null;
}

/** A card of a board, as shown on the board view (`GET /1/boards/{id}/cards`). */
export interface TrelloBoardCard {
  id: string;
  name: string;
  idList: string;
  pos: number;
  /** Due date as an ISO 8601 string, or `null`. */
  due: string | null;
  dueComplete: boolean;
  badges: TrelloCardBadges;
  labels: TrelloLabel[];
  idMembers: string[];
}

/** An item of a checklist. `state` is `complete` or `incomplete`. */
export interface TrelloCheckItem {
  id: string;
  name: string;
  state: 'complete' | 'incomplete';
  pos: number;
}

/** A checklist of a card, with its items. */
export interface TrelloChecklist {
  id: string;
  name: string;
  pos: number;
  checkItems: TrelloCheckItem[];
}

/** A file or link attached to a card. */
export interface TrelloAttachment {
  id: string;
  name: string;
  url: string;
  /** ISO date the attachment was added. */
  date: string;
}

/** A comment on a card (a `commentCard` action). */
export interface TrelloComment {
  id: string;
  /** ISO date the comment was written. */
  date: string;
  data: {text: string};
  memberCreator?: {
    id: string;
    fullName: string;
    initials: string;
    avatarUrl?: string | null;
  } | null;
}

/**
 * A card with everything its detail page shows
 * (`GET /1/cards/{id}` with nested checklists, attachments, members,
 * comments and list).
 */
export interface TrelloCardDetail {
  id: string;
  name: string;
  desc: string;
  idList: string;
  url: string;
  shortUrl: string;
  /** Start date as an ISO 8601 string, or `null`. */
  start: string | null;
  /** Due date as an ISO 8601 string, or `null`. */
  due: string | null;
  dueComplete: boolean;
  dateLastActivity: string | null;
  labels: TrelloLabel[];
  idMembers: string[];
  members?: TrelloBoardMember[];
  checklists?: TrelloChecklist[];
  attachments?: TrelloAttachment[];
  /** Latest comments, newest first. */
  actions?: TrelloComment[];
  list?: Pick<TrelloList, 'id' | 'name'> | null;
}

/** A card, as returned by `POST /1/cards`. */
export interface TrelloCard {
  id: string;
  name: string;
  url: string;
  shortUrl: string;
}

/** Fields needed to create a card. */
export interface NewCard {
  idList: string;
  name: string;
  desc?: string;
}
