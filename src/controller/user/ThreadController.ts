import service from "../../service/thread"
import AbstractController from "../AbstractController";

class ThreadController extends AbstractController {
    public routers(router: import("koa-router") <any, {}>): void {
        router.get("/user/thread/detail", this.detail);
        router.get("/user/thread/detail/:id", this.detail);
        router.get("/user/thread/list", this.list);
    }

    async detail(ctx: any) {
        const id = ctx.query.id || ctx.params.id;
        const key_id = ctx.user.id;
        const result = await service.detail(ctx.db, { id, key_id })
        return super.ok(ctx, result);
    }
    async list(ctx: any) {
        const options = ctx.query;
        const result = await service.list(ctx.db, options);
        return super.ok(ctx, result);
    }

}

export default (router: any) => new ThreadController(router);