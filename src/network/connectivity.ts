import {useSyncExternalStore} from 'react';

/**
 * Whether the tablet itself has internet access, whatever Trello does.
 *
 * There is no network-state API in a plugin, so the tablet's access is
 * checked with a light request to a neutral address (not Trello): when the
 * view opens, and whenever a Trello request gets no answer at all. Trello
 * being down while the internet works is not "offline": its own errors say
 * so. While offline and shown on screen, the check runs every few seconds,
 * so the plugin notices by itself when the Wi-Fi is back.
 */
export type Connectivity = 'online' | 'offline';

/** Delay between two checks while offline, in milliseconds. */
export const OFFLINE_PROBE_INTERVAL_MS = 5000;

/**
 * Neutral address checked: Cloudflare's tiny trace page, which carries no
 * data about the user. Any answer, even an error, proves the access.
 */
export const PROBE_URL = 'https://cloudflare.com/cdn-cgi/trace';

/** Gives up on a check after this long. */
const PROBE_TIMEOUT_MS = 10000;

export interface ConnectivityOptions {
  fetchImpl?: typeof fetch;
  intervalMs?: number;
}

export class ConnectivityMonitor {
  private status: Connectivity = 'online';
  private readonly listeners = new Set<() => void>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private pendingProbe: Promise<boolean> | null = null;
  private readonly fetchImpl: typeof fetch;
  private readonly intervalMs: number;

  constructor({fetchImpl, intervalMs}: ConnectivityOptions = {}) {
    // Read when probing, so tests and polyfills replacing `fetch` apply.
    this.fetchImpl = fetchImpl ?? ((...args) => fetch(...args));
    this.intervalMs = intervalMs ?? OFFLINE_PROBE_INTERVAL_MS;
  }

  get current(): Connectivity {
    return this.status;
  }

  /** A request got an answer: the internet is reachable. */
  reportOnline = (): void => this.set('online');

  /**
   * A request got no answer at all: checks whether the tablet still has
   * internet, or only that server failed.
   */
  reportNoAnswer = (): void => {
    this.probe();
  };

  /**
   * Checks the tablet's internet access now. Concurrent calls share one
   * request.
   * @returns Whether it is reachable.
   */
  probe = (): Promise<boolean> => {
    if (!this.pendingProbe) {
      this.pendingProbe = this.runProbe().finally(() => {
        this.pendingProbe = null;
      });
    }
    return this.pendingProbe;
  };

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    this.updateTimer();
    return () => {
      this.listeners.delete(listener);
      this.updateTimer();
    };
  };

  private async runProbe(): Promise<boolean> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
    try {
      await this.fetchImpl(PROBE_URL, {
        method: 'HEAD',
        signal: controller.signal,
      });
      this.set('online');
      return true;
    } catch {
      this.set('offline');
      return false;
    } finally {
      clearTimeout(timeout);
    }
  }

  private set(next: Connectivity): void {
    if (next === this.status) {
      return;
    }
    this.status = next;
    this.updateTimer();
    this.listeners.forEach(listener => listener());
  }

  /** Checks again periodically only while offline and watched. */
  private updateTimer(): void {
    const wanted = this.status === 'offline' && this.listeners.size > 0;
    if (wanted && !this.timer) {
      this.timer = setInterval(() => {
        this.probe();
      }, this.intervalMs);
    } else if (!wanted && this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}

/** The plugin's monitor, fed by every Trello request. */
export const connectivity = new ConnectivityMonitor();

/** React hook returning the current connectivity. */
export function useConnectivity(): Connectivity {
  return useSyncExternalStore(connectivity.subscribe, () => connectivity.current);
}
