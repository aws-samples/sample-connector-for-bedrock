interface Content {
    type: string;
    text?: string;
    image_url?: any;
    source?: any;
}

interface Message {
    role: string;
    content: any;
    tool_calls?: any[];
    tool_call_id?: string;  // 用于 tool 角色的消息，标识对应的 tool call
}

interface ChatRequest {
    model: string;
    messages?: Message[];
    stream?: boolean;
    max_tokens?: number;
    max_completion_tokens?: number;
    temperature?: number;
    top_p?: number;
    [key: string]: any; // refined parameters
}

interface EmbeddingRequest {
    model: string;
    input: any;
    encoding_format?: string;
    [key: string]: any;
}

interface ImageRequest {
    model: string;
    prompt: string;
    n?: number;
    size?: '256x256' | '512x512' | '1024x1024' | null;
    [key: string]: any;
}


interface ResponseData {
    text: string;
    input_tokens: number;
    output_tokens: number;
    invocation_latency?: number;
    first_byte_latency?: number;
}

interface ModelData {
    name: string;
    provider: string;
    multiple: number;
    config?: any;
    model_type: number;
    price_in?: number;
    price_out?: number;
    currency?: string;
    [key: string]: any;
}


export { ChatRequest, ResponseData, ModelData, EmbeddingRequest, ImageRequest };
