# 提供器: web-miner

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
  "localLlmModel": "claude-3-sonnet",
  "searxng": {
    "host": "http://localhost:8081"
  },
  "google": {
    "googleCSECX": "00xxxc000a2xxxxx",
    "googleAPIKey": "AIxxxxxx_xxxxxxxx"
  },
  "serpapi": {
    
  },
  "duckduckgo": {

  }
}
```

- sites: Limit the search to these websites.
- search engine, choose one of the following:
  - searxng
  - google
  - DuckDuckGo
  - SerpAPI
- localLlmModel: must be configured as a model that supports function calling and already exists in BRConnector.



## Search engine configuration

### searxng

Visit https://docs.searxng.org/ for more information.

Start searxng:

```shell
docker run --rm -d -p 8081:8080 -e "BASE_URL=http://localhost:8081/" -e "INSTANCE_NAME=searxng" searxng/searxng
```

Then you will get the searxng endpoint: http://localhost:8081/.

### DuckDuckGo

### SerpAPI

!!! warning "SerpAPI 不免费"
    Exceeding the daily free limit will be charged.


### Google

!!! warning
    Exceeding the daily free limit will be charged.

[Google CSE key apply](https://developers.google.com/custom-search/v1/introduction)


## Screenshots in BRClient

![Web 1](./screenshots/web-1.png)

![Web 2](./screenshots/web-2.png)
