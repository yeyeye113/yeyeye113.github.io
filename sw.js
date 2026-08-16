// sw.js — 过面 PWA Service Worker（放仓根以获得 / 作用域）
// 缓存策略（V1.2 P2-4 收口，防新旧版本混搭）：
// - 预缓存清单内的壳资产：cache-first 且不回写——版本切换只靠新 SW install 时
//   预缓存整体换新，绝不把新部署的模块写进旧版本缓存造成旧壳+新模块混跑；
// - 清单外的同源 GET：stale-while-revalidate（先回缓存、后台刷新）。
// activate 清掉本产品旧版本缓存。
// VERSION 与 package.json 的 version 联动机检：test/server.test.mjs 读两个文件断言一致，
// 发版只改 package.json 不改这里会直接红（命理仓 V1.3 同款教训）。

const VERSION = '0.9.3';
const CACHE_NAME = `guomian-v${VERSION}`;

// 核心壳：应用外壳三件＋PWA 资产＋全部 /src 引擎模块（清单与盘上 17 个 .mjs 对齐）
const CORE_ASSETS = [
  '/',
  '/app/app.js',
  '/app/style.css',
  '/app/manifest.webmanifest',
  '/app/icons/icon-192.svg',
  '/app/icons/icon-512.svg',
  '/src/config/index.mjs',
  '/src/coach/index.mjs',
  '/src/drill/index.mjs',
  '/src/custom/index.mjs',
  '/docs/隐私政策.md',
  '/src/ui-core/index.mjs',
  '/src/samples/index.mjs',
  '/src/engine/jd/dict.mjs',
  '/src/engine/jd/index.mjs',
  '/src/engine/question/bank.mjs',
  '/src/engine/question/index.mjs',
  '/src/engine/resume/index.mjs',
  '/src/engine/scoring/index.mjs',
  '/src/export/index.mjs',
  '/src/gongkao/bank.mjs',
  '/src/gongkao/index.mjs',
  '/src/llm/index.mjs',
  '/src/monetize/index.mjs',
  '/src/prompts/index.mjs',
  '/src/report/index.mjs',
  '/src/session/index.mjs',
  '/src/storage/index.mjs',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(CORE_ASSETS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key.startsWith('guomian-') && key !== CACHE_NAME)
          .map((key) => caches.delete(key)),
      ))
      .then(() => self.clients.claim()),
  );
});

const CORE_SET = new Set(CORE_ASSETS);

// 只接管同源 GET；/health 不缓存（健康检查必须反映真实服务端状态）。
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname === '/health') return;

  if (CORE_SET.has(url.pathname)) {
    // 壳资产 cache-first 不回写：miss（如缓存被驱逐）时直接走网络但不写缓存，
    // 本版本缓存的内容永远只来自 install 预缓存那一刻
    event.respondWith(
      caches.open(CACHE_NAME)
        .then((cache) => cache.match(req))
        .then((cached) => cached ?? fetch(req)),
    );
    return;
  }

  // 清单外资产 stale-while-revalidate：先回缓存，同时后台刷新；未缓存走网络并入缓存
  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(req);
      const refresh = fetch(req)
        .then((res) => {
          if (res && res.ok) cache.put(req, res.clone());
          return res;
        })
        .catch(() => undefined);
      return cached ?? refresh.then((res) => res ?? Response.error());
    }),
  );
});
