# 0012. zod 3 in the gateway until koa-body and openai move

Status: Accepted.

## Context

zod 3.25.76 has a known high-severity vulnerability: validation of an oversized constrained collection can exhaust memory. The fix is only in zod 4.6.6 and later, and 3.25.76 is the last zod 3 release.

The gateway source does not import zod. Two dependencies bring it in:

- koa-body 6.0.1 depends on `zod ^3.19.1`. It calls zod once, to check the options object that `koaBody()` gets when the server starts. It does not run zod on request data.
- openai 4.104.0 has `zod ^3.23.8` as an optional peer dependency. Only its `openai/helpers/zod` module uses zod, and the gateway does not import that module.

The image installs zod 3.25.76 too: it runs `npm install --omit=dev` on `package.json`, and koa-body 6 still selects zod 3.

## Decision

- Keep zod on 3.25.76, koa-body on 6.0.1 and openai on 4.104.0.
- Do not use `pnpm.overrides` to force zod 4 under koa-body or openai, because both declare zod 3 ranges.

## Consequences

- The zod vulnerability stays in the lockfile and in the image. Neither calls zod on data from a request, so a client cannot reach it.
- zod 4 needs two major upgrades of direct dependencies. Each needs its own change and tests:
  - koa-body 7 or later depends on zod 4, but also on `@types/koa ^3` (Koa 3 types) and formidable 3. With koa-body 8.0.1 and the current koa 2 and `@types/koa` 2, `tsc --noEmit` fails at the two places that pass koa-body middleware to Koa 2 (`src/index.ts`, `src/middleware/claude_code_web_body.ts`). formidable 3 gives each file field as an array, so the key import upload in `src/controller/admin/KeyController.ts` (`ctx.request.files.file`) changes too. koa-body 7 also changes the type of `ctx.request.body` from `any` to `{ [key: string]: unknown } | string`. Seven files read `ctx.request.body`. How many of them then need a change was not measured, because the new type applies only once the gateway uses the Koa 3 types.
  - openai 5 or later accepts zod 4 (`^3.25 || ^4.0`). The gateway uses the openai SDK in `src/providers/openai_compatible.ts`, `src/providers/azure_openai.ts` and `src/providers/azure_openai_image.ts`, and a major SDK upgrade changes the request and stream types that they use.
- When both move, zod 4 replaces zod 3 without a change to the gateway source.

## Alternatives considered

- **Upgrade koa-body only.** zod 4 enters the tree, but zod 3 stays for the openai 4 peer, so the vulnerable release does not leave the lockfile.
- **Override zod to 4.** koa-body 6 and openai 4 would run on a major release that they do not declare. For example, koa-body 6 uses `z.nativeEnum`, which zod 4 marks as deprecated.
