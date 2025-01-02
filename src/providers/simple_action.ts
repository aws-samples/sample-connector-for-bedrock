// Sample invoker for restful api
import { ChatRequest, ResponseData } from "../entity/chat_request"
import WebResponse from "../util/response";
import AbstractProvider from "./abstract_provider";
import helper from '../util/helper';
import key from "../service/key";


export default class SimpleAction extends AbstractProvider {
  parameters: any[] = [];
  schema: any;
  constructor() {
    super();
  }

  async chat(chatRequest: ChatRequest, session_id: string, ctx: any,) {
    // console.log(this.modelData.config);
    let { localLlmModel, schema, system, instruct, entryPoint } = this.modelData.config;

    if (!localLlmModel) {
      throw new Error("You must specify the parameter 'localLlmModel'.")
    }

    if (!entryPoint) {
      throw new Error("You must specify the parameter 'entryPoint'.")
    }
    if (!schema) {
      throw new Error("You must specify the parameter 'schema'.")
    }
    this.schema = schema;
    system && (system = this.replacePrompt(system, "datetime"));

    const entryPointApi = this.findEntrypoint(schema, entryPoint);
    if (!entryPointApi) {
      throw new Error("Entry point not found.");
    }
    this.parameters = entryPointApi.parameters;
    chatRequest.model = localLlmModel;
    chatRequest.messages.unshift({
      role: "system",
      content: system || "You are a helpful assistant."
    });

    chatRequest.model = localLlmModel;

    const response = await this.askForParameters(chatRequest, entryPointApi, session_id, ctx);
    console.log(JSON.stringify(response, null, 2));
    ctx.status = 200;
    if (chatRequest.stream) {
      ctx.set({
        'Connection': 'keep-alive',
        'Cache-Control': 'no-cache',
        'Content-Type': 'text/event-stream',
      });

      const { message, data } = this.toPostData(response);

      // console.log("response", JSON.stringify({ message, data }, null, 2));
      const hasData = Object.keys(data).length !== 0;
      if (message && !hasData) {
        ctx.res.write("data: " + WebResponse.wrap(0, chatRequest.model, message, null) + "\n\n");
      }
      if (hasData) {
        // console.log(schema, entryPointApi);
        let url = schema.servers[0]["url"] + entryPointApi.path;
        const method = entryPointApi.method.toUpperCase();

        if (method === "GET") {
          url = url + "?" + new URLSearchParams(data).toString();
        }
        // console.log(url, method, data);

        // ctx.res.write("data: " + WebResponse.wrap(0, chatRequest.model, "## Result", null) + "\n\n");
        const options: any = {
          method: method,
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + ctx.user.api_key,
            'Session-Id': session_id
          }
        }

        if (method === "POST" && hasData) {
          options.body = JSON.stringify(data);
        }

        const response = await fetch(url, options);


        if (!response.ok)
          throw new Error(await response.text());

        const lastResult = await response.json();

        const sumRes = await this.summarizeResult(chatRequest, lastResult, session_id, ctx);
        console.log(JSON.stringify(sumRes, null, 2));

        ctx.res.write("data: " + WebResponse.wrap(0, chatRequest.model, sumRes.choices[0]["message"]["content"], null) + "\n\n");
      }

      ctx.res.end();
    } else {
      ctx.set({
        'Content-Type': 'application/json',
      });
      ctx.body = response;
    }

  }

  findEntrypoint(schema: any, entryPoint: any) {
    for (const path in schema.paths) {
      // console.log(path)
      for (const method in schema.paths[path]) {
        const apiObj = schema.paths[path][method];
        // console.log(apiObj);
        if (apiObj["operationId"] == entryPoint) {
          apiObj.path = path;
          apiObj.method = method;
          return apiObj;
        }
      }
    }
    return null;
  }

  async summarizeResult(chatRequest: ChatRequest, result: any, session_id: any, ctx: any) {
    const messages = chatRequest.messages;
    messages.push({
      role: "user",
      content: `The API request has been made, 
      and the following is the result returned by the API. 
      Please convey this result to the user in natural language, 
      taking into account the context. 
      
<result>
${JSON.stringify(result, null, 2)}
</result>
      `
    });

    console.log(messages);


    const response = await fetch("http://localhost:8866/v1/chat/completions", {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + ctx.user.api_key,
        'Session-Id': session_id
      },
      body: JSON.stringify({
        model: chatRequest.model,
        messages: messages
      })
    });

    if (!response.ok)
      throw new Error(await response.text());

    return await response.json();
  }

  async askForParameters(chatRequest: any, entryPointApi: any, session_id: string, ctx: any) {
    const parameters = { type: "object" };
    const required = [];
    for (const p of entryPointApi.parameters) {
      if (!p.dependsOn) {
        parameters[p.name] = {
          type: p.type,
          description: p.description,
        }
        required.push(p.name);
      }
    }
    const tools = [
      {
        type: "function",
        function: {
          name: entryPointApi["operationId"],
          description: entryPointApi["summary"],
          parameters: parameters,
          required: required,
        }
      }
    ];

    const strPara = this.parameters.reduce((a, p) =>
      p.dependsOn ? a + "" : a + "\n" + p.name + ": " + (p.value || "")
      , "")

    const lastQ = chatRequest.messages[chatRequest.messages.length - 1];
    lastQ.content = lastQ.content + `
    Currrent required parameters are:

    ${strPara}

    `;

    // console.log("lastQ", lastQ);

    // chatRequest.tools = tools;
    // chatRequest.tool_choice = "auto";
    // chatRequest.stream = false;

    console.log(JSON.stringify({
      tools,
      tool_choice: "auto",
      model: chatRequest.model,
      messages: chatRequest.messages

    }, null, 2));

    const response = await fetch("http://localhost:8866/v1/chat/completions", {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + ctx.user.api_key,
        'Session-Id': session_id
      },
      body: JSON.stringify({
        tools,
        tool_choice: "auto",
        model: chatRequest.model,
        messages: chatRequest.messages

      })
    });

    if (!response.ok)
      throw new Error(await response.text());

    return await response.json();
  }

  toPostData(res: any) {
    let message = "";
    let data: any = {};
    if (res.choices) {
      for (const c of res.choices) {
        if (c.message.content) {
          message += c.message.content;
        }
        if (c.message.tool_calls) {
          for (const t of c.message.tool_calls) {
            if (t.function && t.function.arguments) {
              data = { ...data, ...t.function.arguments };
            }
          }
        }
      }
    }
    return { message, data };
  }

  replacePrompt(inputString: string, keyword: string) {
    if (keyword == "datetime") {
      const now = new Date();
      const formattedDate = now.toISOString();
      const regex = new RegExp(`\\{\\{?\\s*${keyword}\\s*\\}?\\}`, 'g');
      return inputString.replace(regex, match => {
        if (match.startsWith('{{') && match.endsWith('}}')) {
          return match.replace("{{", "{").replace("}}", "}");
        } else {
          return formattedDate;
        }
      });
    }
    return inputString;

  }

}