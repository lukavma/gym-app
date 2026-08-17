import { PAGES_CACHE_NAME } from "@serwist/next/worker";
import {
  CacheFirst,
  ExpirationPlugin,
  NetworkFirst,
  NetworkOnly,
  RangeRequestsPlugin,
  Serwist,
  StaleWhileRevalidate,
} from "serwist";
import type { PrecacheEntry, RuntimeCaching, SerwistGlobalConfig } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

// Next's webpack build statically replaces `process.env.NODE_ENV` at
// bundle time for every entry it compiles, including this worker — it is
// never a real Node global at runtime here. tsconfig.worker.json
// deliberately sets `types: []` to catch accidental Node/DOM API use in
// this worker-only scope, so this narrow ambient declares only the one
// property actually referenced below instead of pulling in all of
// `@types/node` (which would also add `Buffer`, `require`, etc. to the
// worker's global scope).
declare const process: { env: { NODE_ENV: string } };

// Phase 3 (HIGH-5 remediation): `@serwist/next`'s `defaultCache` caches
// *every* same-origin `/api/*` GET with NetworkFirst/10s, which silently
// served `/api/today-bundle` (and worse, `/api/history`) from the SW cache
// — the fetch resolved 200, so TodaySection's offline banner never fired
// and stale post-completion corrections could be served from `/api/history`.
// pwa-offline-strategy.md §8 wants exactly one cached API GET
// (`/api/today-bundle`, NetworkFirst/3s) and "no caching of other API GETs
// in MVP." This list is `defaultCache`'s array with its single "apis" entry
// replaced by the two entries below, in the same position (routing is
// first-match-wins) — every other entry (fonts, images, next-static-js,
// next-image, audio, video, js/css assets, next-data json, generic
// json/xml/csv, `/api/auth/*`, RSC prefetch, RSC, html, same-origin
// catch-all, cross-origin, final GET catch-all) is copied verbatim.
const runtimeCaching: RuntimeCaching[] =
  process.env.NODE_ENV !== "production"
    ? [{ matcher: /.*/i, handler: new NetworkOnly() }]
    : [
        {
          matcher: /^https:\/\/fonts\.(?:gstatic)\.com\/.*/i,
          handler: new CacheFirst({
            cacheName: "google-fonts-webfonts",
            plugins: [
              new ExpirationPlugin({
                maxEntries: 4,
                maxAgeSeconds: 365 * 24 * 60 * 60,
                maxAgeFrom: "last-used",
              }),
            ],
          }),
        },
        {
          matcher: /^https:\/\/fonts\.(?:googleapis)\.com\/.*/i,
          handler: new StaleWhileRevalidate({
            cacheName: "google-fonts-stylesheets",
            plugins: [
              new ExpirationPlugin({
                maxEntries: 4,
                maxAgeSeconds: 7 * 24 * 60 * 60,
                maxAgeFrom: "last-used",
              }),
            ],
          }),
        },
        {
          matcher: /\.(?:eot|otf|ttc|ttf|woff|woff2|font.css)$/i,
          handler: new StaleWhileRevalidate({
            cacheName: "static-font-assets",
            plugins: [
              new ExpirationPlugin({
                maxEntries: 4,
                maxAgeSeconds: 7 * 24 * 60 * 60,
                maxAgeFrom: "last-used",
              }),
            ],
          }),
        },
        {
          matcher: /\.(?:jpg|jpeg|gif|png|svg|ico|webp)$/i,
          handler: new StaleWhileRevalidate({
            cacheName: "static-image-assets",
            plugins: [
              new ExpirationPlugin({
                maxEntries: 64,
                maxAgeSeconds: 30 * 24 * 60 * 60,
                maxAgeFrom: "last-used",
              }),
            ],
          }),
        },
        {
          matcher: /\/_next\/static.+\.js$/i,
          handler: new CacheFirst({
            cacheName: "next-static-js-assets",
            plugins: [
              new ExpirationPlugin({
                maxEntries: 64,
                maxAgeSeconds: 24 * 60 * 60,
                maxAgeFrom: "last-used",
              }),
            ],
          }),
        },
        {
          matcher: /\/_next\/image\?url=.+$/i,
          handler: new StaleWhileRevalidate({
            cacheName: "next-image",
            plugins: [
              new ExpirationPlugin({
                maxEntries: 64,
                maxAgeSeconds: 24 * 60 * 60,
                maxAgeFrom: "last-used",
              }),
            ],
          }),
        },
        {
          matcher: /\.(?:mp3|wav|ogg)$/i,
          handler: new CacheFirst({
            cacheName: "static-audio-assets",
            plugins: [
              new ExpirationPlugin({
                maxEntries: 32,
                maxAgeSeconds: 24 * 60 * 60,
                maxAgeFrom: "last-used",
              }),
              new RangeRequestsPlugin(),
            ],
          }),
        },
        {
          matcher: /\.(?:mp4|webm)$/i,
          handler: new CacheFirst({
            cacheName: "static-video-assets",
            plugins: [
              new ExpirationPlugin({
                maxEntries: 32,
                maxAgeSeconds: 24 * 60 * 60,
                maxAgeFrom: "last-used",
              }),
              new RangeRequestsPlugin(),
            ],
          }),
        },
        {
          matcher: /\.(?:js)$/i,
          handler: new StaleWhileRevalidate({
            cacheName: "static-js-assets",
            plugins: [
              new ExpirationPlugin({
                maxEntries: 48,
                maxAgeSeconds: 24 * 60 * 60,
                maxAgeFrom: "last-used",
              }),
            ],
          }),
        },
        {
          matcher: /\.(?:css|less)$/i,
          handler: new StaleWhileRevalidate({
            cacheName: "static-style-assets",
            plugins: [
              new ExpirationPlugin({
                maxEntries: 32,
                maxAgeSeconds: 24 * 60 * 60,
                maxAgeFrom: "last-used",
              }),
            ],
          }),
        },
        {
          matcher: /\/_next\/data\/.+\/.+\.json$/i,
          handler: new NetworkFirst({
            cacheName: "next-data",
            plugins: [
              new ExpirationPlugin({
                maxEntries: 32,
                maxAgeSeconds: 24 * 60 * 60,
                maxAgeFrom: "last-used",
              }),
            ],
          }),
        },
        {
          matcher: /\.(?:json|xml|csv)$/i,
          handler: new NetworkFirst({
            cacheName: "static-data-assets",
            plugins: [
              new ExpirationPlugin({
                maxEntries: 32,
                maxAgeSeconds: 24 * 60 * 60,
                maxAgeFrom: "last-used",
              }),
            ],
          }),
        },
        { matcher: /\/api\/auth\/.*/, handler: new NetworkOnly({ networkTimeoutSeconds: 10 }) },
        // HIGH-5: the only cached API GET in MVP — pwa-offline-strategy.md
        // §8's 3s NetworkFirst, own cache name so its expiration policy
        // (and the future staleness read the client does off this cache)
        // never mixes with any other endpoint.
        {
          matcher: ({ sameOrigin, url: { pathname } }) =>
            sameOrigin && pathname === "/api/today-bundle",
          method: "GET",
          handler: new NetworkFirst({
            cacheName: "today-bundle",
            plugins: [
              new ExpirationPlugin({
                maxEntries: 16,
                maxAgeSeconds: 24 * 60 * 60,
                maxAgeFrom: "last-used",
              }),
            ],
            networkTimeoutSeconds: 3,
          }),
        },
        // HIGH-5: every other same-origin API GET (e.g. `/api/history`) is
        // explicitly never cached — pwa-offline-strategy.md §8 "No caching
        // of other API GETs in MVP." `/api/auth/*` and `/api/today-bundle`
        // are excluded here too (belt-and-suspenders; they already match
        // earlier entries above, since routing is first-match-wins).
        {
          matcher: ({ sameOrigin, url: { pathname } }) =>
            sameOrigin &&
            pathname.startsWith("/api/") &&
            !pathname.startsWith("/api/auth/") &&
            pathname !== "/api/today-bundle",
          method: "GET",
          handler: new NetworkOnly(),
        },
        {
          matcher: ({ request, url: { pathname }, sameOrigin }) =>
            request.headers.get("RSC") === "1" &&
            request.headers.get("Next-Router-Prefetch") === "1" &&
            sameOrigin &&
            !pathname.startsWith("/api/"),
          handler: new NetworkFirst({
            cacheName: PAGES_CACHE_NAME.rscPrefetch,
            plugins: [new ExpirationPlugin({ maxEntries: 32, maxAgeSeconds: 24 * 60 * 60 })],
          }),
        },
        {
          matcher: ({ request, url: { pathname }, sameOrigin }) =>
            request.headers.get("RSC") === "1" && sameOrigin && !pathname.startsWith("/api/"),
          handler: new NetworkFirst({
            cacheName: PAGES_CACHE_NAME.rsc,
            plugins: [new ExpirationPlugin({ maxEntries: 32, maxAgeSeconds: 24 * 60 * 60 })],
          }),
        },
        {
          matcher: ({ request, url: { pathname }, sameOrigin }) =>
            request.headers.get("Content-Type")?.includes("text/html") &&
            sameOrigin &&
            !pathname.startsWith("/api/"),
          handler: new NetworkFirst({
            cacheName: PAGES_CACHE_NAME.html,
            plugins: [new ExpirationPlugin({ maxEntries: 32, maxAgeSeconds: 24 * 60 * 60 })],
          }),
        },
        {
          matcher: ({ url: { pathname }, sameOrigin }) =>
            sameOrigin && !pathname.startsWith("/api/"),
          handler: new NetworkFirst({
            cacheName: "others",
            plugins: [new ExpirationPlugin({ maxEntries: 32, maxAgeSeconds: 24 * 60 * 60 })],
          }),
        },
        {
          matcher: ({ sameOrigin }) => !sameOrigin,
          handler: new NetworkFirst({
            cacheName: "cross-origin",
            plugins: [new ExpirationPlugin({ maxEntries: 32, maxAgeSeconds: 60 * 60 })],
            networkTimeoutSeconds: 10,
          }),
        },
        { matcher: /.*/i, method: "GET", handler: new NetworkOnly() },
      ];

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  // Never auto-activate a new SW mid-session — activation is user-triggered
  // via the SKIP_WAITING message below (pwa-offline-strategy.md §8).
  skipWaiting: false,
  clientsClaim: false,
  navigationPreload: true,
  runtimeCaching,
});

self.addEventListener("message", (event: ExtendableMessageEvent) => {
  if (event.data && (event.data as { type?: string }).type === "SKIP_WAITING") {
    void self.skipWaiting();
  }
});

serwist.addEventListeners();
