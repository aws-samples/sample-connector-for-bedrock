export default {
    ok: (data: any) => {
        return {
            success: true,
            data
        }
    },
    error: (data: any) => {
        return {
            success: false,
            data
        }
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