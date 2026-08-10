/* Mecha Gauge — オフライン用 Service Worker
 *
 * ねらいは2つだけ。
 *   1. 圏外の工場でも計算機が開くこと
 *   2. 更新を出したら次に開いたときには新しくなっていること
 *
 * 「みんなの声」の通信（script.google.com）は絶対に触らない。
 * キャッシュすると古い投稿が出続けるし、書き込みが握り潰される。
 *
 * ★ ファイルを足したり中身を変えたら VERSION を上げること。
 *   上げ忘れると、利用者の端末に古い版が残り続ける。
 */
const VERSION = "v2";   // v2: アイコンを iconv6（明るい背景＋鋼色の機械）に差し替え
const CACHE = "mecha-gauge-" + VERSION;

/* 端末に持たせておくもの。これだけで全機能がオフラインで動く */
const SHELL = [
  "./",
  "./index.html",
  "./app_noads.html",
  "./privacy_policy.html",
  "./manifest.webmanifest",
  "./icons/icon-180.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-1024.png"
];

self.addEventListener("install", (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    // 1つ失敗しても残りは入れる（スクショ等が欠けても計算機は動かしたい）
    await Promise.all(SHELL.map((u) =>
      c.add(new Request(u, { cache: "reload" })).catch(() => {})
    ));
    self.skipWaiting();
  })());
});

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // 自分のオリジン以外（掲示板のApps Script・外部画像）は素通し
  if (url.origin !== self.location.origin) return;

  // ページ本体はネット優先。更新をすぐ届けたいので。
  // 通信できないときだけキャッシュを返す（圏外でも開く）。
  if (req.mode === "navigate") {
    e.respondWith((async () => {
      try {
        const res = await fetch(req);
        const c = await caches.open(CACHE);
        c.put(req, res.clone());
        return res;
      } catch {
        return (await caches.match(req)) ||
               (await caches.match("./app_noads.html")) ||
               (await caches.match("./index.html")) ||
               Response.error();
      }
    })());
    return;
  }

  // それ以外（アイコン等）はキャッシュ優先。裏で静かに更新しておく。
  e.respondWith((async () => {
    const hit = await caches.match(req);
    const net = fetch(req).then((res) => {
      if (res && res.ok) caches.open(CACHE).then((c) => c.put(req, res.clone()));
      return res;
    }).catch(() => null);
    return hit || (await net) || Response.error();
  })());
});
