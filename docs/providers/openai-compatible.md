### OpenAI-Compatible

> Applies to Docker image version 0.0.21 and above

This Provider allows you to reconfigure third-party models that have already been adapted to the OpenAI API into BRConnector.

## Configuration

```json
{
  "model": "qwen-plus",
  "apiKey": "sk-...",
  "baseURL": "https://some-url/v1"
}
```

| Key      | Type   | Required | Default | Description         |
|----------|--------|----------|---------|---------------------|
| baseURL  | string | Yes      |         | Base URL            |
| apiKey   | string | Yes      |         | API key             |
| model    | string | Yes      |         | Third-party model name |
