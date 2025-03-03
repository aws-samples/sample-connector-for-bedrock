# web-miner

> Since Docker image version 0.0.10

Seach the internet.

This Provider can turn your question into search keywords, obtain results through search engines, and then summarize them into corresponding answers.

!!! tip
    Do not ask too many rounds of questions, because this Provider will summarize your previous prompts to keywords for searching.

    In BRClient, too long information is summarized into a single history, losing the earliest user input, which results in the AI answering a far cry from what you want.

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
    "host": "http://127.0.0.1:8081/"
  },
  "serpapi": {
    "apiKey": "xxx......",
    "engine": "google"
  },
  "google": {
    "googleAPIKey": "AIxxxxxx_xxxxxxxx",
    "googleCSECX": "00xxxc000a2xxxxx"
  }
}
```

- sites: Limit the search to these websites, you can leave this parameter unspecified.
- localLlmModel: must be configured as a model that supports function calling and already exists in BRConnector.
- the search tools below are supported in order:
  1. searxng
  2. SerpAPI
  3. google

!!! note
    You need to configure localLlmModel as a claude3+ model provided by the bedrock-converse provider, as other models do not yet have the capability for function calling. The early default claude3 model in the system is not driven by converse. If you use these models, you need to update the original configuration to the bedrock-converse provider. Please note to modify the key 'model_id' to 'modelId'.

## Search engines

### searxng

> Since Docker image version 0.0.11

Visit <https://docs.searxng.org/> for more information.

Create a file: `settings.yml` to support json。

```yaml
use_default_settings: true
server:
    secret_key: "some-Other-PWD"   # change this!
    bind_address: "0.0.0.0"
search:
  formats:
    - html
    - json
```

Start searxng:

```shell
 docker run --name searxng -d -p 8081:8080 \
  -v ./settings.yml:/etc/searxng/settings.yml \
  -e "INSTANCE_NAME=searxng" searxng/searxng
```

Then you will get the searxng endpoint: <http://127.0.0.1:8081/>, configure it to searxng's host node.

### SerpAPI

> Since Docker image version 0.0.11

For more information, visit <https://serpapi.com/>.

Once you're logged in, you can see Api key in a prominent place on it.

The engine parameter supports the following, and the default is google:

- google
- bing
- baidu
- duckduckgo
- yahoo
- yandex
- yelp
- naver

!!! warning "SerpAPI is not free"
    Exceeding the monthly free limit will be charged.

### Google

To use the Google Custom Search Engine, you need the following 2 keys, click the link to create them:

- [Google API Key](https://console.cloud.google.com/apis/credentials)

- [Google CSECX](https://programmablesearchengine.google.com/controlpanel/create)

!!! warning "Google CSE is not free"
    Exceeding the daily free limit will be charged.

## Screenshots in BRClient

![Web 1](../user-manual/screenshots/web-1.png)

![Web 2](../user-manual/screenshots/web-2.png)
