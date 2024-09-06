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
        const created = Math.floor((new Date().getTime()) / 1000);
        completion_tokens = completion_tokens || 0;
        prompt_tokens = prompt_tokens || 0;
        content = content || "";
        const data: any = {
            id, created,
            "object": "chat.completion.chunk",
            system_fingerprint: null
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
            data.choices = [
                { "index": 0, delta: { content }, finish_reason, logprobs: null }
            ];

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
    }
}


/*

{"id":"chatcmpl-123","object":"chat.completion.chunk","created":1694268190,"model":"gpt-3.5-turbo-0125", "system_fingerprint": "fp_44709d6fcb", "choices":[{"index":0,"delta":{"role":"assistant","content":""},"logprobs":null,"finish_reason":null}]}

{"id":"chatcmpl-123","object":"chat.completion.chunk","created":1694268190,"model":"gpt-3.5-turbo-0125", "system_fingerprint": "fp_44709d6fcb", "choices":[{"index":0,"delta":{"content":"Hello"},"logprobs":null,"finish_reason":null}]}

....

{"id":"chatcmpl-123","object":"chat.completion.chunk","created":1694268190,"model":"gpt-3.5-turbo-0125", "system_fingerprint": "fp_44709d6fcb", "choices":[{"index":0,"delta":{},"logprobs":null,"finish_reason":"stop"}]}

*/