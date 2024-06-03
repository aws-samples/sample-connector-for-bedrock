import service from "../../service/key";
import serviceGroup from "../../service/group";
import AbstractController from "../AbstractController";

class ModelController extends AbstractController {

    routers(router: any): void {
        router.get("/user/model/list", this.list);
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
}

export default (router: any) => new ModelController(router);