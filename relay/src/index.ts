/**
 * s-INK relay: hands a Trello token from the browser where the user signed
 * in (a phone, or the tablet's own browser) to the s-INK plugin, without
 * ever seeing it in clear. See README.md.
 */
import {
  countsTowardGoal,
  parseCents,
  parseKofiWebhook,
  sameSecret,
  toFundingTotal,
} from './funding';
import {pageHeaders, renderConnectPage} from './page';
import {ID_PATTERN, MAX_MESSAGE_BYTES, parseRelayMessage} from './protocol';

export {FundingBox} from './funding';
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
  /** The single Durable Object holding the donation total. */
  FUNDING?: SessionNamespace;
  /** Currency of the funding goal; payments in another one are ignored. */
  FUNDING_CURRENCY?: string;
  /** Secret: the verification token shown on Ko-fi's webhook settings. */
  KOFI_VERIFICATION_TOKEN?: string;
  /** Secret: bearer token allowing to set the total by hand. */
  FUNDING_ADMIN_TOKEN?: string;
}

const SESSION_PATH = /^\/api\/v1\/sessions\/([^/]+)$/;
const FUNDING_PATH = '/api/v1/funding';
const KOFI_PATH = '/api/v1/kofi';
/** The total may lag this long behind a donation, in seconds. */
const FUNDING_MAX_AGE = 300;
/** A Ko-fi webhook body is a few hundred bytes. */
const MAX_WEBHOOK_BYTES = 16 * 1024;

function fundingBox(env: Env) {
  const namespace = env.FUNDING!;
  return namespace.get(namespace.idFromName('funding'));
}

/**
 * `GET` answers the total raised; `PUT {"raised": 182.5}` with the admin
 * token sets it, to count a donation received elsewhere or a refund.
 */
async function handleFunding(request: Request, env: Env): Promise<Response> {
  if (!env.FUNDING) {
    return respond(404);
  }
  const currency = (env.FUNDING_CURRENCY || 'EUR').toUpperCase();

  if (request.method === 'GET') {
    const stored = (await (
      await fundingBox(env).fetch(new Request(request.url))
    ).json()) as {cents: number; updatedAt: number};
    return new Response(JSON.stringify(toFundingTotal(stored, currency)), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': `public, max-age=${FUNDING_MAX_AGE}`,
        'X-Content-Type-Options': 'nosniff',
      },
    });
  }
  if (request.method !== 'PUT') {
    return new Response(null, {
      status: 405,
      headers: {...API_HEADERS, Allow: 'GET, PUT'},
    });
  }

  const auth = request.headers.get('Authorization') ?? '';
  const admin = env.FUNDING_ADMIN_TOKEN ?? '';
  if (!admin || !sameSecret(auth, `Bearer ${admin}`)) {
    return respond(401);
  }
  let raised: unknown;
  try {
    raised = ((await request.json()) as {raised?: unknown}).raised;
  } catch {
    return respond(400);
  }
  const cents =
    raised === 0
      ? 0
      : typeof raised === 'number'
      ? parseCents(String(raised))
      : null;
  if (cents === null) {
    return respond(400);
  }
  await fundingBox(env).fetch(
    new Request(request.url, {method: 'PUT', body: JSON.stringify({cents})}),
  );
  return respond(204);
}

/**
 * Ko-fi webhook: adds a donation to the total. Answers 200 to anything
 * that carries the right verification token, counted or not, so that
 * Ko-fi does not resend it.
 */
async function handleKofi(request: Request, env: Env): Promise<Response> {
  if (!env.FUNDING || !env.KOFI_VERIFICATION_TOKEN) {
    return respond(404);
  }
  if (request.method !== 'POST') {
    return new Response(null, {
      status: 405,
      headers: {...API_HEADERS, Allow: 'POST'},
    });
  }
  const body = await request.text();
  if (new TextEncoder().encode(body).length > MAX_WEBHOOK_BYTES) {
    return respond(413);
  }
  const payment = parseKofiWebhook(body);
  if (!payment) {
    return respond(400);
  }
  if (!sameSecret(payment.verificationToken, env.KOFI_VERIFICATION_TOKEN)) {
    return respond(401);
  }
  const currency = (env.FUNDING_CURRENCY || 'EUR').toUpperCase();
  if (!countsTowardGoal(payment, currency)) {
    console.log(
      `Ko-fi ${payment.type} in ${payment.currency} not counted (goal in ${currency})`,
    );
    return respond(200);
  }
  await fundingBox(env).fetch(
    new Request(request.url, {
      method: 'POST',
      body: JSON.stringify({
        transactionId: payment.transactionId,
        cents: payment.cents,
      }),
    }),
  );
  return respond(200);
}

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

/** Token lifetimes the plugin may ask for (`e=` of the page address). */
const TOKEN_EXPIRATIONS = ['1day', '30days', 'never'] as const;

/**
 * The lifetime the plugin asked for, or 30 days: a plugin too old to ask,
 * or an address typed by hand, gets a token that does not last forever.
 */
export function tokenExpiration(asked: string | null): string {
  return TOKEN_EXPIRATIONS.find(value => value === asked) ?? '30days';
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
        appName: env.TRELLO_APP_NAME || 's-INK for Trello',
        scope: 'read,write',
        expiration: tokenExpiration(url.searchParams.get('e')),
      },
      nonce,
    );
    return new Response(page, {status: 200, headers: pageHeaders(nonce)});
  }

  if (url.pathname === FUNDING_PATH) {
    return handleFunding(request, env);
  }
  if (url.pathname === KOFI_PATH) {
    return handleKofi(request, env);
  }

  const session = SESSION_PATH.exec(url.pathname);
  if (session) {
    return handleSession(request, env, session[1]);
  }

  if (url.pathname === '/') {
    return new Response(
      's-INK relay: hands a Trello token to the s-INK for Trello plugin, end-to-end encrypted.\n',
      {headers: {'Content-Type': 'text/plain; charset=utf-8', ...API_HEADERS}},
    );
  }
  return respond(404);
}

export default {
  fetch: handleRequest,
};
