import service from "../../service/statistics"
import AbstractController from "../AbstractController";

class StatisticsController extends AbstractController {
    public routers(router: import("koa-router") <any, {}>): void {
        router.get("/admin/statistics/total", this.total);
    }

    async total(ctx: any) {
        const options = ctx.query;
        const result = await service.total(ctx.db, options);
        return super.ok(ctx, result);
    }
}

export default (router: any) => new StatisticsController(router);