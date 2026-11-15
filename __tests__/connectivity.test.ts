import {
  ConnectivityMonitor,
  PROBE_URL,
} from '../src/network/connectivity';
import {TrelloClient} from '../src/trello';

const answered = async () => ({status: 404}) as Response;
const noAnswer = async (): Promise<Response> => {
  throw new TypeError('Network request failed');
};

/** Lets the pending promise callbacks run. */
async function flush(): Promise<void> {
  for (let i = 0; i < 5; i++) {
    await Promise.resolve();
  }
}

describe('ConnectivityMonitor', () => {
  afterEach(() => jest.useRealTimers());

  it('starts online', () => {
    expect(new ConnectivityMonitor({fetchImpl: jest.fn()}).current).toBe(
      'online',
    );
  });

  it('checks a neutral address, any answer meaning online', async () => {
    const fetchImpl = jest.fn(answered);
    const monitor = new ConnectivityMonitor({fetchImpl});

    expect(await monitor.probe()).toBe(true);
    expect(monitor.current).toBe('online');
    expect(PROBE_URL).not.toContain('trello');
    expect(fetchImpl).toHaveBeenCalledWith(
      PROBE_URL,
      expect.objectContaining({method: 'HEAD'}),
    );
  });

  it('is offline when the check gets no answer, and says it once', async () => {
    const monitor = new ConnectivityMonitor({fetchImpl: jest.fn(noAnswer)});
    const listener = jest.fn();
    const stop = monitor.subscribe(listener);

    expect(await monitor.probe()).toBe(false);
    expect(await monitor.probe()).toBe(false);
    expect(monitor.current).toBe('offline');
    expect(listener).toHaveBeenCalledTimes(1);
    stop();
  });

  it('shares one check between concurrent calls', async () => {
    const fetchImpl = jest.fn(answered);
    const monitor = new ConnectivityMonitor({fetchImpl});

    await Promise.all([monitor.probe(), monitor.probe(), monitor.probe()]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('stays online when only Trello does not answer', async () => {
    const monitor = new ConnectivityMonitor({fetchImpl: jest.fn(answered)});

    monitor.reportNoAnswer();
    await flush();
    expect(monitor.current).toBe('online');
  });

  it('goes offline when Trello and the check both get no answer', async () => {
    const monitor = new ConnectivityMonitor({fetchImpl: jest.fn(noAnswer)});

    monitor.reportNoAnswer();
    await flush();
    expect(monitor.current).toBe('offline');
    monitor.reportOnline();
    expect(monitor.current).toBe('online');
  });

  it('checks again periodically only while offline and watched', async () => {
    jest.useFakeTimers();
    const fetchImpl = jest
      .fn()
      .mockImplementationOnce(noAnswer)
      .mockImplementation(answered);
    const monitor = new ConnectivityMonitor({fetchImpl, intervalMs: 1000});

    // Offline but nobody watching: no checks.
    await monitor.probe();
    expect(monitor.current).toBe('offline');
    jest.advanceTimersByTime(3000);
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    const stop = monitor.subscribe(() => {});
    jest.advanceTimersByTime(1000);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    await flush();
    expect(monitor.current).toBe('online');

    // Back online: the checks stop.
    jest.advanceTimersByTime(3000);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    stop();
  });
});

describe('TrelloClient connectivity reports', () => {
  it('reports a missing answer, and online with any answer', async () => {
    const connectivity = {reportOnline: jest.fn(), reportNoAnswer: jest.fn()};
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
    expect(connectivity.reportNoAnswer).toHaveBeenCalledTimes(1);
    expect(connectivity.reportOnline).not.toHaveBeenCalled();

    await expect(client.getMe()).rejects.toMatchObject({kind: 'unauthorized'});
    expect(connectivity.reportOnline).toHaveBeenCalledTimes(1);
  });
});
