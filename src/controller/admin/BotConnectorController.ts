import service from "../../service/bot_connector"
import AbstractController from "../AbstractController";

class BotConnectorController extends AbstractController {

    routers(router: any): void {
        router.get("/admin/bot-connector/list", this.list);
        router.post("/admin/bot-connector/save", this.save);
        router.post("/admin/bot-connector/delete", this.delete);
        router.get("/admin/bot-connector/detail/:id", async (ctx: any) => {
            return this.detail(ctx, "eiai_bot_connector");
        });
    }

    async delete(ctx: any) {
        const data = ctx.request.body;
        const result = await service.delete(ctx.db, data);
        return super.ok(ctx, result);
    }

    async save(ctx: any) {
        const data = ctx.request.body;
        const result = await service.save(ctx.db, data);
        return super.ok(ctx, result);
    }

    async list(ctx: any) {
        const options = ctx.query;
        const result = await service.list(ctx.db, options);
        return super.ok(ctx, result);
    }

}

export default (router: any) => new BotConnectorController(router);