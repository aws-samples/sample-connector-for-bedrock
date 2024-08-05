import service from "../../service/key"
import AbstractController from "../AbstractController";
import csv from "csv-parser";
import fs from "fs";

// Key represents API Key, and also means a user.
class KeyController extends AbstractController {

    routers(router: any): void {
        // const upload = multer();
        router.post("/admin/api-key/apply", this.apply);
        router.post("/admin/api-key/recharge", this.recharge);
        router.post("/admin/api-key/reset-key", this.resetKey);
        router.post("/admin/api-key/update", this.update);
        router.post("/admin/api-key/bind-or-unbind-model", this.bindModel);
        router.post("/admin/api-key/import", this.import);
        router.get("/admin/api-key/list", this.list);
        router.get("/admin/api-key/list-model", this.listModels);
        router.get("/admin/api-key/detail/:id", async (ctx: any) => {
            return this.detail(ctx, "eiai_key");
        });
    }

    async update(ctx: any) {
        const data = ctx.request.body;
        const result = await service.update(ctx.db, data);
        return super.ok(ctx, result);
    }

    async apply(ctx: any) {
        const body = ctx.request.body;
        const result = await service.create(ctx.db, body);
        return super.ok(ctx, result);
    }

    async list(ctx: any) {
        const options = ctx.query;
        const result = await service.list(ctx.db, options);
        return super.ok(ctx, result);
    }

    async recharge(ctx: any) {
        const body = ctx.request.body;
        const result = await service.recharge(ctx.db, body);
        return super.ok(ctx, result);
    }

    async bindModel(ctx: any) {
        const data = ctx.request.body;
        const result = await service.bindModel(ctx.db, data);
        return super.ok(ctx, result);
    }

    async listModels(ctx: any) {
        const data = ctx.query;
        const result = await service.listModels(ctx.db, data);
        return super.ok(ctx, result);
    }

    async resetKey(ctx: any) {
        const data = ctx.request.body;
        const result = await service.resetKey(ctx.db, data);
        return super.ok(ctx, result);
    }

    async import(ctx: any) {
        const toJson = (path: any) => {
            return new Promise((resolve, reject) => {
                const results = [];
                fs.createReadStream(path)
                    .pipe(csv())
                    .on('data', (data) => results.push(data))
                    .on('end', () => {
                        resolve(results);
                    });
            });
        }
        const month_quota = ctx.request.body.month_quota;
        const group_id = ctx.request.body.group_id;
        const file = ctx.request.files.file;
        const jsonUsers: any = await toJson(file.filepath);
        for (const user of jsonUsers) {
            const name = user["cognito:username"] || user.name;
            // console.log(name, month_quota, group_id);
            await service.create(ctx.db, {
                name,
                email: user.email,
                month_quota,
                group_id
            });
        }
        return super.ok(ctx, "OK");
    }
}

export default (router: any) => new KeyController(router);