import service from "../../service/key"
import AbstractController from "../AbstractController";

// Key represents API Key, and also means a user.
class KeyController extends AbstractController {

    routers(router: any): void {
        router.get("/user/api-key/mine", this.detail);
    }
    async detail(ctx: any) {
        const id = ctx.user.id;
        const result = await service.detail(ctx.db, { id })
        return super.ok(ctx, result);
    }

}

export default (router: any) => new KeyController(router);