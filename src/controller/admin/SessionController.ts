import service from "../../service/session"
import AbstractController from "../AbstractController";

class SessionController extends AbstractController {
    public routers(router: import("koa-router") <any, {}>): void {
        router.get("/admin/session/detail", this.detail);
        router.get("/admin/session/detail/:id", this.detail);
        router.get("/admin/session/list", this.list);
    }

    async detail(ctx: any) {
        const id = ctx.query.id || ctx.params.id;
        const result = await service.detail(ctx.db, { id })
        return super.ok(ctx, result);
    }
    async list(ctx: any) {
        const options = ctx.query;
        const result = await service.list(ctx.db, options);
        return super.ok(ctx, result);
    }

}

export default (router: any) => new SessionController(router);