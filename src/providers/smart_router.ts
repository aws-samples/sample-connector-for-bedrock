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
    // console.log(chatRequest)
    const toolRes = await this.toToolUse(chatRequest, session_id, ctx);

    console.log("toole", toolRes)


    // if (chatRequest.stream) {



    //   ctx.set({
    //     'Connection': 'keep-alive',
    //     'Cache-Control': 'no-cache',
    //     'Content-Type': 'text/event-stream',
    //   });
    //   ctx.res.write("data:" + WebResponse.wrap(0, null, content || "No content found in the prompt.", null) + "\n\n");
    //   prompt && ctx.res.write("data:" + WebResponse.wrap(0, null, "\n\nPrompt:\n\n```" + prompt + "```", null) + "\n\n");
    //   prompt && ctx.res.write("data:" + WebResponse.wrap(0, null, "\n\nNegative prompt:\n\n ```" + negative_prompt + "```", null) + "\n\n");

    //   const responseImage = await this.draw(paintModelId, {
    //     prompt,
    //     negative_prompt,
    //     width,
    //     height
    //   });
    //   ctx.res.write("data:" + WebResponse.wrap(0, "painter", `\n\n${responseImage}`, null) + "\n\n");
    //   ctx.res.write("data: [DONE]\n\n")
    // } else {
    //   ctx.set({
    //     'Content-Type': 'application/json',
    //   });
    //   ctx.body = await this.chatSync(ctx, chatRequest, session_id);
    // }
  }


  async toToolUse(chatRequest: ChatRequest, session_id: string, ctx: any) {
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

    const lastQ = chatRequest.messages[chatRequest.messages.length - 1];

    const kRequest = {
      model: chatRequest.model,
      messages: [
        {
          role: "user", content: `现在有如下的路由规则：

          ${JSON.stringify(this.modelData.config.rules, null, 2)}

          用户的问题是：${lastQ.content}
          
          请根据路由规则判断用户的意图，为了节约 token，请给出最简短的回答，不要分析过程，不要引导词，只要在 tool use 里给出结果即可。

          如果用户没有明确的意图，请直接返回 default 这个单词作为模型的名字。
          `}
      ],
      tools,
      tool_choice: "auto"
    }

    // console.log(JSON.stringify(kRequest, null, 2));

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