import * as lark from '@larksuiteoapi/node-sdk';
import config from '../../config';
import DB from '../../util/postgres';
import helper from "../../util/helper";
import {ChatRequest} from "../../entity/chat_request";
import AbstractController from "../AbstractController";
import * as fs from 'fs';
import * as path from 'path';
import {content} from "googleapis/build/src/apis/content";

class FeishuController extends AbstractController {
  async routers(router: any): Promise<void> {
    try {
      const db = DB.build(config.pgsql);
      const connectors = await db.list("eiai_bot_connector", {
        where: "provider=$1",
        params: ["feishu"],
        limit: 1000
      });
      for (const connector of connectors) {
        console.log("Feishu bot [" + connector.name + "] connected...");
        const {appId, appSecret, encryptKey} = connector.config;
        const client = new lark.Client({
          appId,
          appSecret
        });

        const params: Record<string, any> = {};
        if (encryptKey) params.encryptKey = encryptKey;
        const eventDispatcher = new lark.EventDispatcher(params).register({
          'im.message.receive_v1': (data: any) => {
            receive(client, data, connector.name);
          },
        });

        router.post(`/bot/feishu/${connector.name}/webhook/event`, lark.adaptKoaRouter(eventDispatcher, {autoChallenge: true}));
        console.log(`Webhook enabled: /bot/feishu/${connector.name}/webhook/event`);
      }
    } catch (ex) {
      console.error(ex);
    }
  }
}

const chatSync = async (client: lark.Client, content: any, session_id: string, lastMessageId: string, connectorName: string): Promise<any> => {
  const db = DB.build(config.pgsql);
  const connector = await db.loadByKV('eiai_bot_connector', 'name', connectorName);
  let chatRequest: ChatRequest = {
    model: connector.config.modelId || "default",
    stream: false,
    messages: [{
      role: "user",
      content: []
    }]
  };

  if (Array.isArray(content.content)) {
    for (const item of content.content) {
      for (const subItem of item) {
        if (subItem.text) {
          chatRequest.messages[0].content.push(handleTextContent(subItem.text));
        }

        if (subItem.image_key) {
          const imageContent = await handleImageContent(client, lastMessageId, subItem.image_key)
          chatRequest.messages[0].content.push(imageContent);
        }
      }

    }
  } else {
    if (content.text) {
      chatRequest.messages[0].content.push(handleTextContent(content.text));
    }

    if (content.image_key) {
      const imageContent = await handleImageContent(client, lastMessageId, content.image_key)
      chatRequest.messages[0].content.push(imageContent);
    }
  }

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
};

const handleTextContent = (content: string) => {
  return {
    type: "text",
    text: content
  };
};


const determineMimeType = (buffer: Buffer): string => {
  const hex = buffer.toString('hex', 0, 4);
  switch (hex) {
    case 'ffd8ffe0':
    case 'ffd8ffe1':
    case 'ffd8ffe2':
      return 'image/jpeg';
    case '89504e47':
      return 'image/png';
    case '47494638':
      return 'image/gif';
    default:
      return 'application/octet-stream'; // Default to binary if unknown
  }
};

const handleImageContent = async (client: lark.Client, messageId: string, image_key: string) => {
  try {
    console.log(`Attempting to retrieve image with key: ${image_key}`);
    const imageData = await client.im.messageResource.get({
        path: {
          message_id: messageId,
          file_key: image_key,
        },
        params: {
          type: 'image',
        },
      }
    );

    // If imageData has a writeFile method, it's likely a Readable stream or similar
    const tempFilePath = path.join(__dirname, `temp_image_${Date.now()}.tmp`);
    await imageData.writeFile(tempFilePath)
    let bufferImageData: Buffer;
    bufferImageData = await fs.promises.readFile(tempFilePath);
    await fs.promises.unlink(tempFilePath); // Clean up temp file
    const base64Image = bufferImageData.toString('base64');

    // Determine MIME type based on file signature
    const mimeType = determineMimeType(bufferImageData);
    return {
      type: "image_url",
      "image_url": {
        url: `data:${mimeType};base64,${base64Image}`
      }
    };
  } catch (err) {
    console.error("Failed to read image file", err);
  }
};

const buildCard = (title: string, content: string): any => {
  return {
    "config": {
      "streaming_mode": true,
      "streaming_config": {
        "print_frequency_ms": {
          "default": 30,
          "android": 25,
          "ios": 40,
          "pc": 50
        },
        "print_step": {
          "default": 2,
          "android": 3,
          "ios": 4,
          "pc": 5
        },
        "print_strategy": "fast",
      },
      "wide_screen_mode": true,
    },
    "header": {
      "title": {
        "tag": "plain_text",
        "content": title
      }
    },
    "elements": [
      {
        "tag": "div",
        "fields": [
          {
            "is_short": false,
            "text": {
              "tag": "lark_md",
              "content": content
            }
          }
        ]
      }
    ]
  };
};

const sendCard = async (client: lark.Client, open_id: string, title: string, content: string): Promise<any> => {
  let card = buildCard(title, content);
  try {
    return await client.im.message.create({
      params: {
        receive_id_type: 'open_id',
      },
      data: {
        receive_id: open_id,
        msg_type: 'interactive',
        content: JSON.stringify(card),
        uuid: helper.generateUUID(),
      }
    });
  } catch (ex) {
    console.error(ex);
    return null;
  }
};

const updateCard = async (client: lark.Client, messageId: string, title: string, content: string): Promise<any> => {
  let card = buildCard(title, content);
  try {
    return await client.im.message.patch({
      path: {
        message_id: messageId
      },
      data: {
        content: JSON.stringify(card)
      }
    });
  } catch (ex) {
    console.error(ex);
    return null;
  }
};

const receive = (client: lark.Client, data: any, connectorName: string): void => {
  const open_id = data.sender.sender_id.open_id;
  const jContent = JSON.parse(data.message.content);
  sendCard(client, open_id, "正在思考中", "……").then(async res => {
    if (res && res.data && res.data.message_id) {
      const messageId: string = res.data.message_id;
      chatSync(client, jContent, data.message.chat_id, data.message.message_id, connectorName).then(async llmRes => {
        if (llmRes && llmRes.choices && llmRes.choices[0] && llmRes.choices[0].message) {
          if (jContent.text) {
            updateCard(client, messageId, jContent.text, llmRes.choices[0].message.content);
          } else {
            updateCard(client, messageId, "以下是回复", llmRes.choices[0].message.content);
          }

        } else {
          updateCard(client, messageId, "发生错误", llmRes.data);
          console.error("Unexpected response format from chatSync:", llmRes);
        }
      });
    } else {
      console.error("Failed to send initial card:", res);
    }
  });
};

export default (router: any) => new FeishuController(router);
