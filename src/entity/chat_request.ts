interface Content {
    type: string;
    text?: string;
    image_url?: any;
    source?: any;
}

interface Message {
    role: string;
    content: any;
}

interface ChatRequest {
    model: string;
    messages?: Message[];
    stream?: boolean;
    max_tokens?: number;
    temperature?: number;
    top_p?: number;
    [key: string]: any; // refined parameters
}

// class RequestData {
//   model: string;
//   messages: Message[];
//   stream: boolean;
//   max_tokens: number;

//   constructor(data: RequestData) {
//     this.model = data.model;
//     this.messages = data.messages;
//     this.stream = data.stream;
//     this.max_tokens = data.max_tokens;
//   }
// }

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


export { ChatRequest, ResponseData, ModelData };
