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
    wrap: (id: any, model: any, content?: any, finish_reason?: any, completion_tokens?: number, prompt_tokens?: number) => {
        const created = new Date().getTime();
        completion_tokens = completion_tokens || 0;
        prompt_tokens = prompt_tokens || 0;
        content = content || "";
        const data: any = {
            id, created,
            // "object": "chat.completion.chunk",
            // usage: {
            //     completion_tokens,
            //     prompt_tokens,
            //     total_tokens: completion_tokens + prompt_tokens
            // }
        };



        data.choices = [
            { "index": 0, delta: { content } }
        ];

        if (model) {
            data.model = model;
        }

        if (finish_reason) {
            data.finish_reason = finish_reason;
        }
        // console.log(JSON.stringify(data));

        return JSON.stringify(data);
    }
}


/*

{"id":"chatcmpl-123","object":"chat.completion.chunk","created":1694268190,"model":"gpt-3.5-turbo-0125", "system_fingerprint": "fp_44709d6fcb", "choices":[{"index":0,"delta":{"role":"assistant","content":""},"logprobs":null,"finish_reason":null}]}

{"id":"chatcmpl-123","object":"chat.completion.chunk","created":1694268190,"model":"gpt-3.5-turbo-0125", "system_fingerprint": "fp_44709d6fcb", "choices":[{"index":0,"delta":{"content":"Hello"},"logprobs":null,"finish_reason":null}]}

....

{"id":"chatcmpl-123","object":"chat.completion.chunk","created":1694268190,"model":"gpt-3.5-turbo-0125", "system_fingerprint": "fp_44709d6fcb", "choices":[{"index":0,"delta":{},"logprobs":null,"finish_reason":"stop"}]}

*/