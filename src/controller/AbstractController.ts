import Router from "koa-router";
import response from "../util/response";

abstract class AbstractController {

    constructor(router: Router) {
        this.routers(router);
    }

    async detail(ctx: any, table: string) {
        const id = ~~(ctx.params.id || ctx.query.id)
        const result = await ctx.db.loadById(table, id);
        return this.ok(ctx, result);
    }

    async save(ctx: any, table: string, data: any) {
        if (data.id) {
            data.updated_at = new Date();
        }
        const result = await ctx.db.save(table, data);
        return this.ok(ctx, result);
    }

    ok(ctx: any, data: any) {
        ctx.body = response.ok(data);
    }

    error(ctx: any, data: any) {
        ctx.body = response.error(data);
    }
    public abstract routers(router: Router): void;
}

export default AbstractController;