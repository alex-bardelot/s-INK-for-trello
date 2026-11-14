/**
 * Browser code of the connection page, kept as plain JavaScript strings so
 * that the tests run exactly the code the relay serves.
 */

/**
 * `encryptToken(token, keyText, sessionId)` → `{v, ct, tag}`.
 *
 * Uses WebCrypto only (the page is served over HTTPS, a secure context):
 *
 *   stream = SHA-256(K || "sINK-enc" || u32be(0)) || SHA-256(... u32be(1)) …
 *   ct     = UTF-8(token) XOR stream
 *   macKey = SHA-256(K || "sINK-mac")
 *   tag    = HMAC-SHA256(macKey, "sINK-v1" || sessionId || ct)
 */
export const CRYPTO_JS = String.raw`
function fromBase64Url(text) {
  var padded = text.replace(/-/g, '+').replace(/_/g, '/') +
    '==='.slice((text.length + 3) % 4);
  return Uint8Array.from(atob(padded), function (c) { return c.charCodeAt(0); });
}

function toBase64Url(bytes) {
  var binary = '';
  for (var i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function concatBytes(parts) {
  var length = parts.reduce(function (sum, part) { return sum + part.length; }, 0);
  var result = new Uint8Array(length);
  var offset = 0;
  parts.forEach(function (part) { result.set(part, offset); offset += part.length; });
  return result;
}

async function sha256(bytes) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
}

async function encryptToken(token, keyText, sessionId) {
  var utf8 = new TextEncoder();
  var key = fromBase64Url(keyText);
  var plain = utf8.encode(token);
  var stream = [];
  for (var block = 0; stream.length < plain.length; block++) {
    var counter = new Uint8Array([block >>> 24, (block >>> 16) & 255, (block >>> 8) & 255, block & 255]);
    var bytes = await sha256(concatBytes([key, utf8.encode('sINK-enc'), counter]));
    stream.push.apply(stream, Array.from(bytes));
  }
  var ciphertext = plain.map(function (byte, i) { return byte ^ stream[i]; });
  var macKey = await crypto.subtle.importKey(
    'raw',
    await sha256(concatBytes([key, utf8.encode('sINK-mac')])),
    {name: 'HMAC', hash: 'SHA-256'},
    false,
    ['sign']
  );
  var tag = new Uint8Array(await crypto.subtle.sign(
    'HMAC',
    macKey,
    concatBytes([utf8.encode('sINK-v1'), utf8.encode(sessionId), ciphertext])
  ));
  return {v: 1, ct: toBase64Url(ciphertext), tag: toBase64Url(tag)};
}
`;

/**
 * Page flow. Expects `CONFIG` ({apiKey, appName, scope, expiration}) and
 * `MESSAGES` (per language) to be defined before it.
 *
 * 1. /connect?s=<id>#k=<key>: keeps the key in sessionStorage (it never
 *    reaches a server), removes it from the address bar and sends the
 *    browser to Trello's authorization page.
 * 2. /connect/done?s=<id>#token=<token>: Trello comes back here once the
 *    user pressed Allow. The page removes the token from the address bar,
 *    encrypts it with the key and deposits it on the relay.
 */
export const PAGE_JS = String.raw`
(function () {
  var ID = /^[A-Za-z0-9_-]{22}$/;
  var lang = (navigator.language || 'en').toLowerCase();
  var texts = MESSAGES[lang.indexOf('zh') === 0
    ? (/tw|hk|mo|hant/.test(lang) ? 'zh-TW' : 'zh-CN')
    : lang.slice(0, 2)] || MESSAGES.en;
  document.documentElement.lang = lang;
  document.getElementById('title').textContent = texts.title;

  function show(key, token) {
    document.getElementById('status').textContent = texts[key];
    var manual = document.getElementById('manual');
    if (!token) {
      manual.hidden = true;
      return;
    }
    manual.hidden = false;
    document.getElementById('manualHint').textContent = texts.manual;
    document.getElementById('token').textContent = token;
    var copy = document.getElementById('copy');
    copy.textContent = texts.copy;
    copy.onclick = function () {
      navigator.clipboard.writeText(token).then(function () {
        copy.textContent = texts.copied;
      });
    };
  }

  function storageKey(id) {
    return 'sink-relay:' + id;
  }

  var params = new URLSearchParams(location.search);
  var hash = new URLSearchParams(location.hash.slice(1));
  var id = params.get('s') || '';
  // Drop the fragment (key or token) from the address bar and history.
  history.replaceState(null, '', location.pathname + location.search);

  if (!ID.test(id)) {
    show('badLink');
    return;
  }

  if (location.pathname === '/connect') {
    var key = hash.get('k') || '';
    if (!ID.test(key)) {
      show('badLink');
      return;
    }
    try {
      sessionStorage.setItem(storageKey(id), key);
    } catch (error) {
      show('noStorage');
      return;
    }
    var returnUrl = location.origin + '/connect/done?s=' + id;
    var query = [
      ['key', CONFIG.apiKey],
      ['name', CONFIG.appName],
      ['scope', CONFIG.scope],
      ['expiration', CONFIG.expiration],
      ['response_type', 'token'],
      ['callback_method', 'fragment'],
      ['return_url', returnUrl]
    ].map(function (pair) {
      return pair[0] + '=' + encodeURIComponent(pair[1]);
    }).join('&');
    show('redirecting');
    location.replace('https://trello.com/1/authorize?' + query);
    return;
  }

  var token = hash.get('token') || '';
  var stored = null;
  try {
    stored = sessionStorage.getItem(storageKey(id));
    sessionStorage.removeItem(storageKey(id));
  } catch (error) {
    stored = null;
  }
  if (!token) {
    show('denied');
    return;
  }
  if (!stored) {
    show('expired', token);
    return;
  }
  show('sending');
  encryptToken(token, stored, id)
    .then(function (message) {
      return fetch('/api/v1/sessions/' + id, {
        method: 'PUT',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(message)
      });
    })
    .then(function (response) {
      if (response.status === 201) {
        show('done');
      } else if (response.status === 409) {
        show('alreadyUsed', token);
      } else {
        show('failed', token);
      }
    })
    .catch(function () {
      show('failed', token);
    });
})();
`;
