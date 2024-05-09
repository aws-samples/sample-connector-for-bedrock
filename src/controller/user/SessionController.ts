import service from "../../service/session"
import AbstractController from "../AbstractController";

class SessionController extends AbstractController {
    public routers(router: import("koa-router") <any, {}>): void {
        router.get("/user/session/detail", this.detail);
        router.get("/user/session/detail/:id", this.detail);
        router.get("/user/session/list", this.list);
    }

    async detail(ctx: any) {
        const id = ctx.query.id || ctx.params.id;
        const key_id = ctx.user.id;
        const result = await service.detail(ctx.db, { id, key_id })
        return super.ok(ctx, result);
    }

    async list(ctx: any) {
        const options = ctx.query;
        const key_id = ctx.user.id;
        options.key_id = key_id;
        const result = await service.list(ctx.db, options);
        return super.ok(ctx, result);
    }

}

export default (router: any) => new SessionController(router);