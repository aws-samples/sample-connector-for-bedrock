import { ChatRequest } from "../entity/chat_request"
import WebResponse from "../util/response";
import AbstractProvider from "./abstract_provider";
import { google } from 'googleapis';


export default class WebMiner extends AbstractProvider {

  googleAPIKey: any;
  googleCSECX: any;
  sites: any;

  constructor() {
    super();
  }

  async chat(chatRequest: ChatRequest, session_id: string, ctx: any) {
    const { localLlmModel, sites, google, searxng, duckduckgo, serpapi } = this.modelData.config;
    if (!localLlmModel) {
      throw new Error("You must specify the parameter 'localLlmModel'.")
    }
    this.sites = sites;
    chatRequest.model = localLlmModel;

    // let searchEngine = null;
    // if (googleAPIKey) {
    //   searchEngine = "google";
    // }
    // if (!searchEngine) {
    //   throw new Error("You must specify a search engine in the backend model configuration.")
    // }
    // this.googleCSECX = googleCSECX;
    // this.googleAPIKey = googleAPIKey;

    ctx.status = 200;

    if (chatRequest.stream) {
      const keywordsResponse = await this.extractKeywords(ctx, chatRequest);
      let keyword: string;
      for (const c of keywordsResponse.choices) {
        if (c.message.tool_calls) {
          for (const tool of c.message.tool_calls) {
            if (tool["function"]["name"] == "extractKeywords") {
              keyword = tool["function"]["arguments"]["keywords"];
            }
          }
        }
      }


      const lastQ = chatRequest.messages[chatRequest.messages.length - 1];
      const q = lastQ.content;
      keyword = keyword || q;
      console.log("keyword", keyword);
      const gRes = await this.search(keyword, { google, searxng, duckduckgo, serpapi });
      console.log("gRes", gRes);

      // console.log("g result", gRes);
      const prompt = this.toPrompt(q, gRes)
      // console.log(prompt);
      lastQ.content = prompt;

      // console.log()

      // console.log("KKKKKKKKKK", keyword, JSON.stringify(chatRequest, null, 2));
      // return;
      ctx.set({
        'Connection': 'keep-alive',
        'Cache-Control': 'no-cache',
        'Content-Type': 'text/event-stream',
      });
      // console.log(JSON.stringify(chatRequest, null, 2));
      // delete chatRequest.tools;
      await this.chatStream(ctx, chatRequest, session_id, gRes);
    } else {
      ctx.set({
        'Content-Type': 'application/json',
      });
      ctx.body = await this.chatSync(ctx, chatRequest, session_id);
    }
  }

  async chatStream(ctx: any, chatRequest: ChatRequest, session_id: string, refItems: any) {
    // console.log(chatRequest, ctx.user);
    refItems = refItems || [];
    const response = await fetch("http://localhost:8866/v1/chat/completions", {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + ctx.user.api_key
      },
      body: JSON.stringify(chatRequest)
    });

    if (!response.ok)
      throw new Error(await response.text());
    const reader = response.body.getReader();
    let done: any, value: any;
    while (!done) {
      ({ value, done } = await reader.read());
      // console.log(value);
      if (value) {
        const vString = new TextDecoder().decode(value);
        if (vString.indexOf("[DONE]") < 0) {
          ctx.res.write(value);
        }
      }
    }

    ctx.res.write("data:" + WebResponse.wrap(0, null, "\n\n---\n\n", null) + "\n\n");

    const citaStrings = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣", "🔟"];
    let i = 0;
    for (let j = 0; j < refItems.length; j++) {
      const citaIndex = j + 1;
      i = i + 1 + citaIndex;
      const citaContent = "\n\n[" + citaStrings[j] + " " + refItems[j]["title"] + "](" + refItems[j]["url"] + ")";
      ctx.res.write("data:" + WebResponse.wrap(i, null, citaContent, null) + "\n\n");
    }
    ctx.res.write("data: [DONE]\n\n")

    ctx.res.end();
  }

  async extractKeywords(ctx: any, chatRequest: ChatRequest) {
    const keyQuery = chatRequest.messages.filter(e => (e.role == "user")).reduce((prev, ele) => {
      return prev + ele.content + "\n\n";
    }, "");

    // Prompt for se tool.
    // you can use the following rules: 
    // The intext: operator (i.e intext:keyword) enables you to locate terms that show up in any part of a website page, from the page title to page’s content. 
    // Minus '-' symbols: While the minus '-' operator is ignored for matching
    const tools = [
      {
        type: "function",
        function: {
          name: "extractKeywords",
          description: `According to the user's input and intent, extract the some keywords for search engine`,
          parameters: {
            type: "object",
            properties: {
              keywords: {
                "type": "string",
                "description": "Keywords extracted from the use's input.",
              }
            },
            "required": ["keywords"],
          }
        }
      }
    ];
    const kRequest = {
      model: chatRequest.model,
      messages: [
        {
          role: "user",
          content: keyQuery
        }
      ],
      // messages: chatRequest.messages,
      tools,
      tool_choice: "auto"
    }

    // console.log(JSON.stringify(kRequest, null, 2));
    // console.log(chatRequest, ctx.user);
    const response = await fetch("http://localhost:8866/v1/chat/completions", {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + ctx.user.api_key
      },
      body: JSON.stringify(kRequest)
    });
    if (!response.ok)
      throw new Error(await response.text());

    return response.json();

  }

  async chatSync(ctx: any, chatRequest: ChatRequest, session_id: string) {

    const response = await fetch("http://localhost:8866/v1/chat/completions", {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + ctx.user.api_key
      },
      body: JSON.stringify(chatRequest)
    });

    return await response.json();
    // const json = await response.json();
    // // console.log(json);
    // return json;
    // if (!response.ok)
    //   throw new Error(await response.text());
    // const reader = response.body.getReader();
    // let done: any, value: any;
    // while (!done) {
    //   ({ value, done } = await reader.read());
    //   if (value) { ctx.res.write(value); }
    // }
    // ctx.res.end();
  }

  async search(q: string, options: any): Promise<any> {
    if (!q) {
      return [];
    }
    if (this.sites) {
      const lenSites = this.sites.length;
      // const sitesStr = this.sites ? this.sites.join(",") : "";
      const sitesStr = this.sites.reduce((p, n, i) => (i == lenSites - 1 ? p + "site:" + n : p + "site:" + n + " OR "), "");
      q += " + " + sitesStr;
    }

    console.log("q", q, options);

    if (options.searxng) {
      return await this.searxng(q, options.searxng);
    }


    if (options.google) {
      return await this.googleCSE(q, options.google);
    }
  }

  async searxng(q: string, config: any): Promise<any> {
    if (config.host) {
      const url = config.host.endsWith('/') ? config.host : config.host + '/';
      console.log(url);
      const result = await fetch(url + "?format=json&q=" + q, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        }
      });
      const resultJson = await result.json();
      const sortedItems = resultJson.results.sort((a: any, b: any) => a.score <= b.score);

      return sortedItems.slice(0, 10).map((result: any) => ({
        title: result.title,
        url: result.url,
        content: result.content,
        score: result.score
      }));
    }
    throw new Error("You must config searxng.host in your configuration.");

  }

  async googleCSE(q: string, config: any): Promise<any> {

    if (config.google.googleAPIKey && config.google.googleCSECX) {
      const customsearch = google.customsearch('v1');
      const seRequest: any = {
        cx: this.googleCSECX,
        q,
        auth: this.googleAPIKey,
        num: 10
      }
      const res = await customsearch.cse.list(seRequest);

      return res.data.items.map((result: any) => ({
        title: result.title,
        url: result.link,
        content: result.snippet
      }));
    }
    throw new Error("You must config google's api key and cse key in your configuration.");
    // console.log("real query: ", q)


  }

  toPrompt(q: string, result: [any]) {
    if (!result) {
      return q;
    }
    const knowledges = result.reduce((preValue, ele, currentIndex) => {
      return preValue + `
  <search_result>
    <title>${ele["title"]}</title>
    <content>${ele["content"]}</content>
    <source>${currentIndex + 1}</source>
  </search_result>`;;
    }, "");
    return `
You are a question answering agent. I will provide you with a set of search results and a question, 
Please answer my question. 

Here are the search results in numbered order:
<search_results>
${knowledges}
</search_results>

Here is the my question:
<question>
${q}
</question>

If you reference information from a search result within your answer, you must include a citation to source where the information was found. Each result has a corresponding source ID that you should reference. 

Note that there may contain multiple <source> if you include information from multiple results in your answer, please use 🔟 as source 10,1️⃣ 2️⃣ 3️⃣ 4️⃣ 5️⃣ 6️⃣ 7️⃣ 8️⃣ 9️⃣ for 1 2 3 4 5 6 7 8 9.

Do NOT directly quote the <search_results> in your answer. Your job is to answer my question as concisely as possible.

You may output your answer in Markdown format. 
`;
  }
}
