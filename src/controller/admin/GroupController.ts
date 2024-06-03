import service from "../../service/group"
import AbstractController from "../AbstractController";

class GoupController extends AbstractController {

    routers(router: any): void {
        router.get("/admin/group/list", this.list);
        router.get("/admin/group/list-model", this.listModels);
        router.post("/admin/group/save", this.save);
        router.post("/admin/group/bind-or-unbind-model", this.bindModel);
        router.post("/admin/group/delete", this.delete);
        router.get("/admin/api-key/detail/:id", async (ctx: any) => {
            return this.detail(ctx, "eiai_group");
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

    async listModels(ctx: any) {
        const options = ctx.query;
        const result = await service.listModels(ctx.db, options);
        return super.ok(ctx, result);
    }

    async bindModel(ctx: any) {
        const data = ctx.request.body;
        const result = await service.bindModel(ctx.db, data);
        return super.ok(ctx, result);
    }
}

export default (router: any) => new GoupController(router);