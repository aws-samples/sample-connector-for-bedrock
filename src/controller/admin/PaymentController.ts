import service from "../../service/payment"
import AbstractController from "../AbstractController";

class PaymentController extends AbstractController {
    public routers(router: import("koa-router") <any, {}>): void {
        router.get("/admin/payment/list", this.list);
    }

    async list(ctx: any) {
        const options = ctx.query;
        const result = await service.list(ctx.db, options);
        return super.ok(ctx, result);
    }

}

export default (router: any) => new PaymentController(router);