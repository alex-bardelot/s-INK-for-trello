import {SESSION_TTL_MS} from './protocol';

/** The part of the Durable Object storage API used here. */
export interface SessionStorage {
  get<T>(key: string): Promise<T | undefined>;
  put<T>(key: string, value: T): Promise<void>;
  deleteAll(): Promise<void>;
  setAlarm(scheduledTime: number): Promise<void>;
  deleteAlarm(): Promise<void>;
}

export interface SessionState {
  storage: SessionStorage;
}

interface StoredMessage {
  body: string;
  expiresAt: number;
}

const MESSAGE_KEY = 'message';

/**
 * One Durable Object per connection session: a mailbox that holds a single
 * encrypted message.
 *
 * - `PUT` deposits the message, once. A second deposit is refused, so
 *   nobody can replace the phone's message.
 * - `GET` hands the message over and erases it at once: it can be
 *   collected a single time. While nothing was deposited it answers 204.
 * - An alarm erases a message nobody collected, {@link SESSION_TTL_MS}
 *   after its deposit.
 *
 * A Durable Object is used rather than Workers KV because it is strongly
 * consistent: the tablet sees the message as soon as it is written, while
 * KV can serve a stale "not found" for up to a minute.
 */
export class SessionBox {
  constructor(private readonly state: SessionState, _env?: unknown) {}

  async fetch(request: Request): Promise<Response> {
    switch (request.method) {
      case 'PUT':
        return this.deposit(await request.text());
      case 'GET':
        return this.collect();
      default:
        return new Response(null, {status: 405, headers: {Allow: 'GET, PUT'}});
    }
  }

  /** Erases a message that was never collected. */
  async alarm(): Promise<void> {
    await this.state.storage.deleteAll();
  }

  private async deposit(body: string): Promise<Response> {
    const {storage} = this.state;
    if (await this.current()) {
      return new Response(null, {status: 409});
    }
    const expiresAt = Date.now() + SESSION_TTL_MS;
    await storage.put<StoredMessage>(MESSAGE_KEY, {body, expiresAt});
    await storage.setAlarm(expiresAt);
    return new Response(null, {status: 201});
  }

  private async collect(): Promise<Response> {
    const message = await this.current();
    if (!message) {
      return new Response(null, {status: 204});
    }
    await this.erase();
    return new Response(message.body, {
      status: 200,
      headers: {'Content-Type': 'application/json'},
    });
  }

  /** The stored message, unless it has expired (alarms may run late). */
  private async current(): Promise<StoredMessage | null> {
    const message = await this.state.storage.get<StoredMessage>(MESSAGE_KEY);
    if (!message) {
      return null;
    }
    if (message.expiresAt <= Date.now()) {
      await this.erase();
      return null;
    }
    return message;
  }

  private async erase(): Promise<void> {
    await this.state.storage.deleteAlarm();
    await this.state.storage.deleteAll();
  }
}
