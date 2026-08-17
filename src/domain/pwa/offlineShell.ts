// The precached app-shell route.
//
// Serwist answers any *document* request it cannot satisfy from the network
// or a runtime cache with this URL's precached HTML (see `fallbacks` in
// src/app/sw.ts). That is what makes a genuinely cold offline launch work:
// in a brand-new browser process nothing has requested `/today` yet, so
// there is no runtime-cached document to fall back on — only the precache,
// which is populated at service-worker install time and never expires.
//
// Kept in `domain/` because four different layers need the same string:
// the worker (src/app/sw.ts, via a relative import — tsconfig.worker.json
// has no `paths`), the shell component (src/ui/OfflineShell.tsx), the
// middleware whitelist (src/middleware.ts — the install-time precache fetch
// must reach the shell, not a login redirect), and the route directory name
// itself. next.config.ts repeats it as a literal because the Next config
// loader does not resolve `@/…` aliases; the cold-launch e2e regression
// asserts the built precache manifest really contains this URL, so drift
// between the two fails a test instead of a gym session.
export const OFFLINE_SHELL_PATH = "/~offline";
