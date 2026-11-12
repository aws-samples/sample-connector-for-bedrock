import crypto from "crypto";
import { ChatRequest } from "../entity/chat_request";
import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";
import { S3Client } from "@aws-sdk/client-s3";
import WebResponse from "../util/response";
import AbstractProvider from "./abstract_provider";
import logger from "../util/logger";
import { selfBaseUrl } from "../util/self";
import { PictureBook, S3PictureStore, chatCopy, collectPictures, fitForStability } from "./painter_pictures";
import {
  PAINT_TOOLS, PaintStepError, accessDeniedMessage, chatTools, finishReasonMessage, imagePrice, invokeRegion, parseToolArgs,
} from "./painter_tools";

const MAX_STEPS = 5;
const KEEP_ALIVE_MS = 15_000;
const regionsIgnoredLogged = new Set<string>();

type ToolCall = { id: string; type: "function"; function: { name: string; arguments: string } };
type Message = NonNullable<ChatRequest["messages"]>[number];
type PaintConfig = { paintModelId: string; localLlmModel: string; store: S3PictureStore };
type MadePicture = { name: string; bytes: Buffer; price: number };

const clientGone = (ctx: any) => !!(ctx.res.destroyed || ctx.res.writableEnded);

// CloudFront closes an origin connection that is silent for 30 seconds. The keep-alive is a normal chunk with
// empty content, so clients that parse every data line accept it.
async function withKeepAlive<T>(ctx: any, reqId: string, work: Promise<T>): Promise<T> {
  const timer = setInterval(() => {
    if (!clientGone(ctx)) ctx.res.write("data: " + WebResponse.wrap(0, null, "", null, null, null, reqId) + "\n\n");
  }, KEEP_ALIVE_MS);
  try {
    return await work;
  } finally {
    clearInterval(timer);
  }
}

function systemPrompt(book: PictureBook): string {
  return [
    "You plan the work of an AI painter. You can see the user's pictures. Each picture is named like [image_1], and every tool argument that takes a picture takes that name, for example image_1.",
    `Pictures available now:\n${book.describe()}`,
    "Pick the tool that fits what the user asks. A request can need several steps. Call a tool, look at the newest picture it made, and call the next tool when the request needs it.",
    "Write every prompt in English. Negative prompts always include nsfw.",
    "Before you call a tool, say in one short sentence, in the user's language, what you are about to do. When the request is done, stop calling tools and reply briefly in the user's language.",
  ].join("\n\n");
}

export default class Painter extends AbstractProvider {
  constructor() {
    super();
  }

  async chat(chatRequest: ChatRequest, session_id: string, ctx: any) {
    let { paintModelId, localLlmModel, s3Bucket, s3Region, s3Prefix } = this.modelData.config;

    if (!localLlmModel) {
      throw new Error("You must specify the parameter 'localLlmModel'.")
    }
    if (!paintModelId) {
      throw new Error("You must specify the parameter 'paintModelId'.")
    }
    if (!s3Bucket) {
      throw new Error("You must specify the parameter 's3Bucket'.")
    }
    if (!s3Region) {
      throw new Error("You must specify the parameter 's3Region'.")
    }
    if (!s3Prefix) {
      s3Prefix = "";
    }
    if (s3Prefix.endsWith("/")) {
      s3Prefix = s3Prefix.slice(0, -1);
    }

    if (this.modelData.config.regions && !regionsIgnoredLogged.has(this.modelData.name)) {
      regionsIgnoredLogged.add(this.modelData.name);
      logger.warn(`The 'regions' setting of model ${this.modelData.name} is ignored by painter.`);
    }

    chatRequest.model = localLlmModel;
    ctx.status = 200;

    if (chatRequest.stream) {
      const store = new S3PictureStore(new S3Client({ region: s3Region }), s3Bucket, s3Region, s3Prefix);
      await this.chatStream(chatRequest, session_id, ctx, { paintModelId, localLlmModel, store });
    } else {
      ctx.set({
        'Content-Type': 'application/json',
      });
      ctx.body = await this.chatSync(ctx, chatRequest, session_id);
    }
  }

  async chatSync(ctx: any, chatRequest: ChatRequest, session_id: string) {

    const response = await fetch(`${selfBaseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + ctx.user.api_key,
        'Session-Id': session_id
      },
      body: JSON.stringify(chatRequest)
    });

    return await response.json();
  }

  private async chatStream(chatRequest: ChatRequest, session_id: string, ctx: any, config: PaintConfig) {
    const reqId = this.newRequestID();
    const streamed: string[] = [];
    let recorded = 0;
    let stepsRun = 0;
    let threadMessages: Message[] = chatRequest.messages;

    const emit = (text: string) => {
      streamed.push(text);
      ctx.res.write("data: " + WebResponse.wrap(0, null, text, null, null, null, reqId) + "\n\n");
    };
    // One thread record per picture, so a request cut short still charges the pictures it streamed.
    const record = async (price: number) => {
      const text = streamed.slice(recorded).join("");
      recorded = streamed.length;
      try {
        await this.saveThread(
          ctx, session_id, { ...chatRequest, messages: [...threadMessages] },
          { text, input_tokens: 0, output_tokens: 0, image_prices: [price] },
        );
      } catch (e: any) {
        logger.error(e?.message || String(e));
      }
    };
    const clients = new Map<string, BedrockRuntimeClient>();
    const clientOf = (region: string) => {
      if (!clients.has(region)) clients.set(region, new BedrockRuntimeClient({ region }));
      return clients.get(region)!;
    };

    ctx.set({
      'Connection': 'keep-alive',
      'Cache-Control': 'no-cache',
      'Content-Type': 'text/event-stream',
    });

    try {
      const collected = await collectPictures(chatRequest.messages, config.store);
      if ("refusal" in collected) {
        emit(collected.refusal);
        return;
      }
      const { book, chatMessages } = collected;
      threadMessages = collected.threadMessages;

      const loopMessages: Message[] = [];
      let newestPicture: Message | undefined;

      while (!clientGone(ctx)) {
        const { text, toolCalls } = await this.askChatModel(
          ctx, reqId, session_id, config.localLlmModel,
          [{ role: "system", content: systemPrompt(book) }, ...chatMessages, ...loopMessages],
        );
        if (text) emit(text);
        if (!toolCalls.length) return;

        const made: MadePicture[] = [];
        for (const call of toolCalls) {
          if (stepsRun >= MAX_STEPS) {
            emit(`\n\nReached the limit of ${MAX_STEPS} picture steps for one request. The pictures above are kept.`);
            return;
          }
          if (clientGone(ctx)) return;
          stepsRun += 1;
          const picture = await this.runStep(call, stepsRun, { ctx, reqId, config, book, clientOf, emit });
          made.push(picture);
          await record(picture.price);
        }

        loopMessages.push(
          { role: "assistant", content: text || null, tool_calls: toolCalls },
          ...toolCalls.map((call, i): Message => ({
            role: "tool",
            tool_call_id: call.id,
            content: `${made[i].name} is ready`,
          })),
        );
        if (newestPicture) {
          newestPicture.content = newestPicture.content.filter((part: any) => part.type !== "image_url");
        }
        const latest = made[made.length - 1];
        newestPicture = {
          role: "user",
          content: [{ type: "text", text: `[${latest.name}]` }, { type: "image_url", image_url: { url: await chatCopy(latest.bytes) } }],
        };
        loopMessages.push(newestPicture);
      }
    } catch (e: any) {
      const message = e?.message || String(e);
      if (!(e instanceof PaintStepError)) logger.error(message);
      emit(`\n\n> Error: ${message}`);
    } finally {
      ctx.res.write("data: [DONE]\n\n");
    }
  }

  // Some providers return the text and the tool calls in separate choices, so every choice is merged.
  private async askChatModel(ctx: any, reqId: string, session_id: string, model: string, messages: Message[]) {
    const body = { model, messages, tools: chatTools(), tool_choice: "auto" };
    const jRes: any = await withKeepAlive(ctx, reqId, (async () => {
      const response = await fetch(`${selfBaseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + ctx.user.api_key,
          'Session-Id': session_id
        },
        body: JSON.stringify(body)
      });
      if (!response.ok) {
        throw new Error(await response.text());
      }
      return await response.json();
    })());
    if ("success" in jRes && jRes.success === false) {
      throw new Error(jRes.data);
    }

    let text = "";
    const toolCalls: ToolCall[] = [];
    for (const choice of jRes.choices ?? []) {
      const message = choice?.message;
      if (typeof message?.content === "string") text += message.content;
      for (const call of message?.tool_calls ?? []) {
        toolCalls.push({
          id: call.id || `call_${crypto.randomUUID()}`,
          type: "function",
          function: { name: call.function?.name, arguments: call.function?.arguments ?? "" },
        });
      }
    }
    return { text, toolCalls };
  }

  private async runStep(
    call: ToolCall,
    n: number,
    run: {
      ctx: any; reqId: string; config: PaintConfig; book: PictureBook;
      clientOf: (region: string) => BedrockRuntimeClient; emit: (text: string) => void;
    },
  ): Promise<MadePicture> {
    const { ctx, reqId, config, book, clientOf, emit } = run;
    const tool = Object.prototype.hasOwnProperty.call(PAINT_TOOLS, call.function.name) ? PAINT_TOOLS[call.function.name as keyof typeof PAINT_TOOLS] : undefined;
    if (!tool) throw new PaintStepError(`The chat model asked for an unknown tool, ${call.function.name}.`);

    const args = parseToolArgs(tool, call.function.arguments);
    const modelId = tool.modelId(config.paintModelId);
    const region = invokeRegion(modelId, process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION);
    const inputs = tool.pictures.map(({ arg }) => String(args[arg]));
    emit(`\n\n> Step ${n}: ${tool.name} with \`${modelId}\`, from ${inputs.length ? inputs.join(", ") : "text only"}\n\n`);

    const pictures: Record<string, string> = {};
    for (const [i, { field }] of tool.pictures.entries()) {
      const s3Url = await book.resolve(inputs[i]);
      pictures[field] = await fitForStability(inputs[i], await config.store.get(s3Url));
    }

    let parsed: any;
    try {
      const response = await withKeepAlive(ctx, reqId, clientOf(region).send(new InvokeModelCommand({
        body: JSON.stringify(tool.body(args, pictures, modelId)),
        contentType: "application/json",
        accept: "application/json",
        modelId,
      })));
      parsed = JSON.parse(new TextDecoder().decode(response.body));
    } catch (e: any) {
      if (e?.name === "AccessDeniedException") {
        logger.error({ message: "painter was denied access to the image model", modelId, region, name: e.name, error: e.message, requestId: e.$metadata?.requestId });
        throw new PaintStepError(accessDeniedMessage(modelId, region, e.message));
      }
      throw e;
    }

    const reason = parsed.finish_reasons?.[0];
    if (reason !== null && reason !== undefined) throw new PaintStepError(finishReasonMessage(reason));
    const base64 = parsed.images?.[0];
    if (!base64) throw new PaintStepError("The image model returned no picture.");

    const priced = imagePrice(this.modelData.config, modelId);
    if (priced.source === "none") logger.warn(`No price for image model ${modelId}; the picture is recorded at 0.`);

    const bytes = Buffer.from(base64.replace(/^data:image\/\w+;base64,/, ""), "base64");
    const s3Url = await config.store.put(bytes, tool.outputFormat, "generated");
    const name = book.add("generated", s3Url);
    emit(`![${name}](${await config.store.presign(s3Url)})\n\n`);
    return { name, bytes, price: priced.price };
  }
}
