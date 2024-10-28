import models from '../../models_data';
import service from "../../service/key";
import serviceGroup from "../../service/group";

export default {
    list: async (ctx: any) => {
        // console.log(ctx.user);
        if (ctx.db && ctx.user && ctx.user.id > 0) {
            const myself = ctx.user;
            const keyModels = await service.listModels(ctx.db, { key_id: myself.id, limit: 1000 });
            const groupModels = await serviceGroup.listModels(ctx.db, { group_id: myself.group_id, limit: 1000 });
            const keyItems = keyModels.items;
            const groupItems = groupModels.items;

            const mapFun = (model: any) => ({
                id: model.model_name,
                object: "model",
                multiple: model.multiple === 1,
                created: Math.ceil(model.created_at * 1e-3),
                owned_by: model.provider
            });
            keyItems.map((kmd: any) => {
                const contains = groupItems.some((gmd: any) => gmd.model_id == kmd.model_id);
                if (!contains) {
                    groupItems.push(kmd);
                }
            });
            const customModels = groupItems.map(mapFun);

            ctx.body = {
                "object": "list",
                data: customModels

            };
        } else if (ctx.db && ctx.user && ctx.user.id == -1 && ctx.cache) {
            // const myself = ctx.user;
            // const keyModels = await service.listModels(ctx.db, { key_id: myself.id, limit: 1000 });
            // const groupModels = await serviceGroup.listModels(ctx.db, { group_id: myself.group_id, limit: 1000 });
            // const keyItems = keyModels.items;
            // const groupItems = groupModels.items;

            const mapFun = (model: any) => ({
                id: model.name,
                object: "model",
                multiple: model.multiple === 1,
                created: Math.ceil(model.created_at * 1e-3),
                owned_by: model.provider
            });
            console.log(ctx.cache.models)
            const customModels = ctx.cache.models.map(mapFun);

            ctx.body = {
                "object": "list",
                data: customModels

            };
        }

        else {
            ctx.body = models.filter(model => !model.deleted).map(model => ({
                "id": model.id,
                "object": model.object,
                "multiple": model.multiple,
                "created": model.created,
                "owned_by": model.owned_by
            }));
        }
    },
    detail: async (ctx: any) => {
    }
}
