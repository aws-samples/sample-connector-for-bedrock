import { ChatRequest, ResponseData } from "../entity/chat_request"
import WebResponse from "../util/response";
import AbstractProvider from "./abstract_provider";
import helper from '../util/helper';


export default class SmartRouter extends AbstractProvider {

  constructor() {
    super();
  }

  async chat(chatRequest: ChatRequest, session_id: string, ctx: any,) {
    console.log(this.modelData.config);
    let { localLlmModel, rules } = this.modelData.config;

    if (!localLlmModel) {
      throw new Error("You must specify the parameter 'localLlmModel'.")
    }
    if (!rules) {
      throw new Error("You must specify the parameter 'rules'.")
    }

    if (!Array.isArray(rules) || rules.length < 1) {
      throw new Error("You must specify the rules.")
    }
    chatRequest.model = localLlmModel;
    ctx.status = 200;

    const the_model = await this.chooseModel(chatRequest, session_id, ctx);
    ctx.logger.info(`[smart-router]choosed model: ${the_model}`);

    chatRequest.model = the_model;

    ctx.status = 200;

    if (chatRequest.stream) {
      ctx.set({
        'Connection': 'keep-alive',
        'Cache-Control': 'no-cache',
        'Content-Type': 'text/event-stream',
      });

      await this.localChatStream(ctx, chatRequest, session_id);
    } else {
      ctx.set({
        'Content-Type': 'application/json',
      });
      ctx.body = await this.localChatSync(ctx, chatRequest, session_id);
    }
  }


  async chooseModel(chatRequest: ChatRequest, session_id: string, ctx: any) {
    const tools = [
      {
        type: "function",
        function: {
          name: "chooseModel",
          description: `Choose a model from the instruct.`,
          parameters: {
            type: "object",
            properties: {
              modelId: {
                type: "string",
                description: "Name of the model.",
              }
            },
            required: [
              "model"
            ],
          }
        }
      }
    ];

    const kRequest = {
      model: chatRequest.model,
      messages: chatRequest.messages,
      tools,
      tool_choice: "auto"
    }



    kRequest.messages.push({
      role: "system",
      content: `You are a model router. Based on the following rules, determine the appropriate model for user queries:

${JSON.stringify(this.modelData.config.rules, null, 2)}

Analyze user intent and output only the selected model in toolUse node. Provide shortest possible response without analysis or leading words.
`
    });

    const response = await fetch("http://localhost:8866/v1/chat/completions", {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + ctx.user.api_key,
        'Session-Id': session_id
      },
      body: JSON.stringify(kRequest)
    });
    if (!response.ok)
      throw new Error(await response.text());

    const jRes: any = await response.json();

    if ("success" in jRes && jRes.success === false) {
      throw new Error(jRes.data);
    }
    console.log(JSON.stringify(jRes, null, 2));


    let modelId = "default";
    for (const c of jRes.choices) {
      // if (c.message.content) {
      //   content = c.message.content;
      // }
      if (c.message.tool_calls) {
        for (const tool of c.message.tool_calls) {
          if (tool["function"]["name"] == "chooseModel") {
            modelId = tool["function"]["arguments"]["modelId"];
          }
        }
      }
    }
    return modelId;
  }
}