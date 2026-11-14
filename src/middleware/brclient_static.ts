import type { Middleware } from "koa";
import type { ServerResponse } from "http";
import path from "path";
import serve from "koa-static-server";
import { cacheControlFor } from "./static_cache";

// In a Next.js static export, a file under _next/static gets a new name whenever its content changes.
const HASHED_DIRS = ["_next/static"];

export function brclientStaticHandler(rootDir: string): Middleware {
  const root = path.resolve(rootDir);
  return serve({
    rootDir: root,
    rootPath: "/brclient",
    index: "index.html",
    setHeaders: (res: ServerResponse, filePath: string) =>
      res.setHeader("Cache-Control", cacheControlFor(root, filePath, HASHED_DIRS)),
  });
}
