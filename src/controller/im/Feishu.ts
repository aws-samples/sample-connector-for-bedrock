import AbstractController from "../AbstractController";

class FeishuController extends AbstractController {

  routers(router: any): void {
    // router.get("/im/feishu/send", this.webhook);
    router.post("/im/feishu/receive", this.receive);
  }

  async send(ctx: any) {
    return super.ok(ctx, "ok");
  }

  async receive(ctx: any) {
    return super.ok(ctx, "ok");
  }

}

export default (router: any) => new FeishuController(router);