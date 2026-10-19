import type { Middleware } from "koa";
import fs from "fs";
import path from "path";
import { lookup } from "mime-types";

const PREFIX = "/cc";

// /cc shares the BRConnector origin with /manager: only same-origin scripts, no plugins, no <base>, no framing.
// The built bundle uses no eval/new Function and index.html has no inline script.
const CONTENT_SECURITY_POLICY = "script-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'";

export interface CcStaticOptions {
  staticDir: string;
  isEnabled: () => Promise<boolean>;
}

function isFile(p: string): boolean {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

/**
 * Serves the claude-code-web SPA under /cc. `/cc/api*` is left to the BFF routes.
 */
export function ccStaticHandler(opts: CcStaticOptions): Middleware {
  const root = path.resolve(opts.staticDir);
  const indexPath = path.join(root, "index.html");

  return async (ctx, next) => {
    const p = ctx.path;
    const inScope = p === PREFIX || (p.startsWith(PREFIX + "/") && p !== PREFIX + "/api" && !p.startsWith(PREFIX + "/api/"));
    if (ctx.method !== "GET" || !inScope) {
      await next();
      return;
    }
    if (!(await opts.isEnabled())) {
      ctx.status = 404;
      return;
    }
    if (p === PREFIX) {
      ctx.redirect(PREFIX + "/");
      return;
    }

    const rel = p.slice(PREFIX.length + 1);
    if (rel === "") {
      serveIndex(ctx);
      return;
    }
    const filePath = path.resolve(root, rel);
    // Reject anything that resolves outside the static root (decoded ../ etc).
    if (rel.includes("\0") || !filePath.startsWith(root + path.sep)) {
      ctx.status = 404;
      return;
    }
    if (isFile(filePath)) {
      ctx.type = lookup(filePath) || "application/octet-stream";
      ctx.set("Content-Security-Policy", CONTENT_SECURITY_POLICY);
      ctx.set(
        "Cache-Control",
        filePath === indexPath
          ? "no-cache"
          : rel.startsWith("assets/")
            ? "public, max-age=31536000, immutable"
            : "no-cache",
      );
      ctx.body = fs.createReadStream(filePath);
      return;
    }
    if (!/\.\w+$/.test(p)) {
      serveIndex(ctx);
      return;
    }
    await next();
  };

  function serveIndex(ctx: Parameters<Middleware>[0]) {
    ctx.type = "text/html; charset=utf-8";
    ctx.set("Cache-Control", "no-cache");
    ctx.set("Content-Security-Policy", CONTENT_SECURITY_POLICY);
    ctx.body = fs.createReadStream(indexPath);
  }
}
