# s-INK relay

A tiny [Cloudflare Worker](https://developers.cloudflare.com/workers/) that
lets the s-INK for Trello plugin get a Trello token **without copying and
pasting it**: the user signs in to Trello on a phone (by scanning the QR code
shown by the plugin) or in the tablet's browser, and the token travels back
to the plugin by itself.

The relay never sees the token in clear: it is encrypted in the browser with
a key that only the tablet knows, and the relay only stores that ciphertext,
once, for at most ten minutes.

The plugin side lives in `src/relay/` (session, polling, decryption) and
`src/screens/ConnectScreen.tsx`; the relay address is `TRELLO_RELAY_URL` in
`src/trello/config.ts` (leave it empty to use the manual flow only).

## Why a relay is needed

The plugin runs inside the Supernote app, which offers no WebView, no way to
receive a redirect and no local server. Trello, for its part, can only hand a
token to a web page (`return_url`). So something reachable on the Internet
has to receive the token from that web page and keep it until the plugin
comes to fetch it. Trello does not offer the OAuth "device flow" (where the
provider runs this mailbox itself, as Google or GitHub do), so s-INK brings
its own.

## How it works

```
 Tablet (plugin)                Phone / browser                 Relay            Trello
 ───────────────                ───────────────                 ─────            ──────
 1. picks random id + key K
    shows QR code:
    https://relay/connect?s=id#k=K
                         ──scan──▶
                                2. GET /connect?s=id  ───────▶  serves the page
                                   (the part after # stays in the browser)
                                   keeps K in sessionStorage,
                                   removes it from the address bar
                                3. redirect ─────────────────────────────────────▶ sign in,
                                                                                   press Allow
                                4. GET /connect/done?s=id#token=T ◀────────────── redirect
                                   removes T from the address bar
                                   C = encrypt(T, K, id)
                                5. PUT /api/v1/sessions/id {C} ▶ stores C once,
                                                                 for 10 min
 6. GET /api/v1/sessions/id every 2 s ─────────────────────────▶ 204 (nothing yet)
                                                              … 200 {C}, then erases it
 7. T = decrypt(C, K, id) → connected
```

1. **The tablet starts a session.** It draws 16 random bytes for the session
   id and 16 more for the key `K`, and shows the QR code of
   `https://<relay>/connect?s=<id>#k=<K>`. The same address can be opened in
   the tablet's own browser with the "Open in browser" button.
2. **The browser loads the page.** Browsers never send the fragment (the part
   after `#`) to the server, so the relay receives the id but **never the
   key**. The page keeps the key in `sessionStorage` and removes it from the
   address bar and history.
3. **The page sends the browser to Trello's authorization page**, with
   `callback_method=fragment` and `return_url=https://<relay>/connect/done?s=<id>`.
4. **Trello comes back with the token in the fragment**
   (`/connect/done?s=<id>#token=<T>`): again, it never reaches the relay
   in clear. The page removes it from the address bar, then encrypts it.
5. **The page deposits the ciphertext** with `PUT /api/v1/sessions/<id>`.
6. **The tablet polls** `GET /api/v1/sessions/<id>`: `204` while nothing is
   there, then `200` with the ciphertext, which the relay erases at once.
7. **The tablet decrypts** the token with its key and connects as usual.

If anything goes wrong in steps 4–5 (the page lost its key, the relay is
unreachable, the code was already used), the page shows the token with a
"Copy the token" button, so the manual flow (and the plugin's clipboard
watch, when the browser is the tablet's) still works.

## Protocol

All binary values are written in base64url without padding.

| Item | Value |
| --- | --- |
| Session id | 16 random bytes (22 characters) |
| Key `K` | 16 random bytes (22 characters), only in the URL fragment |
| Keystream | `SHA-256(K ‖ "sINK-enc" ‖ u32be(0)) ‖ SHA-256(K ‖ "sINK-enc" ‖ u32be(1)) ‖ …` |
| Ciphertext `ct` | `UTF-8(token) XOR keystream` |
| MAC key | `SHA-256(K ‖ "sINK-mac")` |
| Tag `tag` | `HMAC-SHA256(MAC key, "sINK-v1" ‖ id ‖ ct)` |
| Message | `{"v": 1, "ct": "<ct>", "tag": "<tag>"}` |

- SHA-256 in counter mode is a stream cipher keyed by `K`; since every key is
  used for a single message, the keystream is never reused.
- The tag lets the tablet reject anything it did not encrypt itself: a
  message forged by the relay, or one moved from another session (the id is
  part of the tagged data). The tablet must check it before using the token.
- The page uses WebCrypto (`crypto.subtle`); the plugin uses a small
  SHA-256 and HMAC written in plain JavaScript (`src/relay/sha256.ts`),
  tested against Node's, and its decryption is tested against the page's
  own script (`__tests__/relaySession.test.ts`). `relay/test/relay.test.ts`
  holds a third, independent reference decryption.

## API

| Request | Answer |
| --- | --- |
| `GET /connect?s=<id>` | The connection page (step 2–3). |
| `GET /connect/done?s=<id>` | The same page (step 4–5). |
| `PUT /api/v1/sessions/<id>` | `201` stored · `409` already used · `400` bad message · `413` over 1 KB |
| `GET /api/v1/sessions/<id>` | `200` the message (erased now) · `204` nothing yet |
| `GET /` | A one-line description. |

Every answer carries `Cache-Control: no-store`. There is no CORS header:
other web sites cannot read the API from a browser (the plugin is not a
browser, so it is not concerned).

## Storage

Each session is a [Durable Object](https://developers.cloudflare.com/durable-objects/)
(`SessionBox` in `src/sessionBox.ts`), a mailbox for one message:

- a message can be deposited once and collected once;
- an alarm erases it 10 minutes after its deposit if nobody collected it,
  and expired messages are ignored even if the alarm runs late;
- polling an empty session stores nothing, so abandoned sessions cost
  nothing.

Durable Objects are used rather than Workers KV because they are strongly
consistent: KV may keep answering "not found" for up to a minute after a
write, which would make the tablet wait for nothing.

## Security

What the relay operator (or anyone who breaks into the relay) can see: session
ids, ciphertexts, the time of each request and the IP addresses of the phone
and the tablet. What they cannot see: the key, hence the token.

- **Page hardening.** The page is entirely inline, allowed by a
  per-response nonce in a strict Content-Security-Policy (no other script,
  style, image, frame or connection than the relay's own API),
  `Referrer-Policy: no-referrer`, and it cannot be framed.
- **Session ids** are 128-bit random values: they cannot be guessed. Someone
  who learns one can at most collect the ciphertext (useless without the
  key) or deposit a message first (rejected by the tablet's tag check, and
  the user simply scans a new code).
- **Randomness on the tablet.** The id and key come from
  `crypto.getRandomValues` when the JavaScript engine provides it. Otherwise
  (`src/platform/random.ts`) they are SHA-256 digests of an entropy pool:
  many `Math.random()` outputs, which the engine seeds from the system, plus
  the jitter of the clock over tight loops. Since only digests leave the
  pool, the session id the relay sees reveals nothing about the key or the
  generator's state. This is weaker than a system generator, which is why
  sessions are short-lived and single-use.
- **Limits.** Messages are capped at 1 KB and checked for shape before they
  are stored. For extra protection against floods, a
  [rate limiting rule](https://developers.cloudflare.com/waf/rate-limiting-rules/)
  can be added in the Cloudflare dashboard.

## Cost

Everything fits the Workers Free plan (100,000 requests a day, SQLite-backed
Durable Objects included). One connection takes about a dozen requests; a
session abandoned before the token arrives costs at most one poll every two
seconds until the plugin gives up (10 minutes, so about 300 requests).

## Deploy your own

1. Create a free [Cloudflare account](https://dash.cloudflare.com/sign-up).
2. In this folder:

   ```bash
   npm install
   npx wrangler login
   npm run deploy
   ```

   Wrangler prints the address of the Worker, for example
   `https://sink-relay.<your-subdomain>.workers.dev`.
3. Allow that address on Trello: open your Power-Up at
   <https://trello.com/apps/admin>, then add the Worker's origin to its
   **Allowed origins**. Without it, Trello refuses to redirect to the relay.
4. If you use your own Power-Up, set its API key in `wrangler.toml`
   (`TRELLO_API_KEY`) and in the plugin's `src/trello/config.ts`.

To try it locally, `npm run dev` serves it on `http://localhost:8787`
(Trello will only redirect there if that origin is allowed too).
`npm run logs` streams the live logs of the deployed Worker.

## Tests

The tests run with the plugin's Jest setup, from the repository root:

```bash
npx jest relay
```

They run the real router against real `SessionBox` objects with in-memory
storage, the exact script the page serves (in a fake browser, through the
whole flow), and decrypt its output with an independent implementation of
the protocol above. Type checking: `npx tsc --noEmit -p relay`.
