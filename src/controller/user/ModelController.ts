import service from "../../service/key";
import models from "../../models_data"
import AbstractController from "../AbstractController";

class ModelController extends AbstractController {

    routers(router: any): void {
        router.get("/user/model/list", this.list);
        router.get("/user/model/list-for-brclient", this.listForBRClient);
    }
    async list(ctx: any) {
        const id = ctx.user.id;
        const myself = await service.loadById(ctx.db, id);

        const rows = await service.listUsableModels(ctx.db, myself, 200);
        // Public fields only: model config holds provider credentials.
        const items = rows.map((item: any) => ({
            name: item.model_name,
            provider: item.provider,
            price_in: item.price_in,
            price_out: item.price_out,
            multiple: item.multiple,
            group_name: item.group_name ?? null,
        }));
        return super.ok(ctx, items);
    }

    async listForBRClient(ctx: any) {
        const myself = ctx.user;
        // const myself = await service.loadById(ctx.db, id);
        let customModels = [];
        if (myself && ctx.db) {
            const mapFun = (item: any) => ({
                name: item.model_name,
                available: true,
                modelId: item.model_name,
                multiple: item.multiple === 1,
                displayName: item.model_name,
                provider: {
                    id: "aws",
                    name: "AWS",
                    providerName: "BRConnector"
                }
            });
            customModels = (await service.listUsableModels(ctx.db, myself, 1000)).map(mapFun);
        } else {
            const mapFun = (item: any) => ({
                name: item.id,
                available: true,
                modelId: item.id,
                multiple: item.multiple,
                displayName: item.id,
                provider: {
                    id: "aws",
                    name: "AWS",
                    providerName: "BRConnector"
                }
            });
            customModels = models.map(mapFun);
        }

        return super.ok(ctx, customModels);
    }
}

export default (router: any) => new ModelController(router);