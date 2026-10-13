import { ChatRequest } from '../../entity/chat_request';

export interface BuiltRequest {
    body: Record<string, any>;
    // True when the client asked for the usage chunk itself. Streams always ask Bedrock for usage
    // so the call can be billed, and the relay hides that chunk from clients that did not ask.
    clientWantsUsage: boolean;
}

// A cross-Region inference profile id is the base model id with one of these prefixes.
const CROSS_REGION_PREFIXES = ['global.', 'us.', 'us-gov.', 'eu.', 'apac.', 'jp.', 'au.', 'in.', 'ca.'];

// Removes one leading cross-Region prefix. Any other id, including an ARN, is returned unchanged.
export function baseModelId(modelId: string): string {
    const prefix = CROSS_REGION_PREFIXES.find((p) => modelId.startsWith(p));
    return prefix ? modelId.slice(prefix.length) : modelId;
}

// BRConnector's own fields never go to Bedrock. service_tier is removed too, so every call runs on
// the Standard tier.
const GATEWAY_FIELDS = ['model_id', 'currency', 'price_in', 'price_out', 'service_tier'];

interface Quirk {
    matches: (baseId: string) => boolean;
    apply: (body: Record<string, any>) => void;
}

// Per-model request differences, matched on the base model id.
const QUIRKS: Quirk[] = [
    {
        // GPT-5.6 and later need max_completion_tokens instead of max_tokens.
        matches: (id) => id.startsWith('openai.gpt-5.6') || id.startsWith('openai.gpt-6'),
        apply: (body) => {
            // null means "not set" in the OpenAI API, so it must not block the move.
            if (body.max_completion_tokens == null && body.max_tokens != null) {
                body.max_completion_tokens = body.max_tokens;
            }
            delete body.max_tokens;
        },
    },
    {
        // K3 accepts only top_p 0.95, while OpenAI clients often send 1.
        matches: (id) => id === 'moonshotai.kimi-k3',
        apply: (body) => {
            delete body.top_p;
        },
    },
];

export function buildRequestBody(chatRequest: ChatRequest, modelId: string): BuiltRequest {
    const body: Record<string, any> = { ...chatRequest };
    for (const field of GATEWAY_FIELDS) {
        delete body[field];
    }
    body.model = modelId;

    let clientWantsUsage = false;
    if (chatRequest.stream) {
        clientWantsUsage = chatRequest.stream_options?.include_usage === true;
        body.stream_options = { ...chatRequest.stream_options, include_usage: true };
    } else {
        delete body.stream_options;
    }

    const baseId = baseModelId(modelId);
    for (const quirk of QUIRKS) {
        if (quirk.matches(baseId)) {
            quirk.apply(body);
        }
    }
    return { body, clientWantsUsage };
}
