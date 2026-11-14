# 0007. Cache headers for the served UIs

Status: Accepted.

## Context

BRConnector serves three browser UIs from its own origin: BRClient at `/brclient/` (a Next.js static export), the admin console at `/manager/` (a vite build) and Claude Code Web at `/cc/` (a vite build). It also generates `/portal-for-brclient.html`.

`/brclient/` sent `Cache-Control: max-age=2592000` for every file, `index.html` included. After an upgrade, a browser kept the old `index.html` for up to 30 days, and that page loaded the old build. `/manager/` and the portal page sent no `Cache-Control`. `/cc/` already sent `no-cache` for its index and other files and a one-year `immutable` lifetime for `assets/`.

Some build files get a new name when their content changes: `_next/static/` in BRClient, and the `js/`, `css/`, `img/`, `fonts/` and `assets/` names in `vite.config.js` for the admin console. Every other file keeps its name across builds.

The server does not answer conditional requests. A request with `If-Modified-Since` gets `200` and the full body, also when the file did not change.

## Decision

- A file in a content-hashed directory gets `public, max-age=31536000, immutable`. Every other file, and every page the server generates, gets `no-cache`.
- One function, `cacheControlFor` in `src/middleware/static_cache.ts`, applies this rule. Each UI handler gives it the UI root, the resolved file path and the list of hashed directories. The function computes the relative path from the resolved file, so a URL such as `/manager/js/../index.html` gets `no-cache`.
- The server still does not answer `304`.

## Consequences

- A browser picks up a new BRClient, admin console or portal page on the next load after an upgrade. A browser that cached the old BRClient page before this change keeps that copy until it expires or the user refreshes once.
- On each BRClient load, the browser downloads the unhashed files that BRClient requests again in full. These are `index.html` (about 9 KB) and `prompts.json` (about 140 KB), which BRClient fetches on start, and any image that is not in `_next/static/`. Before, the browser kept them for 30 days.
- A new directory in `vite.config.js` must also go into the admin console's list. A test reads the vite output names and fails when one of them has no hash or is not served as `immutable`.

## Alternatives considered

- **Answer `304` from `Last-Modified`.** This removes the full download. But the response depends on file modification times only. If a deployment keeps or lowers the modification times of the new files, the server answers `304` with an old file, and the browser keeps the old version. That is the problem this change fixes. It is not known how each deployment type sets these times.
- **Answer `304` from a content hash (`ETag`).** This is safe and removes the full download, at the cost of hashing each unhashed file once per process. It can be added later without changing the `Cache-Control` rule.
- **A short lifetime, such as one hour, for unhashed files other than pages.** This shortens the download cost but lets `prompts.json` and icons stay old for that hour after an upgrade, and it adds a third class of files.
