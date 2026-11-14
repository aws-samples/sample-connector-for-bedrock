import type { Middleware } from "koa";
import serve from "koa-static-server";

export function brclientStaticHandler(rootDir: string): Middleware {
  return serve({
    rootDir,
    rootPath: "/brclient",
    index: "index.html",
    maxage: 1000 * 60 * 60 * 24 * 30,
  });
}
