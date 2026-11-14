import {CRYPTO_JS, PAGE_JS} from './pageScript';

export interface PageConfig {
  apiKey: string;
  appName: string;
  scope: string;
  expiration: string;
}

/** Texts of the page, picked from the browser language. */
export const PAGE_MESSAGES: Record<string, Record<string, string>> = {
  en: {
    title: 'Connect sINK to Trello',
    redirecting: 'Opening Trello…',
    sending: 'Sending the authorization to your tablet…',
    done: 'Done! Go back to your tablet: sINK connects by itself. You can close this page.',
    denied:
      'Trello did not give access. Scan the code on the tablet again to retry.',
    badLink:
      'This link is incomplete. Scan the code shown by sINK on the tablet again.',
    noStorage:
      'This browser blocks the storage the page needs. Open the link in another browser.',
    expired: 'This page lost its link with the tablet.',
    alreadyUsed: 'This code was already used.',
    failed: 'The authorization could not be sent to the tablet.',
    manual: 'Type this token on the tablet instead:',
    copy: 'Copy the token',
    copied: 'Copied',
  },
  fr: {
    title: 'Connecter sINK à Trello',
    redirecting: 'Ouverture de Trello…',
    sending: 'Envoi de l’autorisation à votre tablette…',
    done: 'C’est fait ! Revenez sur votre tablette : sINK se connecte tout seul. Vous pouvez fermer cette page.',
    denied:
      'Trello n’a pas donné l’accès. Scannez à nouveau le code sur la tablette pour réessayer.',
    badLink:
      'Ce lien est incomplet. Scannez à nouveau le code affiché par sINK sur la tablette.',
    noStorage:
      'Ce navigateur bloque le stockage dont la page a besoin. Ouvrez le lien dans un autre navigateur.',
    expired: 'Cette page a perdu son lien avec la tablette.',
    alreadyUsed: 'Ce code a déjà été utilisé.',
    failed: 'L’autorisation n’a pas pu être envoyée à la tablette.',
    manual: 'Saisissez plutôt ce jeton sur la tablette :',
    copy: 'Copier le jeton',
    copied: 'Copié',
  },
  ja: {
    title: 'sINK を Trello に接続',
    redirecting: 'Trello を開いています…',
    sending: 'タブレットに認証を送信しています…',
    done: '完了しました。タブレットに戻ってください。sINK が自動的に接続します。このページは閉じてかまいません。',
    denied:
      'Trello がアクセスを許可しませんでした。タブレットのコードをもう一度スキャンしてください。',
    badLink:
      'このリンクは不完全です。タブレットの sINK に表示されたコードをもう一度スキャンしてください。',
    noStorage:
      'このブラウザはページに必要なストレージをブロックしています。別のブラウザでリンクを開いてください。',
    expired: 'このページはタブレットとの接続を失いました。',
    alreadyUsed: 'このコードはすでに使用されています。',
    failed: '認証をタブレットに送信できませんでした。',
    manual: '代わりにこのトークンをタブレットに入力してください：',
    copy: 'トークンをコピー',
    copied: 'コピーしました',
  },
  'zh-CN': {
    title: '将 sINK 连接到 Trello',
    redirecting: '正在打开 Trello…',
    sending: '正在将授权发送到您的平板…',
    done: '完成！请回到平板：sINK 会自动连接。您可以关闭此页面。',
    denied: 'Trello 未授予访问权限。请再次扫描平板上的二维码重试。',
    badLink: '此链接不完整。请再次扫描平板上 sINK 显示的二维码。',
    noStorage: '此浏览器阻止了页面所需的存储。请在其他浏览器中打开链接。',
    expired: '此页面已与平板失去关联。',
    alreadyUsed: '此二维码已被使用。',
    failed: '无法将授权发送到平板。',
    manual: '请改为在平板上输入此令牌：',
    copy: '复制令牌',
    copied: '已复制',
  },
  'zh-TW': {
    title: '將 sINK 連接到 Trello',
    redirecting: '正在開啟 Trello…',
    sending: '正在將授權傳送到您的平板…',
    done: '完成！請回到平板：sINK 會自動連接。您可以關閉此頁面。',
    denied: 'Trello 未授予存取權限。請再次掃描平板上的 QR 碼重試。',
    badLink: '此連結不完整。請再次掃描平板上 sINK 顯示的 QR 碼。',
    noStorage: '此瀏覽器封鎖了頁面所需的儲存空間。請在其他瀏覽器中開啟連結。',
    expired: '此頁面已與平板失去關聯。',
    alreadyUsed: '此 QR 碼已被使用。',
    failed: '無法將授權傳送到平板。',
    manual: '請改為在平板上輸入此權杖：',
    copy: '複製權杖',
    copied: '已複製',
  },
};

/**
 * JSON that is safe inside a <script> element: escaping "<" rules out a
 * premature "</script>". (U+2028 and U+2029 are valid in scripts since
 * ES2019, so they need no escaping.)
 */
function scriptJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

/**
 * The connection page. Everything is inline and allowed by a per-response
 * nonce; the Content-Security-Policy forbids any other script, style,
 * image, frame or connection than the relay's own API.
 */
export function renderConnectPage(config: PageConfig, nonce: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer">
<title>sINK for Trello</title>
<style nonce="${nonce}">
  body { margin: 0; padding: 24px 16px; font: 18px/1.5 system-ui, sans-serif;
    background: #fff; color: #000; }
  main { max-width: 32rem; margin: 0 auto; }
  h1 { font-size: 1.5rem; }
  #status { font-weight: 600; }
  code { display: block; word-break: break-all; padding: 12px;
    border: 2px solid #000; border-radius: 6px; font-size: 1rem; }
  button { margin-top: 12px; padding: 10px 20px; font: inherit;
    background: #000; color: #fff; border: 0; border-radius: 6px; }
</style>
</head>
<body>
<main>
  <h1 id="title">sINK for Trello</h1>
  <p id="status" role="status">…</p>
  <section id="manual" hidden>
    <p id="manualHint"></p>
    <code id="token"></code>
    <button id="copy" type="button"></button>
  </section>
  <noscript>JavaScript is required.</noscript>
</main>
<script nonce="${nonce}">
var CONFIG = ${scriptJson(config)};
var MESSAGES = ${scriptJson(PAGE_MESSAGES)};
${CRYPTO_JS}
${PAGE_JS}
</script>
</body>
</html>
`;
}

/** Security headers of the page, for the given nonce. */
export function pageHeaders(nonce: string): Record<string, string> {
  return {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': [
      "default-src 'none'",
      `script-src 'nonce-${nonce}'`,
      `style-src 'nonce-${nonce}'`,
      "connect-src 'self'",
      "base-uri 'none'",
      "form-action 'none'",
      "frame-ancestors 'none'",
    ].join('; '),
  };
}
