/**
 * sINK relay: hands a Trello token from the browser where the user signed
 * in (a phone, or the tablet's own browser) to the sINK plugin, without
 * ever seeing it in clear. See README.md.
 */
import {pageHeaders, renderConnectPage} from './page';
import {ID_PATTERN, MAX_MESSAGE_BYTES, parseRelayMessage} from './protocol';

export {SessionBox} from './sessionBox';

/** The part of the Durable Object namespace API used here. */
export interface SessionNamespace {
  idFromName(name: string): unknown;
  get(id: unknown): {fetch(request: Request): Promise<Response>};
}

export interface Env {
  SESSIONS: SessionNamespace;
  /** Public API key of the Trello Power-Up (same as the plugin's). */
  TRELLO_API_KEY: string;
  /** Application name shown by Trello on its authorization page. */
  TRELLO_APP_NAME?: string;
}

const SESSION_PATH = /^\/api\/v1\/sessions\/([^/]+)$/;

const API_HEADERS = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
};

function respond(status: number, body: string | null = null): Response {
  return new Response(body, {status, headers: API_HEADERS});
}

/** Copies a response from the session object, adding the API headers. */
function relayResponse(response: Response): Response {
  const headers = new Headers(response.headers);
  Object.entries(API_HEADERS).forEach(([name, value]) =>
    headers.set(name, value),
  );
  return new Response(response.body, {status: response.status, headers});
}

function randomNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes));
}

async function handleSession(
  request: Request,
  env: Env,
  id: string,
): Promise<Response> {
  if (!ID_PATTERN.test(id)) {
    return respond(404);
  }
  const box = env.SESSIONS.get(env.SESSIONS.idFromName(id));

  if (request.method === 'GET') {
    return relayResponse(await box.fetch(new Request(request.url)));
  }
  if (request.method !== 'PUT') {
    return new Response(null, {
      status: 405,
      headers: {...API_HEADERS, Allow: 'GET, PUT'},
    });
  }

  const declared = Number(request.headers.get('Content-Length') ?? 0);
  if (declared > MAX_MESSAGE_BYTES) {
    return respond(413);
  }
  const body = await request.text();
  if (new TextEncoder().encode(body).length > MAX_MESSAGE_BYTES) {
    return respond(413);
  }
  const message = parseRelayMessage(body);
  if (!message) {
    return respond(400);
  }
  return relayResponse(
    await box.fetch(new Request(request.url, {method: 'PUT', body: message})),
  );
}

export async function handleRequest(
  request: Request,
  env: Env,
): Promise<Response> {
  const url = new URL(request.url);

  if (url.pathname === '/connect' || url.pathname === '/connect/done') {
    if (request.method !== 'GET') {
      return respond(405);
    }
    const nonce = randomNonce();
    const page = renderConnectPage(
      {
        apiKey: env.TRELLO_API_KEY,
        appName: env.TRELLO_APP_NAME || 'sINK for Trello',
        scope: 'read,write',
        expiration: 'never',
      },
      nonce,
    );
    return new Response(page, {status: 200, headers: pageHeaders(nonce)});
  }

  const session = SESSION_PATH.exec(url.pathname);
  if (session) {
    return handleSession(request, env, session[1]);
  }

  if (url.pathname === '/') {
    return new Response(
      'sINK relay: hands a Trello token to the sINK for Trello plugin, end-to-end encrypted.\n',
      {headers: {'Content-Type': 'text/plain; charset=utf-8', ...API_HEADERS}},
    );
  }
  return respond(404);
}

export default {
  fetch: handleRequest,
};
