import { AzureOpenAI as OpenAI } from 'openai';
import Images from "openai"
import { ChatRequest, ResponseData, ImageRequest } from "../entity/chat_request"
import AbstractProvider from "./abstract_provider";
// import helper from '../util/helper';


// interface ExtendedDelta {
//   content?: string;
//   reasoning_content?: string;
// }

export default class AzureOpenAIImage extends AbstractProvider {
  client: OpenAI;
  constructor() {
    super();
  }

  chat(chatRequest: ChatRequest, session_id: string, ctx: any): void {
    ctx.logger.warn("The 'azure-openai-image' provider does not support chat.");
    ctx.body = "Sorry, this model is only for image generation.";
  };


  async images(imageRequest: ImageRequest, session_id: string, ctx: any) {
    // console.log(this.modelData);
    const { baseURL, apiKey, apiVersion, model } = this.modelData.config;
    if (!baseURL) {
      throw new Error("You must specify the parameters 'baseURL' in the backend model configuration.")
    }
    if (!model) {
      throw new Error("You must specify the parameters 'model' in the backend model configuration.")
    }
    if (!apiKey) {
      throw new Error("You must specify the parameters 'apiKey' in the backend model configuration.")
    }
    if (!apiVersion) {
      throw new Error("You must specify the parameters 'apiVersion' in the backend model configuration.")
    }

    if (!this.client || this.client.baseURL != baseURL) {
      this.client = new OpenAI({
        baseURL,
        apiKey,
        apiVersion
      });
    }

    if (!imageRequest.prompt) {
      throw new Error("prompt is required.")
    }

    imageRequest.n = imageRequest.n || 1;
    // 直接解构需要的字段
    const {
      prompt,
      n,
      quality,
      response_format,
      size,
      style,
      user,
      // 可以添加更多 ImageGenerateParams 支持的字段
      ...rest // rest 包含所有多余的字段，但我们不使用它
    } = imageRequest;

    const imageParam: Images.ImageGenerateParams = {
      ...(prompt !== undefined && { prompt }),
      ...(model !== undefined && { model }),
      ...(n !== undefined && { n }),
      ...(quality !== undefined && { quality }),
      ...(response_format !== undefined && { response_format }),
      ...(size !== undefined && { size }),
      ...(style !== undefined && { style }),
      ...(user !== undefined && { user })
    };

    // const imagePara = imageRequest as Images.ImageGenerateParams;
    // console.log(JSON.stringify(imageParam, null, 2));
    const result = await this.client.images.generate(imageParam);

    ctx.body = result;

  }



}
