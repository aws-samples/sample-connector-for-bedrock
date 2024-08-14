
import service from "../../service/model"
import AbstractController from "../AbstractController";
import providers from "../../providers/provider"

class ModelController extends AbstractController {

    routers(router: any): void {
        router.post("/admin/model/save-kb-model", this.saveKnowledgeBaseModel);
        router.post("/admin/model/save", this.save);
        router.post("/admin/model/delete", this.delete);
        router.get("/admin/model/list", this.list);
        router.get("/admin/model/list-providers", this.listProviders);
        router.get("/admin/model/detail/:id", async (ctx: any) => {
            return this.detail(ctx, "eiai_model");
        });
    }
    async listProviders(ctx: any) {
        // const result = [
        //     "bedrock-claude3",
        //     "bedrock-mistral",
        //     "bedrock-llama3",
        //     "bedrock-knowledge-base",
        //     "ollama",
        //     "bedrock-converse",
        //     "sagemaker-llama3",
        // ];
        return super.ok(ctx, Object.keys(providers));
    }


    async save(ctx: any) {
        const data = ctx.request.body;
        let { id, name, multiple, config, provider,
            price_in,
            price_out, } = data;

        config = config || {};

        if (price_in) {
            price_in = parseFloat(price_in) / 1e6;
        }
        if (price_out) {
            price_out = parseFloat(price_out) / 1e6;
        }
        let result: any;
        if (id) {
            result = await service.update(ctx.db, {
                id,
                name,
                price_in,
                price_out,
                provider,
                multiple,
                config
            });
        } else {
            if (!name) {
                throw new Error("name is required");
            }
            if (!provider) {
                throw new Error("provider is required");
            }
            result = await service.create(ctx.db, {
                name,
                provider,
                multiple,
                price_in,
                price_out,
                config
            });
        }
        return super.ok(ctx, result);
    }


    async saveKnowledgeBaseModel(ctx: any) {
        const data = ctx.request.body;
        let { id, name, object, knowledgeBaseId, summaryModel, region } = data;
        if (!name) {
            throw new Error("name is required");
        }

        if (!knowledgeBaseId) {
            throw new Error("knowledgeBaseId is required");
        }
        if (!summaryModel) {
            throw new Error("summaryModel is required");
        }

        const provider = "bedrock-knowledge-base";
        const multiple = false;
        const owned_by = "aws-bedrock"
        object = object || "rag";
        region = region || "us-east-1";

        // if (!provider) {
        //     throw new Error("provider is required, now supported providers include: bedrock-knowledge-base");
        // }


        if (["claude-3-sonnet", "claude-3-haiku", "claude-3-opus",].indexOf(summaryModel) === -1) {
            throw new Error("summaryModel must be one of the followings: claude-3-sonnet, claude-3-haiku or claude-3-opus");
        }

        const config = JSON.stringify({
            knowledgeBaseId, summaryModel, region, provider, object, multiple, owned_by
        });

        let result: any;
        if (id) {
            result = await service.update(ctx.db, {
                id,
                name,
                config
            });
        } else {
            result = await service.create(ctx.db, {
                name,
                config
            });
        }
        return super.ok(ctx, result);
    }
    async delete(ctx: any) {
        const data = ctx.request.body;
        const result = await service.delete(ctx.db, data);
        return super.ok(ctx, result);
    }
    async list(ctx: any) {
        const options = ctx.query;
        const result = await service.list(ctx.db, options);
        return super.ok(ctx, result);
    }
}

export default (router: any) => new ModelController(router);