import * as lark from '@larksuiteoapi/node-sdk';
import config from '../../config';
import DB from '../../util/postgres';
import helper from "../../util/helper";
import {ChatRequest} from "../../entity/chat_request";

export default async (router: any): Promise<void> => {
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
        'im.chat.access_event.bot_p2p_chat_entered_v1': async data => {
          await welcome(client, data)
        },
      });

      router.post(`/bot/feishu/${connector.name}/webhook/event`, lark.adaptKoaRouter(eventDispatcher, {autoChallenge: true,}));

    }
  } catch (ex) {
    console.error(ex);
  }
}

const welcome = async (client: lark.Client, data: any) => {
  return null;
};

const chatSync = async (chatContent: string, session_id: string, connectorName: string) => {
  const db = DB.build(config.pgsql);
  const connector = await db.loadByKV('eiai_bot_connector', 'name', connectorName)
  let chatRequest: ChatRequest;
  chatRequest = {
    model: "claude-3-sonnet",
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
