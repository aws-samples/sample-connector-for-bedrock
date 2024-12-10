---
title: Continue
---

# vscode-plugin-continue

- 在 vscode 中安装 continue 插件
![[attachments/vscode-plugin-continue/IMG-vscode-plugin-continue.png]]

- 配置 continue 插件 `~/.continue/config.json`
- 配置 chat api
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
- 配置 completion api
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

- 为 continue 插件配置专用的 provider 
    - [[../../providers/continue_coder|continue_coder]]

