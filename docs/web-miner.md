# Web miner with search engine

This Provider can turn your question into search keywords, obtain results through search engines, and then summarize them into corresponding answers.

> [!TIP]
> Please note, do not ask too many rounds of questions, because this Provider will summarize your previous prompts to keywords for searching.
>
> And since the results of the questions are too many, the BRClient will summarize the history, thereby losing the earliest user input.

## Model configuration

The parameter configuration is as follows:

Name: some-model

Provider: web-miner

Configuration:

```json
{
  "sites": [
    "aws.amazon.com",
    "www.amazonaws.cn",
    "repost.aws",
    "stackoverflow.com"
  ],
  "googleCSECX": "00xxxc000a2xxxxx",
  "googleAPIKey": "AIxxxxxx_xxxxxxxx",
  "localLlmModel": "claude-3-sonnet"
}
```

- sites: Limit the search to these websites.
- googleAPIKey: Google API key.
- googleCSECX: Google custom search engine key.
- localLlmModel: must be configured as a model that supports function calling and already exists in BRConnector.

[Google CSE key apply](https://developers.google.com/custom-search/v1/introduction)

## Screenshots in BRClient

![Web 1](./screenshots/web-1.png)

![Web 2](./screenshots/web-2.png)
