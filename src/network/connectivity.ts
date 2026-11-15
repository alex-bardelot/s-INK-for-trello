import {useSyncExternalStore} from 'react';

/**
 * Whether the tablet can reach the internet, as seen by s-INK.
 *
 * There is no network-state API in a plugin: every Trello request reports
 * its outcome here (no answer at all = offline, any HTTP answer = online).
 * While offline and shown on screen, a light request is sent every few
 * seconds, so the plugin notices by itself when the Wi-Fi is back.
 */
export type Connectivity = 'online' | 'offline';

/** Delay between two checks while offline, in milliseconds. */
export const OFFLINE_PROBE_INTERVAL_MS = 5000;

/** Address checked while offline: any answer, even an error, will do. */
export const PROBE_URL = 'https://api.trello.com/1/';

/** Gives up on a check after this long, like a Trello request. */
const PROBE_TIMEOUT_MS = 10000;

export interface ConnectivityOptions {
  fetchImpl?: typeof fetch;
  intervalMs?: number;
}

export class ConnectivityMonitor {
  private status: Connectivity = 'online';
  private readonly listeners = new Set<() => void>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private probing = false;
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

  /** A request got no answer at all (no Wi-Fi, DNS, timeout). */
  reportOffline = (): void => this.set('offline');

  /**
   * Checks the internet now.
   * @returns Whether it is reachable.
   */
  probe = async (): Promise<boolean> => {
    if (this.probing) {
      return this.status === 'online';
    }
    this.probing = true;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
    try {
      await this.fetchImpl(PROBE_URL, {
        method: 'HEAD',
        signal: controller.signal,
      });
      this.reportOnline();
      return true;
    } catch {
      this.reportOffline();
      return false;
    } finally {
      clearTimeout(timeout);
      this.probing = false;
    }
  };

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    this.updateTimer();
    return () => {
      this.listeners.delete(listener);
      this.updateTimer();
    };
  };

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
