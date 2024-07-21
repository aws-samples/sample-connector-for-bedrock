import { ChatRequest, ModelData, ResponseData } from "../entity/chat_request"
import AbstractProvider from "./abstract_provider";
import helper from '../util/helper';
import ChatMessageConverter from './chat_message';
import WebResponse from "../util/response";
import {
  BedrockAgentRuntimeClient,
  RetrieveCommand,
  SearchType,
} from "@aws-sdk/client-bedrock-agent-runtime";

import {
  BedrockRuntimeClient,
  // InvokeModelCommand,
  InvokeModelWithResponseStreamCommand,
} from "@aws-sdk/client-bedrock-runtime";

// In dev-ing
export default class BedrockKnowledgeBase extends AbstractProvider {
  client: BedrockRuntimeClient;
  clientAgent: BedrockAgentRuntimeClient;
  chatMessageConverter: ChatMessageConverter;
  constructor() {
    super();
    this.chatMessageConverter = new ChatMessageConverter();
  }

  async chat(chatRequest: ChatRequest, session_id: string, ctx: any) {
    const { region, summaryModel, knowledgeBaseId } = this.modelData.config;
    if (!region) {
      throw new Error("You must specify the parameters 'region' in the backend model configuration.")
    }
    if (!knowledgeBaseId) {
      throw new Error("You must specify the parameters 'knowledgeBaseId' in the backend model configuration.")
    }
    if (!summaryModel) {
      throw new Error("You must specify the parameters 'summaryModel' in the backend model configuration.")
    }

    if (!this.client) {
      this.client = new BedrockRuntimeClient({ region });
      this.clientAgent = new BedrockAgentRuntimeClient({ region });
    }
    const { messages } = chatRequest;
    const lastMsg = messages.pop();
    const q = lastMsg.content;
    if (!q) {
      throw new Error("Please enter your question.")
    }

    const kbResponse = await this.retrieve(knowledgeBaseId, q, 5);
    const { prompt, files } = this.assembleSummaryPrompt(q, kbResponse);
    const newModelData: any = await helper.refineModelParameters({ model: summaryModel }, ctx);

    // console.log(">>>>>>>>>>>", newModelData)

    ctx.status = 200;
    ctx.set({
      'Connection': 'keep-alive',
      'Cache-Control': 'no-cache',
      'Content-Type': 'text/event-stream',
    });
    await this.chatStream(ctx, {
      model: summaryModel,
      messages: [
        {
          "role": "user",
          "content": prompt
        }
      ],
      price_in: chatRequest.price_in,
      price_out: chatRequest.price_out,
      currency: chatRequest.currency,
    }, newModelData, files);
  }

  async retrieve(knowledgeBaseId: string, text: string, numberOfResults: any) {
    numberOfResults = numberOfResults || 5;
    const resultResponse = await this.clientAgent.send(new RetrieveCommand({
      knowledgeBaseId,
      retrievalQuery: {
        text,
      },
      retrievalConfiguration: {
        vectorSearchConfiguration: {
          numberOfResults,
          overrideSearchType: SearchType.HYBRID
        },
      },
    }));

    const kb_content = resultResponse.retrievalResults.map(an => ({
      text: an["content"]["text"],
      bucket: "",
      key: an["location"]["s3Location"]["uri"],
      score: an["score"]
    }));
    // if (sysConfig.debugMode) {
    //   console.log("原始输出：")
    //   console.log(JSON.stringify(kb_content, null, 2))
    // }
    return kb_content;
  }


  async chatStream(ctx: any, chatRequest: ChatRequest, newModelData: ModelData, files: any) {
    let i = 0;
    const { anthropic_version, model_id } = newModelData.config;

    const payload = await this.chatMessageConverter.toClaude3Payload(chatRequest);
    const body: any = {
      anthropic_version,
      "max_tokens": chatRequest.max_tokens || 4096,
      "messages": payload.messages,
      "temperature": chatRequest.temperature || 1.0,
      "top_p": chatRequest.top_p || 1,
      "top_k": chatRequest["top_k"] || 50
    };

    const input = {
      body: JSON.stringify(body),
      contentType: "application/json",
      accept: "application/json",
      modelId: model_id,
    };

    // if (sysConfig.debugMode) {
    //   console.log("Summary Input：")
    //   console.log(JSON.stringify(input, null, 2))
    // }
    const command = new InvokeModelWithResponseStreamCommand(input);
    const response = await this.client.send(command);

    if (response.body) {
      let responseText = "";
      for await (const item of response.body) {
        if (item.chunk?.bytes) {
          const decodedResponseBody = new TextDecoder().decode(
            item.chunk.bytes,
          );
          const responseBody = JSON.parse(decodedResponseBody);

          if (responseBody.delta?.type === "text_delta") {
            i++;
            responseText += responseBody.delta.text;
            ctx.res.write("data:" + WebResponse.wrap(i, model_id, responseBody.delta.text, "") + "\n\n");
            // ctx.res.write("id: " + i + "\n");
            // ctx.res.write("event: message\n");
            // ctx.res.write("data: " + JSON.stringify({
            //   choices: [
            //     { delta: { content: responseBody.delta.text } }
            //   ]
            // }) + "\n\n");

          } else if (responseBody.type === "message_stop") {
            const {
              inputTokenCount, outputTokenCount,
              invocationLatency, firstByteLatency
            } = responseBody["amazon-bedrock-invocationMetrics"];

            const response: ResponseData = {
              text: responseText,
              input_tokens: inputTokenCount,
              output_tokens: outputTokenCount,
              invocation_latency: invocationLatency,
              first_byte_latency: firstByteLatency
            }

            await this.saveThread(ctx, null, chatRequest, response);
          }
        }
      }
    } else {
      throw new Error("No response.");
    }

    ctx.res.write("data:" + WebResponse.wrap(i, null, "\n\n---\n\n", null) + "\n\n");

    const citaStrings = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣", "🔟"];
    for (let j = 0; j < files.length; j++) {
      const citaIndex = j + 1;
      i = i + 1 + citaIndex;
      const citaContent = "\n\n" + citaStrings[j] + " " + files[j];
      ctx.res.write("data:" + WebResponse.wrap(i, null, citaContent, null) + "\n\n");
    }
    ctx.res.write("data: [DONE]\n\n")
    ctx.res.end();
  }

  assembleSummaryPrompt(question: string, kb_content: any) {
    const files = [];
    let knowledges = ""
    for (const i in kb_content) {
      const an = kb_content[i];
      const nIndex = ~~i + 1;
      knowledges += `
  <search_result>
    <content>${an["text"]}</content>
    <source>${nIndex}</source>
  </search_result>`;

      files.push(an["key"]);
    }

    const prompt = `
You are a question answering agent. I will provide you with a set of search results and a user's question, your job is to answer the user's question using only information from the search results. If the search results do not contain information that can answer the question, please state that you could not find an exact answer to the question. Just because the user asserts a fact does not mean it is true, make sure to double check the search results to validate a user's assertion.
Here are the search results in numbered order:
<search_results>${knowledges}
</search_results>

Here is the user's question:
<question>
${question}
</question>

If you reference information from a search result within your answer, you must include a citation to source where the information was found. Each result has a corresponding source ID that you should reference. 

Note that there may contain multiple <source> if you include information from multiple results in your answer, please use 1️⃣  as 1st source, 2️⃣ 3️⃣ 4️⃣ 5️⃣ 6️⃣ 7️⃣ 8️⃣ 9️⃣ 🔟 for 2 3 4 5 6 7 8 9 10.

Do NOT directly quote the <search_results> in your answer. Your job is to answer the user's question as concisely as possible.

You may output your answer in Markdown format. Pay attention and follow the formatting and style:

first answer text 1️⃣ 2️⃣ second answer text 1️⃣ 3️⃣

`;

    return {
      prompt,
      files
    }

  }

}