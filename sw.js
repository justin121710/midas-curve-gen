/* 線形建模器＋吊橋助手的離線快取（PWA）。
   連得上網路時一律取最新版（推到 GitHub 就生效），斷線時用快取。每次更新快取檔案時調整 VER。 */
const VER = "cg-suspension-project-1";
const CORE = ["./", "index.html", "flow.html", "flow/engine.js", "flow/app.js",
  "flow/fonts/ZevHeiTC-F-400.woff2", "flow/fonts/ZevHeiTC-F-700.woff2", "flow/fonts/ZevHeiTC-N-800.woff2",
  "manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png", "icons/icon-maskable-512.png",
  "tools/examples/suspension_demo.mct"];
self.addEventListener("install", e => {
  e.waitUntil(caches.open(VER).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VER).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const same = new URL(req.url).origin === self.location.origin;
  e.respondWith(
    fetch(req).then(res => {
      if (res && res.ok && (same || res.type === "cors" || res.type === "opaque")) {
        const copy = res.clone(); caches.open(VER).then(c => c.put(req, copy));
      }
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || (req.mode === "navigate" ? caches.match("index.html") : undefined)))
  );
});
