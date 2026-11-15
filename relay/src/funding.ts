/**
 * Donation total of the s-INK funding goal: fed by the Ko-fi webhook, read
 * by the plugin's Support page.
 *
 * Only the running total is kept, in cents, with the ids of the Ko-fi
 * transactions already counted (Ko-fi may send a webhook more than once).
 * The donor's name, email and message, which Ko-fi sends too, are never
 * stored.
 */

/** The part of the Durable Object storage API used here. */
export interface FundingStorage {
  get<T>(key: string): Promise<T | undefined>;
  put<T>(key: string, value: T): Promise<void>;
}

export interface FundingState {
  storage: FundingStorage;
}

/** What `GET /api/v1/funding` answers. */
export interface FundingTotal {
  /** Amount raised, in the currency's main unit (euros), two decimals. */
  raised: number;
  currency: string;
  /** Time of the last change, in milliseconds since the epoch (0: never). */
  updatedAt: number;
}

interface StoredTotal {
  cents: number;
  updatedAt: number;
}

const TOTAL_KEY = 'total';
const TRANSACTION_PREFIX = 'tx:';

/** Ko-fi payment types that count toward the goal. */
const COUNTED_TYPES: ReadonlySet<string> = new Set([
  'Donation',
  'Subscription',
]);

/** One payment as Ko-fi describes it in its webhook. */
export interface KofiPayment {
  verificationToken: string;
  transactionId: string;
  type: string;
  /** Amount in cents. */
  cents: number;
  currency: string;
}

/**
 * Reads the body of a Ko-fi webhook: a form with a single `data` field
 * holding JSON. Returns `null` when it is not one.
 *
 * @see https://ko-fi.com/manage/webhooks
 */
export function parseKofiWebhook(form: string): KofiPayment | null {
  const raw = new URLSearchParams(form).get('data');
  if (!raw) {
    return null;
  }
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  const text = (key: string) =>
    typeof data[key] === 'string' ? (data[key] as string) : '';
  const cents = parseCents(text('amount'));
  if (
    !text('verification_token') ||
    !text('kofi_transaction_id') ||
    cents === null
  ) {
    return null;
  }
  return {
    verificationToken: text('verification_token'),
    transactionId: text('kofi_transaction_id'),
    type: text('type'),
    cents,
    currency: text('currency').toUpperCase(),
  };
}

/** `"3.50"` → 350; `null` for anything but a positive decimal amount. */
export function parseCents(amount: string): number | null {
  const match = /^(\d{1,7})(?:\.(\d{1,2}))?$/.exec(amount.trim());
  if (!match) {
    return null;
  }
  const cents =
    Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
  return cents > 0 ? cents : null;
}

/** Compares two secrets in a time that does not depend on where they differ. */
export function sameSecret(a: string, b: string): boolean {
  const left = new TextEncoder().encode(a);
  const right = new TextEncoder().encode(b);
  if (left.length === 0 || left.length !== right.length) {
    return false;
  }
  let difference = 0;
  for (let i = 0; i < left.length; i++) {
    // eslint-disable-next-line no-bitwise -- constant-time comparison.
    difference |= left[i] ^ right[i];
  }
  return difference === 0;
}

/**
 * The single Durable Object holding the total. A Durable Object rather
 * than KV so that two webhooks arriving together cannot lose a donation:
 * its requests run one at a time.
 *
 * - `GET` answers the total in cents.
 * - `POST` adds a payment `{transactionId, cents}`, once per transaction.
 * - `PUT` sets the total `{cents}` (manual correction).
 */
export class FundingBox {
  constructor(private readonly state: FundingState, _env?: unknown) {}

  async fetch(request: Request): Promise<Response> {
    switch (request.method) {
      case 'GET':
        return new Response(JSON.stringify(await this.total()), {
          headers: {'Content-Type': 'application/json'},
        });
      case 'POST':
        return this.add(await request.json());
      case 'PUT':
        return this.set(await request.json());
      default:
        return new Response(null, {
          status: 405,
          headers: {Allow: 'GET, POST, PUT'},
        });
    }
  }

  private async total(): Promise<StoredTotal> {
    return (
      (await this.state.storage.get<StoredTotal>(TOTAL_KEY)) ?? {
        cents: 0,
        updatedAt: 0,
      }
    );
  }

  private async add(payment: {
    transactionId: string;
    cents: number;
  }): Promise<Response> {
    const {storage} = this.state;
    const key = TRANSACTION_PREFIX + payment.transactionId;
    if (await storage.get<boolean>(key)) {
      return new Response(null, {status: 200});
    }
    const total = await this.total();
    await storage.put(key, true);
    await storage.put<StoredTotal>(TOTAL_KEY, {
      cents: total.cents + payment.cents,
      updatedAt: Date.now(),
    });
    return new Response(null, {status: 201});
  }

  private async set({cents}: {cents: number}): Promise<Response> {
    await this.state.storage.put<StoredTotal>(TOTAL_KEY, {
      cents,
      updatedAt: Date.now(),
    });
    return new Response(null, {status: 204});
  }
}

/** Whether a Ko-fi payment counts toward the goal. */
export function countsTowardGoal(
  payment: KofiPayment,
  currency: string,
): boolean {
  return COUNTED_TYPES.has(payment.type) && payment.currency === currency;
}

/** The stored total as the plugin reads it. */
export function toFundingTotal(
  stored: StoredTotal,
  currency: string,
): FundingTotal {
  return {
    raised: Math.round(stored.cents) / 100,
    currency,
    updatedAt: stored.updatedAt,
  };
}
