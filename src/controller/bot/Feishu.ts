import * as lark from '@larksuiteoapi/node-sdk';
import config from '../../config';
import DB from '../../util/postgres';


export default async (router: any): Promise<void> => {
  const db = DB.build(config.pgsql);
  const connectors = await db.list("eiai_bot_connector", {
    where: "provider=$1",
    params: ["feishu"],
    limit: 1000
  });
  for (const connector of connectors) {
    console.log("----------------Feishu [" + connector.name + "] configured----------------");

    const { appId, appSecret, encryptKey } = connector.config;
    const client = new lark.Client({
      appId,
      appSecret
    });

    const params: any = {};

    if (encryptKey) params.encryptKey = encryptKey;

    const eventDispatcher = new lark.EventDispatcher(params).register({
      'im.message.receive_v1': async data => { receive(client, data) },
    });

    router.post(`/bot/feishu/${connector.name}/webhook/event`, lark.adaptKoaRouter(eventDispatcher, { autoChallenge: true, }));

  }
}


const receive = async (client: lark.Client, data: any) => {
  console.log(data);
  const open_chat_id = data.message.chat_id;

  const res = await client.im.message.create({
    params: {
      receive_id_type: 'chat_id',
    },
    data: {
      receive_id: open_chat_id,
      content: JSON.stringify({ text: 'hello world' }),
      msg_type: 'text'
    },
  });
  return res;
};

