import {KeyValueStore} from '../storage/keyValueStore';

/** Storage key of the last total read, shown offline. */
export const FUNDING_CACHE_KEY = 'supertrello.support.funding';

/** Maximum duration of the request, in milliseconds. */
const FUNDING_TIMEOUT_MS = 10_000;

/** Amount raised toward the funding goal, as the relay answers it. */
export interface FundingTotal {
  /** In the currency's main unit (euros). */
  raised: number;
  currency: string;
  /** Milliseconds since the epoch; 0 if it never changed. */
  updatedAt: number;
}

/** Checks an answer of the relay (or a cached one); `null` if invalid. */
export function parseFundingTotal(value: unknown): FundingTotal | null {
  const total = value as Partial<FundingTotal> | null;
  if (
    typeof total?.raised !== 'number' ||
    !Number.isFinite(total.raised) ||
    total.raised < 0 ||
    typeof total.currency !== 'string' ||
    !/^[A-Z]{3}$/.test(total.currency)
  ) {
    return null;
  }
  return {
    raised: total.raised,
    currency: total.currency,
    updatedAt:
      typeof total.updatedAt === 'number' && Number.isFinite(total.updatedAt)
        ? total.updatedAt
        : 0,
  };
}

/** Reads the total from the relay; `null` on any failure. */
export async function fetchFundingTotal(
  url: string,
  fetchImpl: typeof fetch = fetch,
  timeoutMs: number = FUNDING_TIMEOUT_MS,
): Promise<FundingTotal | null> {
  if (!url) {
    return null;
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>(resolve => {
    timer = setTimeout(() => resolve(null), timeoutMs);
  });
  const request = (async () => {
    try {
      const response = await fetchImpl(url, {
        headers: {Accept: 'application/json'},
      });
      return response.ok ? parseFundingTotal(await response.json()) : null;
    } catch (error) {
      console.warn('[sINK] Failed to read the funding total', error);
      return null;
    }
  })();
  try {
    return await Promise.race([request, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

export async function loadCachedFunding(
  store: KeyValueStore,
): Promise<FundingTotal | null> {
  try {
    const raw = await store.getItem(FUNDING_CACHE_KEY);
    return raw ? parseFundingTotal(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export async function saveCachedFunding(
  store: KeyValueStore,
  total: FundingTotal,
): Promise<void> {
  try {
    await store.setItem(FUNDING_CACHE_KEY, JSON.stringify(total));
  } catch (error) {
    console.warn('[sINK] Failed to keep the funding total', error);
  }
}

/** Where the goal stands, for the progress bar and its texts. */
export interface FundingProgress {
  /** Whole euros raised, rounded down (a goal is never reached early). */
  raised: number;
  target: number;
  /** 0 to 100, for the bar. */
  percent: number;
  reached: boolean;
}

export function fundingProgress(
  raised: number,
  target: number,
): FundingProgress {
  const whole = Math.max(0, Math.floor(raised));
  const reached = target > 0 && raised >= target;
  const percent =
    target > 0 ? Math.min(100, Math.floor((raised / target) * 100)) : 0;
  return {raised: whole, target, percent: Math.max(0, percent), reached};
}
