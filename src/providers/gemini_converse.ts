// genai_compatible.ts
import { GoogleGenerativeAI } from "@google/generative-ai";
import { ChatRequest, ResponseData } from "../entity/chat_request";
import AbstractProvider from "./abstract_provider";

export default class GeminiConverse extends AbstractProvider {
  private genAI: GoogleGenerativeAI;

  constructor() {
    super();
  }

  private ensureClient() {
    const { apiKey } = this.modelData.config;
    if (!apiKey) throw new Error("Missing 'apiKey' in backend model configuration.");

    if (!this.genAI) {
      this.genAI = new GoogleGenerativeAI(apiKey);
    }
  }

  async chat(chatRequest: ChatRequest, session_id: string, ctx: any) {
    this.ensureClient();
    const modelId = chatRequest.model_id || this.modelData.config.model || "gemini-pro";

    if (chatRequest.stream) {
      ctx.set({
        'Connection': 'keep-alive',
        'Cache-Control': 'no-cache',
        'Content-Type': 'text/event-stream',
      });
      await this.chatStream(ctx, chatRequest, session_id, modelId);
    } else {
      ctx.set({ 'Content-Type': 'application/json' });
      ctx.body = await this.chatSync(ctx, chatRequest, session_id, modelId);
    }
  }

  private convertMessagesToGeminiFormat(messages: any[]): string {
    // Convert OpenAI-style messages to a single prompt for Gemini
    let prompt = "";

    for (const message of messages) {
      if (message.role === "system") {
        prompt += `System: ${message.content}\n\n`;
      } else if (message.role === "user") {
        if (typeof message.content === "string") {
          prompt += `User: ${message.content}\n\n`;
        } else if (Array.isArray(message.content)) {
          // Handle multi-modal content
          for (const content of message.content) {
            if (content.type === "text") {
              prompt += `User: ${content.text}\n\n`;
            }
            // Note: Image handling would need additional implementation
          }
        }
      } else if (message.role === "assistant") {
        prompt += `Assistant: ${message.content}\n\n`;
      }
    }

    return prompt.trim();
  }

  private async chatStream(
    ctx: any,
    chatRequest: ChatRequest,
    session_id: string,
    modelId: string
  ) {
    const model = this.genAI.getGenerativeModel({
      model: modelId,
      generationConfig: {
        temperature: chatRequest.temperature ?? 1.0,
        topP: chatRequest.top_p ?? 1.0,
        maxOutputTokens: chatRequest.max_tokens,
      },
    });

    const prompt = this.convertMessagesToGeminiFormat(chatRequest.messages || []);

    try {
      const result = await model.generateContentStream(prompt);
      let responseText = "";
      let chunkIndex = 0;

      for await (const chunk of result.stream) {
        const chunkText = chunk.text();
        responseText += chunkText;

        // Format as OpenAI-compatible streaming response
        const streamChunk = {
          id: `chatcmpl-${Date.now()}`,
          object: "chat.completion.chunk",
          created: Math.floor(Date.now() / 1000),
          model: modelId,
          choices: [{
            index: 0,
            delta: {
              content: chunkText
            },
            finish_reason: null
          }]
        };

        ctx.res.write(`data: ${JSON.stringify(streamChunk)}\n\n`);
        chunkIndex++;
      }

      // Send final chunk
      const finalChunk = {
        id: `chatcmpl-${Date.now()}`,
        object: "chat.completion.chunk",
        created: Math.floor(Date.now() / 1000),
        model: modelId,
        choices: [{
          index: 0,
          delta: {},
          finish_reason: "stop"
        }]
      };

      ctx.res.write(`data: ${JSON.stringify(finalChunk)}\n\n`);
      ctx.res.write('data: [DONE]\n\n');

      // Save the conversation
      const response: ResponseData = {
        text: responseText,
        input_tokens: await this.estimateTokens(prompt),
        output_tokens: await this.estimateTokens(responseText),
      };
      await this.saveThread(ctx, session_id, chatRequest, response);

    } catch (error) {
      console.error('Gemini streaming error:', error);
      ctx.res.write(`data: ${JSON.stringify({ error: error['message']||error })}\n\n`);
    }

    ctx.res.end();
  }

  private async chatSync(
    ctx: any,
    chatRequest: ChatRequest,
    session_id: string,
    modelId: string
  ) {
    const model = this.genAI.getGenerativeModel({
      model: modelId,
      generationConfig: {
        temperature: chatRequest.temperature ?? 1.0,
        topP: chatRequest.top_p ?? 1.0,
        maxOutputTokens: chatRequest.max_tokens,
      },
    });

    const prompt = this.convertMessagesToGeminiFormat(chatRequest.messages || []);

    try {
      const result = await model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();

      const responseData: ResponseData = {
        text: text,
        input_tokens: await this.estimateTokens(prompt),
        output_tokens: await this.estimateTokens(text),
      };

      await this.saveThread(ctx, session_id, chatRequest, responseData);

      // Return OpenAI-compatible response
      return {
        id: `chatcmpl-${Date.now()}`,
        object: "chat.completion",
        created: Math.floor(Date.now() / 1000),
        model: modelId,
        choices: [{
          index: 0,
          message: {
            role: "assistant",
            content: text
          },
          finish_reason: "stop"
        }],
        usage: {
          prompt_tokens: responseData.input_tokens,
          completion_tokens: responseData.output_tokens,
          total_tokens: responseData.input_tokens + responseData.output_tokens
        }
      };

    } catch (error) {
      console.error('Gemini sync error:', error);
      throw error;
    }
  }

  private async estimateTokens(text: string): Promise<number> {
    // Simple token estimation - roughly 4 characters per token
    return Math.ceil(text.length / 4);
  }
}
