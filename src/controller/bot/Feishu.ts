import * as lark from '@larksuiteoapi/node-sdk';
import Cache from '../../util/cache';
import helper from "../../util/helper";
import {ChatRequest} from "../../entity/chat_request";
import AbstractController from "../AbstractController";
import * as fs from 'fs/promises';
import * as path from 'path';


const WAITING_TITLE = '正在思考中';
const ERROR_TITLE = '发生错误';
const ONE_HOUR = 60 * 60 * 1000;

class FeishuController extends AbstractController {
  async routers(router: any): Promise<void> {
    try {
      // Use more specific type instead of 'any' for better type safety
      const feishuConnectors = Cache.connectors.filter(({provider}) => provider === "feishu");

      // Process connectors in parallel for better performance
      await Promise.all(feishuConnectors.map(async (connector) => {
        const {name, config: {appId, appSecret, encryptKey}} = connector;

        console.log(`Feishu bot [${name}] connected...`);
        const baseConfig = {
          appId: process.env.FEISHU_APP_ID || appId,
          appSecret: process.env.FEISHU_APP_SECRET || appSecret
        };
        const wsClient = new lark.WSClient(baseConfig);
        const client = new lark.Client(baseConfig);

        const params: Record<string, string> = encryptKey ? {encryptKey} : {};

        // Create event dispatcher with proper error handling
        const eventDispatcher = new lark.EventDispatcher({}).register({
          'im.message.receive_v1': async (data) => {
            try {
              await receive(client, data, name);
            } catch (error) {
              console.error(`Error processing message for ${name}:`, error);
            }
          },
        });

        wsClient.start({eventDispatcher});
      }));

    } catch (error) {
      console.error('Error in FeishuController routers:', error);
      throw error; // Re-throw to allow proper error handling upstream
    }
  }
}


const chat = async (client: lark.Client,
                    chatId: string,
                    content: any,
                    session_id: string,
                    lastMessageId: string,
                    connectorName: string): Promise<any> => {
  const connector = Cache.connectors.find(e => e.name === connectorName);

  let chatRequest: ChatRequest = {
    model: connector.config.modelId || "default",
    stream: true,
    messages: []
  };

  const historyMessages = await getHistoryMessage(client, chatId, (Date.now() - ONE_HOUR) / 1000);
  let hasDoc = !!content.file_key;
  let hasImage = !!content.image_key;
  let fileContent: { type: string; doc: { name: any; format: string; size: number; source: { bytes: Uint8Array; }; }; };
  let imageContent;
  // 如果当前消息不是上传文件，则在历史信息里找到最近的一个图片或者文件，进行加载
  if (!hasDoc && !hasImage) {
    for (const msg of historyMessages) {
      const parsedContent = JSON.parse(msg.body.content)

      if (msg.msg_type === 'image') {
        hasImage = true
        imageContent = await handleImageContent(client, msg.message_id, parsedContent.image_key);
        break;
      }

      if (!hasDoc) {
        if (msg.msg_type === 'file') {
          hasDoc = true;
          fileContent = await handleFileContent(client, msg.message_id, parsedContent)
          break;
        }
      }
    }
  }
  for (const msg of historyMessages.reverse()) {
    const parsedContent = JSON.parse(msg.body.content)
    if (msg.msg_type === 'interactive') {
      if (parsedContent.title == WAITING_TITLE || parsedContent.title == ERROR_TITLE) {
        continue;
      }
      if (parsedContent.elements) {
        if (parsedContent.elements[0][0].text.trim().length > 0) {
          chatRequest.messages.push(buildContent(MessageRole.ASSISTANT, [handleTextContent(parsedContent.elements[0][0].text)]))
        }
      } else {
        if (parsedContent.text.trim().length > 0) {
          chatRequest.messages.push(buildContent(MessageRole.ASSISTANT, [handleTextContent(parsedContent.text)]))
        }
      }
    }

    if (msg.msg_type === 'text') {
      chatRequest.messages.push(buildContent(MessageRole.USER, [handleTextContent(parsedContent.text)]))
    }
  }

  let newMsg = buildContent(MessageRole.USER, []);
  if (Array.isArray(content.content)) {
    for (const item of content.content) {
      for (const subItem of item) {
        if (subItem.text) {
          newMsg.content.push(handleTextContent(subItem.text));
        }
        if (subItem.image_key) {
          imageContent = await handleImageContent(client, lastMessageId, subItem.image_key);
          hasImage = true;
        }
        if (subItem.file_key) {
          fileContent = await handleFileContent(client, lastMessageId, subItem);
          hasDoc = true;
        }
      }
    }
  } else {
    if (content.text) {
      newMsg.content.push(handleTextContent(content.text));
    }
    if (content.image_key) {
      imageContent = await handleImageContent(client, lastMessageId, content.image_key);
      hasImage = true;
    }
    if (content.file_key) {
      fileContent = await handleFileContent(client, lastMessageId, content);
      hasDoc = true;
    }
  }

  if (hasDoc) {
    newMsg.content.push(fileContent);
    if (newMsg.content.length == 1) {
      newMsg.content.push(handleTextContent('<tasks>1.简要概括这个文档内容，限制20个字内。2.等待进一步提问。</tasks><ouput>这个文件主要内容包括：……\n请您进一步提问</ouput>'));
    }
  }

  if (hasImage) {
    newMsg.content.push(imageContent);
    if (newMsg.content.length == 1) {
      newMsg.content.push(handleTextContent('<tasks>1.简要描述这个图片内容，限制20个字内。2.等待进一步提问。</tasks><ouput>这个文件主要内容包括：……\n请您进一步提问</ouput>'));
    }
  }

  if (newMsg.content.length > 0) {
    chatRequest.messages.push(newMsg);
  }
  return await fetch("http://localhost:8866/v1/chat/completions", {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + connector.config.apiKey,
      'Session-Id': session_id
    },
    body: JSON.stringify(chatRequest)
  });
};

enum MessageRole {
  USER = "user",
  ASSISTANT = "assistant",
  SYSTEM = "system"
}

const buildContent = (role: MessageRole, content: any) => {
  if (role === MessageRole.ASSISTANT) {
    return {
      role: "assistant",
      content: content
    };
  } else if (role === MessageRole.SYSTEM) {
    return {
      role: "system",
      content: content
    };
  } else {
    return {
      role: "user",
      content: content
    };
  }
};

const handleTextContent = (content: string) => {
  return {
    type: "text",
    text: content
  };
};

const getHistoryMessage = async (client: lark.Client, containerId: string, startTime: number, limit: number = 20) => {
  let historyMessages = await client.im.message.list({
      params: {
        container_id_type: 'chat',
        container_id: containerId,
        start_time: startTime.toFixed(0).toString(),
        page_size: limit,
        sort_type: 'ByCreateTimeDesc',
      },
    }
  )

  return historyMessages.data.items;
}

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


const handleFileContent = async (client: lark.Client, messageId: string, fileContent: any) => {
  try {
    const fileData = await client.im.messageResource.get({
        path: {
          message_id: messageId,
          file_key: fileContent.file_key,
        },
        params: {
          type: 'file',
        },
      }
    );
    // If fileData has a writeFile method, it's likely a Readable stream or similar
    let {name, ext} = path.parse(fileContent.file_name);
    ext = ext.substring(1);
    const tempFilePath = path.join(__dirname, `${name}_${Date.now()}.${ext}`);
    await fileData.writeFile(tempFilePath)
    const bufferFileData = await fs.readFile(tempFilePath);
    await fs.unlink(tempFilePath); // Clean up temp file
    return {
      type: 'doc',
      doc: {
        name: fileContent.file_key,
        format: ext,
        size: bufferFileData.length,
        source: {
          bytes: Uint8Array.from(bufferFileData)
        }
      }
    };
  } catch (err) {
    console.error("Failed to read file", err);
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
    bufferImageData = await fs.readFile(tempFilePath);
    await fs.unlink(tempFilePath); // Clean up temp file
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
  sendCard(client, open_id, WAITING_TITLE, "……").then(async res => {
    if (res && res.data && res.data.message_id) {
      const messageId: string = res.data.message_id;
      const chatRes = await chat(client, data.message.chat_id, jContent, data.message.chat_id, data.message.message_id, connectorName);
      if (!chatRes.ok) {
        const errMsg = await chatRes.text();
        await updateCard(client, messageId, "发生错误", errMsg);
        console.error(await errMsg);
        return;
      }

      let done: any, value: any;
      const reader = chatRes.body.getReader();
      let resContent = '';
      while (!done) {
        ({value, done} = await reader.read());
        if (value) {
          const vString = new TextDecoder().decode(value);
          for (const item of vString.split('data:')) {
            if (item.trim().length == 0) continue;
            const parseString = item.substring(item.indexOf('{'), item.lastIndexOf('}') + 1);
            if (item.indexOf("[DONE]") < 0) {
              const vJson = JSON.parse(parseString)
              resContent += vJson.choices?.[0]?.delta?.content ?? '';
            } else {
              console.log(parseString);
            }
          }

          const cardTitle: string = jContent.text || "以下是回复";
          await updateCard(client, messageId, cardTitle, resContent);
        }
      }
    } else {
      console.error("Failed to send initial card:", res);
    }
  });
}

export default (router: any) => new FeishuController(router);
