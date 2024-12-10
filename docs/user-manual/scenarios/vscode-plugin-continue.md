---
title: Continue
---

# vscode-plugin-continue

- install continue plugin in your vscode
![[attachments/vscode-plugin-continue/IMG-vscode-plugin-continue.png]]

- configure continue plugin `~/.continue/config.json`
- chat api
```json
{
  "models": [
    {
      "title": "OpenAI-compatible",
      "provider": "openai",
      "model": "coding",
      "apiKey": "br-xxxxxxxx",
      "apiBase": "https://xxxxxx/v1"
    },
    ...
  ]
  ...
```
- completion api
```json
{
  ...
  "tabAutocompleteModel": {
    "title": "Any-title",
    "model": "coding",
    "apiKey": "br-xxxxxxxxxxxx",
    "contextLength": 4000,
    "apiBase": "https://xxxxxxxxxxxxxxxxx/v1",
    "provider": "openai"
  },
  "tabAutocompleteOptions": {
    "debounceDelay": 1000,
    "multilineCompletions": "always"
  },
  ...
}
```

- configure provider for continue
    - [[../../providers/continue_coder|continue_coder]]

