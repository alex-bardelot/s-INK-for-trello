import {TRELLO_RELAY_URL} from '../trello/config';

/**
 * Addresses and goal of the Support s-INK page (Settings).
 *
 * A link left empty is not offered: its block says it comes soon.
 */

/** s-INK's page on InkHub, where bugs, ideas and ratings go for now. */
export const INKHUB_URL = '';

/** Donation page (Ko-fi). */
export const DONATION_URL = 'https://ko-fi.com/alexandrebardelot';

/**
 * Total raised, kept by the relay from the Ko-fi webhook (see
 * relay/README.md, "Funding goal"). Empty without a relay.
 */
export const FUNDING_URL = TRELLO_RELAY_URL
  ? `${TRELLO_RELAY_URL}/api/v1/funding`
  : '';

/** Current funding goal; its texts are in the `support.goal*` keys. */
export const FUNDING_GOAL = {
  /** Amount to raise, in {@link FUNDING_GOAL.currency}. */
  target: 528,
  currency: 'EUR',
} as const;
