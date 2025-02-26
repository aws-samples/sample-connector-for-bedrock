# smart-router

> Applies to Docker image version 0.0.21 and above

This Provider can automatically route models based on predefined rules.

You need to configure routing rules in the backend, and these rules are based on natural language/prompt words.

## Configuration

```json
{
  "rules": [
    {
      "name": "my-painter",
      "description": "draw a picture"
    },
    {
      "name": "amazon-nova-pro",
      "description": "When user talks about AWS or Amazon"
    },
    {
      "name": "claude-3-sonnet",
      "description": "uncertain"
    }
  ],
  "localLlmModel": "amazon-nova-lite"
}
```

In `rules`:

- **name**: The name of the model, referring to the model name configured in BRConnector. This key must be retained.
- **description**: A description of the model.

!!! tip

    The above configuration will be fully input into the system prompt. To improve intent recognition accuracy, you can add any other keys such as "when", "except", etc.

| Key           | Type   | Required | Default | Description                                             |
|---------------|--------|----------|---------|---------------------------------------------------------|
| localLlmModel | string | Yes      |         | Select a local model that supports **function calls**   |
| rules         | json   | Yes      |         | Refer to the configuration example above                |

!!! tip

    If the router does not select any model, it will degrade the model name to "default". Therefore, it is best to have a model named "default" in your configurations.

---

This translation provides an English version of the provided Chinese text, maintaining the structure and meaning of the original content.
