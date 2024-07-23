import service from "../../service/key";
import serviceGroup from "../../service/group";
import AbstractController from "../AbstractController";

class ModelController extends AbstractController {

    routers(router: any): void {
        router.get("/user/model/list", this.list);
        router.get("/user/model/list-for-brclient", this.listForBRClient);
    }
    async list(ctx: any) {
        const id = ctx.user.id;
        const myself = await service.loadById(ctx.db, id);

        const keyModels = await service.listModels(ctx.db, { key_id: id, limit: 200 });
        const groupModels = await serviceGroup.listModels(ctx.db, { group_id: myself.group_id, limit: 200 });

        const keyItems = keyModels.items;
        const groupItems = groupModels.items;

        keyItems.map((kmd: any) => {
            const contains = groupItems.some((gmd: any) => gmd.model_id == kmd.model_id);
            if (!contains) {
                groupItems.push(kmd);
            }
        });
        return super.ok(ctx, groupItems);
    }

    async listForBRClient(ctx: any) {
        const myself = ctx.user;
        // const myself = await service.loadById(ctx.db, id);

        const keyModels = await service.listModels(ctx.db, { key_id: myself.id, limit: 1000 });
        const groupModels = await serviceGroup.listModels(ctx.db, { group_id: myself.group_id, limit: 200 });
        const keyItems = keyModels.items;
        const groupItems = groupModels.items;
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

        keyItems.map((kmd: any) => {
            const contains = groupItems.some((gmd: any) => gmd.model_id == kmd.model_id);
            if (!contains) {
                groupItems.push(kmd);
            }
        });
        const customModels = groupItems.map(mapFun);

        return super.ok(ctx, customModels);
    }
}

export default (router: any) => new ModelController(router);