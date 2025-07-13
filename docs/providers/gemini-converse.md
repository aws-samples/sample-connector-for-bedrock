# gemini-converse

> Applies to Docker image version 0.0.34 and above

This Provider allows you to integrate Google's Gemini models into BRConnector using the Google Generative AI API.

## Configuration

```json
{
  "model": "gemini-2.5-flash",
  "apiKey": "AI..."
}
```

| Key      | Type   | Required | Default      | Description                                           |
|----------|--------|----------|--------------|-------------------------------------------------------|
| apiKey   | string | Yes      |              | Google AI API key (starts with "AI...")              |
| model    | string | No       | gemini-pro   | Gemini model name (e.g., gemini-2.5-flash, gemini-2.5-pro, gemini-2.0-flash) |

## Supported Models

- **gemini-2.5-pro**: Most advanced multimodal model, excellent for coding and complex reasoning
- **gemini-2.5-flash**: Mixed reasoning model with 1M token context window and thinking budget
- **gemini-2.0-flash**: Most balanced multimodal model optimized for the agentic era
- **gemini-pro**: Standard Gemini model (default)

## Pricing

| Model           | Input Tokens           | Output Tokens          |
|-----------------|------------------------|------------------------|
| gemini-2.5-pro  | $1.25-2.50/M tokens   | $10.00-15.00/M tokens |
| gemini-2.5-flash| $0.30-1.00/M tokens   | $2.50/M tokens        |
| gemini-2.0-flash| $0.10-0.70/M tokens   | $0.40/M tokens        |

*Pricing varies based on input modality (text/image/video vs audio) and prompt length*

## Features

- ✅ Text generation
- ✅ Streaming responses
- ✅ OpenAI-compatible response format
- ✅ Multi-modal support (text, images, video, audio)
- ✅ Long context windows (up to 1M tokens)
- ✅ Automatic token estimation

## Getting Started

1. Get your Google AI API key from [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Configure the provider with your API key
3. Choose your preferred Gemini model
4. Start making requests through the BRConnector API

## Notes

- The provider automatically converts OpenAI-style messages to Gemini format
- Supports both streaming and non-streaming responses
- Token counting is estimated (approximately 4 characters per token)
- Images and other media are automatically handled according to Gemini's token counting rules 