import type { Middleware } from "koa";
import fs from "fs";
import path from "path";
import { lookup } from "mime-types";

const PREFIX = "/manager";

/**
 * Serves the manager UI under /manager from staticDir, with SPA fallback to index.html.
 */
export function managerStaticHandler(staticDirOpt: string): Middleware {
  const staticDir = path.resolve(staticDirOpt);
  return async (ctx, next) => {
    if (ctx.path.startsWith(PREFIX) && ctx.method === "GET") {
      const relativePath = ctx.path.slice(PREFIX.length);
      const filePath =
        relativePath === "" || relativePath === "/"
          ? path.join(staticDir, "index.html")
          : path.resolve(staticDir, "." + path.sep + relativePath);

      // Only serve paths that stay inside the UI directory and carry no NUL byte.
      if (
        relativePath.includes("\0") ||
        /%00/i.test(relativePath) ||
        !filePath.startsWith(staticDir + path.sep)
      ) {
        ctx.status = 404;
        return;
      }

      if (
        relativePath !== "" &&
        relativePath !== "/" &&
        fs.existsSync(filePath) &&
        fs.statSync(filePath).isFile()
      ) {
        ctx.type = lookup(filePath) || "application/octet-stream";
        ctx.body = fs.createReadStream(filePath);
        return;
      }

      if (!/\.\w+$/.test(ctx.path)) {
        ctx.type = "text/html; charset=utf-8";
        ctx.body = fs.readFileSync(path.join(staticDir, "index.html"));
        return;
      }
    }
    await next();
  };
}
