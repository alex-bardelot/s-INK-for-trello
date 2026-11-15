import {
  ConnectivityMonitor,
  PROBE_URL,
} from '../src/network/connectivity';
import {TrelloClient} from '../src/trello';

describe('ConnectivityMonitor', () => {
  afterEach(() => jest.useRealTimers());

  it('starts online and notifies each change once', () => {
    const monitor = new ConnectivityMonitor({fetchImpl: jest.fn()});
    const listener = jest.fn();
    const stop = monitor.subscribe(listener);

    expect(monitor.current).toBe('online');
    monitor.reportOffline();
    monitor.reportOffline();
    expect(monitor.current).toBe('offline');
    expect(listener).toHaveBeenCalledTimes(1);
    monitor.reportOnline();
    expect(monitor.current).toBe('online');
    expect(listener).toHaveBeenCalledTimes(2);
    stop();
  });

  it('is online when the probe gets any answer', async () => {
    const fetchImpl = jest.fn(async () => ({status: 404}) as Response);
    const monitor = new ConnectivityMonitor({fetchImpl});
    monitor.reportOffline();

    expect(await monitor.probe()).toBe(true);
    expect(monitor.current).toBe('online');
    expect(fetchImpl).toHaveBeenCalledWith(
      PROBE_URL,
      expect.objectContaining({method: 'HEAD'}),
    );
  });

  it('is offline when the probe gets no answer', async () => {
    const monitor = new ConnectivityMonitor({
      fetchImpl: jest.fn(async () => {
        throw new TypeError('Network request failed');
      }),
    });

    expect(await monitor.probe()).toBe(false);
    expect(monitor.current).toBe('offline');
  });

  it('checks again periodically only while offline and watched', async () => {
    jest.useFakeTimers();
    const fetchImpl = jest.fn(async () => ({status: 200}) as Response);
    const monitor = new ConnectivityMonitor({fetchImpl, intervalMs: 1000});

    // Offline but nobody watching: no checks.
    monitor.reportOffline();
    jest.advanceTimersByTime(3000);
    expect(fetchImpl).not.toHaveBeenCalled();

    const stop = monitor.subscribe(() => {});
    jest.advanceTimersByTime(1000);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    await Promise.resolve();
    await Promise.resolve();
    expect(monitor.current).toBe('online');

    // Back online: the checks stop.
    jest.advanceTimersByTime(3000);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    stop();
  });
});

describe('TrelloClient connectivity reports', () => {
  it('reports offline without an answer and online with any answer', async () => {
    const connectivity = {reportOnline: jest.fn(), reportOffline: jest.fn()};
    const fetchImpl = jest
      .fn()
      .mockRejectedValueOnce(new TypeError('Network request failed'))
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: async () => 'invalid token',
      } as Response);
    const client = new TrelloClient({
      apiKey: 'key',
      token: 'token',
      fetchImpl,
      connectivity,
    });

    await expect(client.getMe()).rejects.toMatchObject({kind: 'network'});
    expect(connectivity.reportOffline).toHaveBeenCalledTimes(1);
    expect(connectivity.reportOnline).not.toHaveBeenCalled();

    await expect(client.getMe()).rejects.toMatchObject({kind: 'unauthorized'});
    expect(connectivity.reportOnline).toHaveBeenCalledTimes(1);
  });
});
