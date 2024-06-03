import models from '../../models_data';
import modelService from '../../service/model';

export default {
    list: async (ctx: any) => {
        // ctx.body = models.filter(model => !model.deleted).map(model => ({
        //     "id": model.id,
        //     "object": model.object,
        //     "multiple": model.multiple,
        //     "created": model.created,
        //     "owned_by": model.owned_by

        // }));

        const dbModels: any = await modelService.list(ctx.db, { limit: 100 });

        // const systemModels = models.filter(model => !model.deleted).map(model => ({
        //     "id": model.id,
        //     "object": model.object,
        //     "multiple": model.multiple,
        //     "created": model.created,
        //     "owned_by": model.owned_by
        // }));

        const customModels = dbModels.items.map(model => ({
            "id": model.name,
            "object": "model",
            "multiple": model.multiple,
            "created": ~~(model.created_at * 1 / 1000),
            "owned_by": model.provider
        }));

        ctx.body = {
            "object": "list",
            // "data": [...systemModels, ...customModels]
            data: customModels

        };
    },
    detail: async (ctx: any) => {
    }
}
