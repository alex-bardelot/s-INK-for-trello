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
