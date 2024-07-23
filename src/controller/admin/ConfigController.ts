// import config from '../../config';
// import helper from "../../util/helper"
// import AbstractController from "../AbstractController";

// class ConfigController extends AbstractController {
//     public routers(router: import("koa-router") <any, {}>): void {
//         router.get("/admin/config/region", this.getRegionConfig);
//         router.post("/admin/config/region", this.updateRegionConfig);
//     }

//     async getRegionConfig(ctx: any) {
//         return super.ok(ctx, {"region":config.bedrock.region,"random_region":helper.selectRandomRegion(config.bedrock.region)});
//     }

//     async  updateRegionConfig(ctx: any) {
//         const data = ctx.request.body;
//         if(data?.region){
//             config.bedrock.region=data.region
//         }
//         return super.ok(ctx, data);
//     }

// }



// export default (router: any) => new ConfigController(router);