# How to properly deploy a Sagemaker model

## Input

To make the Sagemaker-deployed model compatible with the provider of sagemaker-openai, you need to ensure your model accepts input in the OpenAI API format, which is as follows:

```json
{
  "model": "YourDefinedModel",
  "messages": [
    {
      "role": "user",
      "content": "hello"
    }
  ],
  "stream": true,
  "temperature": 0.5,
  "presence_penalty": 0,
  "frequency_penalty": 0,
  "top_p": 1,
  "max_tokens": 4000
}
```

## Output


At the same time, you need to ensure your model's output also conforms to the OpenAI format. There are two output formats: streaming and non-streaming.


### Non-streaming

The non-streaming output format is as follows:

```json
{
  "id": "chatcmpl-123",
  "object": "chat.completion",
  "created": 1677652288,
  "model": "gpt-3.5-turbo-0125",
  "system_fingerprint": "fp_44709d6fcb",
  "choices": [{
    "index": 0,
    "message": {
      "role": "assistant",
      "content": "\n\nHello there, how may I assist you today?",
    },
    "logprobs": null,
    "finish_reason": "stop"
  }],
  "usage": {
    "prompt_tokens": 9,
    "completion_tokens": 12,
    "total_tokens": 21
  }
}
```

choices[0].message.content is required.


### Streaming


This is an example of streaming output, where each line represents a complete segment. Please do not truncate it. You must response this in your sagemaker custom inference function.


```json
{"id":"chatcmpl-123","object":"chat.completion.chunk","created":1694268190,"model":"gpt-3.5-turbo-0125", "system_fingerprint": "fp_44709d6fcb", "choices":[{"index":0,"delta":{"role":"assistant","content":""},"logprobs":null,"finish_reason":null}]}

{"id":"chatcmpl-123","object":"chat.completion.chunk","created":1694268190,"model":"gpt-3.5-turbo-0125", "system_fingerprint": "fp_44709d6fcb", "choices":[{"index":0,"delta":{"content":"Hello"},"logprobs":null,"finish_reason":null}]}

....

{"id":"chatcmpl-123","object":"chat.completion.chunk","created":1694268190,"model":"gpt-3.5-turbo-0125", "system_fingerprint": "fp_44709d6fcb", "choices":[{"index":0,"delta":{},"logprobs":null,"finish_reason":"stop"}]}        
```

## Sagemaker Custom Inference Deployment Resources

You can use Sagemaker's custom inference code to perform format conversion. You can refer to these examples:


<https://github.com/huggingface/notebooks/blob/main/sagemaker/17_custom_inference_script/sagemaker-notebook.ipynb>

<https://github.com/aws/amazon-sagemaker-examples/blob/main/inference/generativeai/llm-workshop/lab3-optimize-llm/djl_accelerate_deploy_g5_12x_GPT_NeoX.ipynb>

<https://docs.djl.ai/docs/serving/serving/docs/lmi/deployment_guide/testing-custom-script.html>


