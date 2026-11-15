import {displayUrl} from '../src/platform/browser';
import {createMemoryStore} from '../src/storage/keyValueStore';
import {
  FUNDING_CACHE_KEY,
  fetchFundingTotal,
  fundingProgress,
  loadCachedFunding,
  parseFundingTotal,
  saveCachedFunding,
} from '../src/support/funding';

const TOTAL = {raised: 182.5, currency: 'EUR', updatedAt: 1000};

const answer = (status: number, body: unknown) =>
  (async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  })) as unknown as typeof fetch;

describe('parseFundingTotal', () => {
  it('keeps a valid total', () => {
    expect(parseFundingTotal(TOTAL)).toEqual(TOTAL);
    expect(parseFundingTotal({raised: 0, currency: 'EUR'})).toEqual({
      raised: 0,
      currency: 'EUR',
      updatedAt: 0,
    });
  });

  it.each([
    null,
    'text',
    {},
    {raised: -1, currency: 'EUR'},
    {raised: Infinity, currency: 'EUR'},
    {raised: '5', currency: 'EUR'},
    {raised: 5, currency: 'euro'},
  ])('rejects %p', value => {
    expect(parseFundingTotal(value)).toBeNull();
  });
});

describe('fetchFundingTotal', () => {
  beforeEach(() => jest.spyOn(console, 'warn').mockImplementation(() => {}));
  afterEach(() => jest.restoreAllMocks());

  it('reads the relay answer', async () => {
    expect(
      await fetchFundingTotal('https://relay', answer(200, TOTAL)),
    ).toEqual(TOTAL);
  });

  it('gives null on errors, bad answers or no address', async () => {
    expect(await fetchFundingTotal('https://relay', answer(500, TOTAL))).toBe(
      null,
    );
    expect(await fetchFundingTotal('https://relay', answer(200, {}))).toBe(
      null,
    );
    const failing = (() =>
      Promise.reject(new Error('offline'))) as unknown as typeof fetch;
    expect(await fetchFundingTotal('https://relay', failing)).toBeNull();
    expect(await fetchFundingTotal('', answer(200, TOTAL))).toBeNull();
  });

  it('gives up after the timeout', async () => {
    const never = (() => new Promise(() => {})) as unknown as typeof fetch;
    expect(await fetchFundingTotal('https://relay', never, 10)).toBeNull();
  });
});

describe('funding cache', () => {
  it('keeps the last total', async () => {
    const store = createMemoryStore();
    expect(await loadCachedFunding(store)).toBeNull();
    await saveCachedFunding(store, TOTAL);
    expect(await loadCachedFunding(store)).toEqual(TOTAL);
  });

  it('ignores a damaged cache', async () => {
    const store = createMemoryStore();
    await store.setItem(FUNDING_CACHE_KEY, '{oops');
    expect(await loadCachedFunding(store)).toBeNull();
  });
});

describe('fundingProgress', () => {
  it.each([
    [0, {raised: 0, percent: 0, reached: false}],
    [182.5, {raised: 182, percent: 34, reached: false}],
    [527.99, {raised: 527, percent: 99, reached: false}],
    [528, {raised: 528, percent: 100, reached: true}],
    [600, {raised: 600, percent: 100, reached: true}],
  ])('places %p of 528', (raised, expected) => {
    expect(fundingProgress(raised, 528)).toEqual({...expected, target: 528});
  });
});

describe('displayUrl', () => {
  it('drops the scheme and the trailing slash', () => {
    expect(displayUrl('https://ko-fi.com/sink/')).toBe('ko-fi.com/sink');
    expect(displayUrl('http://example.com/a?b')).toBe('example.com/a?b');
  });
});
