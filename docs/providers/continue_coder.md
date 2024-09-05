# continue-coder

> Since Docker image version 0.0.13

This Provider is compatible with the [autocompletion](https://docs.continue.dev/features/tab-autocomplete) of the AI-assisted coding plugin [Continue](https://www.continue.dev/).

## Model configuration

```json
{
  "localLlmModel": "claude-3-haiku"
}
```

| Key     | Type      | Required     | Default value | Description |
| ------------- | -------| ------------- | ------------- | ------------- |
| localLlmModel  | string   | Y   |   | A native model's name |

Then grant this model to  group or apikey.

## Continue configuration

After entering the plugin configuration, refer to the following configuration parameters:

```json
{
  "tabAutocompleteModel": {
    "title": "MMMM",
    "model": "Coder",
    "apiKey": "br-xxxxxxxxxxxx",
    "contextLength": 4000,
    "apiBase": "https://<your-endpoint>/v1/",
    "provider": "openai"
  },
  "tabAutocompleteOptions": {
    "debounceDelay": 3000,
    "useCache": false,
    "multilineCompletions": "always"
  }
}
```

!!!note

    If the auto-completion of Continue is triggered, it will immediately consume tokens. Please appropriately increase the `debounceDelay` parameter.
