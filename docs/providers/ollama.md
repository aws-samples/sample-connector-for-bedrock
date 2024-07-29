# ollama

You can deploy native model with Ollama, This provider can adapt to the API of Ollama.

For more information, visit <https://github.com/ollama/ollama/>.

## Configuration

```json
{
  "host": "http://localhost:11434",
  "model": "phi3"
}
```

| Key     | Type      | Required     | Default value | Description |
| ------------- | -------| ------------- | ------------- | ------------- |
| host  | string   | Y    |  |   Ollama's host address  |
| model | string   | Y    |  |   Model id. See [Ollama doc](https://ollama.com/library) |
