import type { Middleware } from "koa";
import { koaBody } from "koa-body";
import { fail } from "../controller/runtime/claude_code_web";

// The BFF forwards the body to the runtime as is. The client keeps a send under 4.5 MiB (images plus text),
// so 8 MiB is generous; every other route keeps the global parser and its 100 MB limit.
export const CC_API_BODY_LIMIT = 8 * 1024 * 1024;

// Lower-cased like authHandler: the router matches paths case-insensitively.
function isCcApi(path: string): boolean {
  return path.toLowerCase().startsWith("/cc/api/");
}

/**
 * Parses /cc/api/* bodies with CC_API_BODY_LIMIT and every other request with `parseBody`. A larger body gets
 * 413 in the BFF's { error, detail } shape before auth and before any SSM, STS or AgentCore call.
 */
export function ccBodyLimit(parseBody: Middleware): Middleware {
  const parseCcBody = koaBody({
    encoding: "utf-8",
    jsonLimit: CC_API_BODY_LIMIT,
    formLimit: CC_API_BODY_LIMIT,
    textLimit: CC_API_BODY_LIMIT,
  });
  return async (ctx, next) => {
    if (!isCcApi(ctx.path)) return parseBody(ctx, next);
    const tooLarge = () => fail(ctx, 413, `request body is over the ${CC_API_BODY_LIMIT / 1024 / 1024} MiB limit`);
    // Declared length first, so a body the parser would not read (another content type) is refused too.
    if ((ctx.request.length ?? 0) > CC_API_BODY_LIMIT) return tooLarge();
    try {
      await parseCcBody(ctx, async () => {});
    } catch (e: any) {
      if (e?.status !== 413) throw e;
      return tooLarge();
    }
    await next();
  };
}
