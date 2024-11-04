import { ChatRequest, ResponseData } from "../entity/chat_request"
import WebResponse from "../util/response";
import AbstractProvider from "./abstract_provider";
import helper from '../util/helper';


export default class AWSExecutor extends AbstractProvider {

  constructor() {
    super();
  }

  async chat(chatRequest: ChatRequest, session_id: string, ctx: any,) {
    // console.log(this.modelData);
    const { localLlmModel } = this.modelData.config;
    if (!localLlmModel) {
      throw new Error("You must specify the parameter 'localLlmModel'.")
    }

    chatRequest.model = localLlmModel;

    ctx.status = 200;

    if (chatRequest.stream) {

      ctx.set({
        'Connection': 'keep-alive',
        'Cache-Control': 'no-cache',
        'Content-Type': 'text/event-stream',
      });

      const cliResponse = await this.extractCli(ctx, chatRequest);
      let cli: string, text: string;

      for (const c of cliResponse.choices) {
        if (c.message.tool_calls) {
          for (const tool of c.message.tool_calls) {
            if (tool["function"]["name"] == "extractCli") {
              cli = tool["function"]["arguments"]["cli"];
            }
          }
        }
        if (c.message.content) {
          text = c.message.content;
        }
      }

      text = (text || "I will use this command:") + "\n\n";
      ctx.res.write("data:" + WebResponse.wrap(0, null, "## Prepare the command\n\n", null) + "\n\n");
      ctx.res.write("data:" + WebResponse.wrap(0, null, text, null) + "\n\n");
      ctx.res.write("data:" + WebResponse.wrap(0, null, "```shell\n", null) + "\n\n");
      ctx.res.write("data:" + WebResponse.wrap(0, null, (cli || "# No command extracted.") + "\n", null) + "\n\n");
      ctx.res.write("data:" + WebResponse.wrap(0, null, "```\n\n", null) + "\n\n");

      ctx.res.write("data:" + WebResponse.wrap(0, null, "## Execution result\n\n", null) + "\n\n");

      // console.log(JSON.stringify(cliResponse, null, 2), cli);
      let isValidCmd = cli && cli.indexOf("aws") == 0;

      if (isValidCmd) {
        const lastQ = chatRequest.messages[chatRequest.messages.length - 1];
        let resultCmd = await helper.execAWSCli(cli.trim());
        if (resultCmd == null || resultCmd.length == 0) {
          resultCmd = "[{}]"
          // this.outputWrong(ctx, cli);
          // return;
        }
        // console.log("resCCC\n", resCCC);
        const q = lastQ.content;
        const prompt = this.toPrompt(q, resultCmd)
        lastQ.content = prompt;

        // console.log("Continue...", chatRequest);

        await this.chatStream(ctx, chatRequest, session_id, cli);

      } else {
        this.outputWrong(ctx, cli);
        return;
      }
    } else {
      ctx.set({
        'Content-Type': 'application/json',
      });
      // ctx.body = await this.chatSync(ctx, chatRequest, session_id);
      ctx.body = await this.localChatSync(ctx, chatRequest, session_id);
    }
  }
  async extractCli(ctx: any, chatRequest: ChatRequest) {
    // const keyQuery = chatRequest.messages.filter(e => (e.role == "user")).reduce((prev, ele) => {
    //   return prev + ele.content + "\n\n";
    // }, "");

    // console.log(keyQuery);
    // Prompt for se tool.
    // you can use the following rules: 
    // The intext: operator (i.e intext:keyword) enables you to locate terms that show up in any part of a website page, from the page title to page’s content. 
    // Minus '-' symbols: While the minus '-' operator is ignored for matching
    const tools = [
      {
        type: "function",
        function: {
          name: "extractCli",
          description: `According to the user's input and intent, parse out the aws command, note that the command must be an executable aws command, usually the command line starts with "aws ".
          This command without any variables. Ask user if the required parameters are insufficient.
          Focus on the last question of the user and parse the command line from it.
          You should use awscli v2 version.
          In order to make it easier to answer user questions, please output brief information when commanding the list class.`,
          parameters: {
            type: "object",
            properties: {
              cli: {
                "type": "string",
                "description": "Keywords extracted from the use's input.",
              }
            }
          }
        }
      }
    ];
    const kRequest = {
      model: chatRequest.model,
      // messages: [
      //   {
      //     role: "user",
      //     content: keyQuery
      //   }
      // ],
      messages: chatRequest.messages,
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

  outputWrong(ctx: any, cli: any) {
    ctx.res.write("data:" + WebResponse.wrap(0, null, `Sorry, I can't execute your command, maybe the command was wrong. Please re-inquire or continue.\n\n`, null) + "\n\n");
    ctx.res.end();

  }
  toPrompt(q: string, result: any) {
    if (!result) {
      return q;
    }
    return `
You are a AWS command executor. I will provide you with the results of the execution, please answer my question based on the result.

Here are the result:
<result>
${result}
</result>

Here is the my question:
${q}

Please answer the question directly and do not repeat it. To beautify your answer, add some markdown-formatted text if necessary.
`;
    // 
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

  async chatStream(ctx: any, chatRequest: ChatRequest, session_id: string, cli: any) {
    // console.log(chatRequest, ctx.user);
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
    ctx.res.write("data: [DONE]\n\n")

    ctx.res.end();
  }

}
