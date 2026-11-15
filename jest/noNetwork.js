// Tests never reach the internet: code that uses the global `fetch` without
// an injected one (the connectivity check, say) gets no answer instead.
global.fetch = () =>
  Promise.reject(new TypeError('Network disabled in tests'));
