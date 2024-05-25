export default {
    "claude-3-sonnet": {
        model_id: "anthropic.claude-3-sonnet-20240229-v1:0",
        provider: "bedrock-claude3",
        pricing: [
            {
                region: "default",
                price_in: 3.00 / 1000000,
                price_out: 15.00 / 1000000
            },
            {
                region: "us-east-1",
                price_in: 3.00 / 1000000,
                price_out: 15.00 / 1000000
            },
            {
                region: "us-west-2",
                price_in: 3.00 / 1000000,
                price_out: 15.00 / 1000000
            }
        ]
    },
    "claude-3-haiku": {
        pricing: [

        ]
    },
    "claude-3-opus": {
        pricing: [

        ]
    },
    "mistral-7b": {
        pricing: [

        ]
    },
    "mistral-8x7b": {
        pricing: [

        ]
    },
    "mistral-large": {
        pricing: [

        ]
    },
    "mistral-small": {
        model_id: "mistral.mistral-small-2402-v1:0",
        pricing: [

        ]
    },
    "llama3-8b": {
        pricing: [

        ]
    },
    "llama3-70b": {
        pricing: [

        ]
    }
}