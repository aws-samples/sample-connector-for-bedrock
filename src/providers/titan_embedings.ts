import AbstractProvider from "./abstract_provider";
import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";
import { ChatRequest, EmbeddingRequest, ResponseData } from "../entity/chat_request";
import helper from "../util/helper";

class TitanEmbeddings extends AbstractProvider {
  client: BedrockRuntimeClient;
  modelId: string;
  dimensions: number;
  normalize: boolean;

  constructor() {
    super();
  }

  async init() {
    this.modelId = this.modelData.config && this.modelData.config.modelId;
    if (!this.modelId) {
      throw new Error("You must specify the parameters 'modelId' in the backend model configuration.")
    }
    this.dimensions = this.modelData.config && this.modelData.config.dimensions;

    this.normalize = this.modelData.config && this.modelData.config.normalize;

    let regions: any = this.modelData.config && this.modelData.config.regions;
    const region = helper.selectRandomRegion(regions);
    this.client = new BedrockRuntimeClient({ region });
  }

  async chat(chatRequest: ChatRequest, session_id: string, ctx: any): Promise<void> {
    ctx.logger.warn("The 'titan-embeddings' provider does not support chat.");
    ctx.body = "Sorry, this model is only for embeddings.";
  }

  async embed(embeddingRequest: EmbeddingRequest, session_id: string, ctx: any): Promise<void> {
    await this.init();
    console.log(embeddingRequest);
    try {
      let request: any = {
        inputText: embeddingRequest.input
      };

      if (this.normalize === false) {
        request.normalize = false;
      }
      if (this.dimensions) {
        request.dimensions = this.dimensions;
      }

      const command = new InvokeModelCommand({
        modelId: this.modelId,
        body: JSON.stringify(request)
      });

      const response = await this.client.send(command);
      const responseBody = JSON.parse(new TextDecoder().decode(response.body));

      if (!responseBody.embedding) {
        responseBody.embedding = [];
      }

      // console.log(responseBody);
      const responseData: ResponseData = {
        text: "",
        input_tokens: responseBody.inputTextTokenCount,
        output_tokens: 0,
        invocation_latency: 0
      }

      await this.saveThreadForEmebeddings(ctx, session_id, embeddingRequest, responseData);

      ctx.body = {
        object: "list",
        model: this.modelId,
        data: {
          "object": "embedding",
          embedding: responseBody.embedding,
          index: 0,
        },
        usage: {
          prompt_tokens: responseBody.inputTextTokenCount
        }
      };
    } catch (error) {
      console.error("Error in TitanEmbeddings embed method:", error);
      throw error;
    }
  }
}

export default TitanEmbeddings;
