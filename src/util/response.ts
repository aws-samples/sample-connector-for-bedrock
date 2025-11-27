export interface ErrorDetail {
    message: string;
    error_code?: string;
    error_type?: string;
    request_id?: string;
    http_status?: number;
    details?: any;
    stack?: string;
}

/**
 * 从各种错误对象中提取详细信息
 */
export const extractErrorDetails = (error: any, includeStack: boolean = false): ErrorDetail => {
    const result: ErrorDetail = {
        message: error.message || String(error)
    };

    // AWS SDK v3 错误格式
    if (error.$metadata) {
        result.request_id = error.$metadata.requestId;
        result.http_status = error.$metadata.httpStatusCode;
    }

    // AWS 错误代码
    if (error.name) {
        result.error_type = error.name;
    }
    if (error.code) {
        result.error_code = error.code;
    }
    if (error.Code) {
        result.error_code = error.Code;
    }

    // AWS 特定错误字段
    if (error.$fault) {
        result.details = result.details || {};
        result.details.fault = error.$fault;
    }
    if (error.$service) {
        result.details = result.details || {};
        result.details.service = error.$service;
    }

    // 其他可能的错误信息
    if (error.cause) {
        result.details = result.details || {};
        result.details.cause = error.cause.message || String(error.cause);
    }

    // 原始响应体（如果有）
    if (error.body) {
        try {
            const bodyContent = typeof error.body === 'string' ? JSON.parse(error.body) : error.body;
            result.details = result.details || {};
            result.details.response_body = bodyContent;
        } catch {
            result.details = result.details || {};
            result.details.response_body = error.body;
        }
    }

    // 重试后的原始错误信息
    if (error.originalError) {
        result.details = result.details || {};
        result.details.original_error = error.originalError;
    }

    // 堆栈信息（仅在 debug 模式下）
    if (includeStack && error.stack) {
        result.stack = error.stack;
    }

    return result;
};

export default {
    ok: (data: any) => {
        return {
            success: true,
            data
        }
    },
    error: (data: any, errorDetail?: ErrorDetail) => {
        const response: any = {
            success: false,
            data
        };
        if (errorDetail) {
            response.error = errorDetail;
        }
        return response;
    },
    wrap: (id: any, model: any, content?: any, finish_reason?: any, completion_tokens?: number, prompt_tokens?: number, request_id?: string) => {
        const created = Math.floor((new Date().getTime()) / 1000);
        completion_tokens = completion_tokens || 0;
        prompt_tokens = prompt_tokens || 0;
        content = content || "";
        const data: any = {
            id: "chatcmpl-" + (request_id || "tempid"),
            created,
            // "object": "chat.completion.chunk",
            "object": "chat.completion.chunk"
            // system_fingerprint: null
            // finish_reason: null,
            // usage: {
            //     completion_tokens,
            //     prompt_tokens,
            //     total_tokens: completion_tokens + prompt_tokens
            // }
        };



        if (finish_reason) {
            data.choices = [
                { "index": 0, delta: {}, finish_reason, logprobs: null }
            ];
        } else {
            if (id == 0) {
                data.choices = [
                    { "index": 0, delta: { role: "assistant", content }, finish_reason, logprobs: null }
                ];

            } else {
                data.choices = [
                    { "index": 0, delta: { content }, finish_reason, logprobs: null }
                ];
            }
        }
        if (completion_tokens > 0) {
            data.usage = {
                completion_tokens,
                prompt_tokens,
                total_tokens: completion_tokens + prompt_tokens
            }
        }

        if (model) {
            data.model = model;
        }

        // console.log(JSON.stringify(data));

        return JSON.stringify(data);
    },
    wrap2: (id: any, model: any, content?: any, finish_reason?: any, completion_tokens?: number, prompt_tokens?: number) => {
        // const created = new Date().getTime();
        completion_tokens = completion_tokens || 0;
        prompt_tokens = prompt_tokens || 0;
        content = content || "";
        const data: any = {
            // id, created,
            // "object": "chat.completion.chunk",
            // usage: {
            //     completion_tokens,
            //     prompt_tokens,
            //     total_tokens: completion_tokens + prompt_tokens
            // }
        };



        data.choices = [
            { "index": 0, text: content, finish_reason: finish_reason || null }
        ];

        if (model) {
            data.model = model;
        }


        return JSON.stringify(data);
    },

    wrapReasoning: (id: any, model: any, reasoning_content?: any, request_id?: string) => {
        const created = Math.floor((new Date().getTime()) / 1000);
        const data: any = {
            id: "chatcmpl-" + (request_id || "tempid"),
            created,
            "object": "chat.completion.chunk"
        };


        reasoning_content = reasoning_content || "";
        data.choices = [
            { "index": 0, delta: { role: "assistant", content: "", reasoning_content }, finish_reason: null, logprobs: null }
        ];

        if (model) {
            data.model = model;
        }

        // console.log(JSON.stringify(data));

        return JSON.stringify(data);
    },

    wrapToolUse: (id: any, model: any, tool_calls?: any, request_id?: string) => {
        const created = Math.floor((new Date().getTime()) / 1000);
        const data: any = {
            id: "chatcmpl-" + (request_id || "tempid"),
            created,
            "object": "chat.completion.chunk"
        };

        data.choices = [
            { "index": 0, delta: { role: "assistant", tool_calls }, finish_reason: null, logprobs: null }
        ];

        if (model) {
            data.model = model;
        }

        // console.log(JSON.stringify(data));

        return JSON.stringify(data);
    },
}


/*

{"id":"chatcmpl-123","object":"chat.completion.chunk","created":1694268190,"model":"gpt-3.5-turbo-0125", "system_fingerprint": "fp_44709d6fcb", "choices":[{"index":0,"delta":{"role":"assistant","content":""},"logprobs":null,"finish_reason":null}]}

{"id":"chatcmpl-123","object":"chat.completion.chunk","created":1694268190,"model":"gpt-3.5-turbo-0125", "system_fingerprint": "fp_44709d6fcb", "choices":[{"index":0,"delta":{"content":"Hello"},"logprobs":null,"finish_reason":null}]}

....

{"id":"chatcmpl-123","object":"chat.completion.chunk","created":1694268190,"model":"gpt-3.5-turbo-0125", "system_fingerprint": "fp_44709d6fcb", "choices":[{"index":0,"delta":{},"logprobs":null,"finish_reason":"stop"}]}

*/