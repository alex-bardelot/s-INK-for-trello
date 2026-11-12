/**
 * Subset of the Trello REST API objects used by SuperTrello.
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
  closed: boolean;
  starred: boolean;
  idOrganization: string | null;
}
