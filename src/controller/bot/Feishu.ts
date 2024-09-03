import * as lark from '@larksuiteoapi/node-sdk';
import config from '../../config';
import DB from '../../util/postgres';
import helper from "../../util/helper";
import {ChatRequest} from "../../entity/chat_request";
import service from "../../service/lark"
import AbstractController from "../AbstractController";

class ModelController extends AbstractController {
  async routers(router: any): Promise<void> {
    router.post("/admin/bot/feishu/save", this.save);
    router.post("/admin/bot/feishu/delete", this.delete);
    router.get("/admin/bot/feishu/list", this.list);
    router.get("/admin/bot/feishu/list-providers", this.listProviders);
    router.get("/admin/bot/feishu/detail/:id", async (ctx: any) => {
      return this.detail(ctx, "eiai_bot_connector");
    });

    try {
      const db = DB.build(config.pgsql);
      const connectors = await db.list("eiai_bot_connector", {
        where: "provider=$1",
        params: ["feishu"],
        limit: 1000
      });
      for (const connector of connectors) {
        console.log("Feishu bot [" + connector.name + "] is connected...");
        const {appId, appSecret, encryptKey} = connector.config;
        const client = new lark.Client({
          appId,
          appSecret
        });

        const params: any = {};
        if (encryptKey) params.encryptKey = encryptKey;
        const eventDispatcher = new lark.EventDispatcher(params).register({
          'im.message.receive_v1': data => {
            receive(client, data, connector.name)
          }, //  单聊
        });

        router.post(`/bot/feishu/${connector.name}/webhook/event`, lark.adaptKoaRouter(eventDispatcher, {autoChallenge: true,}));
        console.log(`Webhook enabled: /bot/feishu/${connector.name}/webhook/event`)
      }
    } catch (ex) {
      console.error(ex);
    }
  }

  async listProviders(ctx: any) {
    const result = [
      "feishu",
    ];
    return super.ok(ctx, result);
  }

  async save(ctx: any) {
    const data = ctx.request.body;
    let {
      id, name, config, provider,
      created_at,
      updated_at,
    } = data;

    config = config || {};
    let result: any;
    if (id) {
      result = await service.update(ctx.db, {
        id,
        name,
        provider,
        config,
        updated_at
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
        config,
        created_at
      });
    }
    return super.ok(ctx, result);
  }

  async delete(ctx: any) {
    const data = ctx.request.body;
    console.log(data)
    const result = await service.delete(ctx.db, data);
    return super.ok(ctx, result);
  }

  async list(ctx: any) {
    const options = ctx.query;
    const result = await service.list(ctx.db, options);
    return super.ok(ctx, result);
  }
}

const chatSync = async (chatContent: string, session_id: string, connectorName: string) => {
  const db = DB.build(config.pgsql);
  const connector = await db.loadByKV('eiai_bot_connector', 'name', connectorName)
  let chatRequest: ChatRequest;
  chatRequest = {
    model: connector.config.modelId || "claude-3-sonnet",
    messages: [
      {
        role: "user",
        content: chatContent
      }
    ]
  };

  const response = await fetch("http://localhost:8866/v1/chat/completions", {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + connector.config.apiKey,
      'Session-Id': session_id
    },
    body: JSON.stringify(chatRequest)
  });

  return await response.json();
}


const receive = (client: lark.Client, data: any, connectorName: string) => {
  const open_id = data.sender.sender_id.open_id;
  const jContent = JSON.parse(data.message.content);
  chatSync(jContent.text, data.message.chat_id, connectorName).then(async llmRes => {
    await client.im.message.create({
      params: {
        receive_id_type: 'open_id',
      },
      data: {
        receive_id: open_id,
        msg_type: 'text',
        content: JSON.stringify({
          "text": llmRes.choices[0].message.content
        }),
        uuid: helper.generateUUID(),
      }
    });
  })
};

export default (router: any) => new ModelController(router);
