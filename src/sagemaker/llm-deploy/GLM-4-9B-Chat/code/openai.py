import json
import re
import time
import torch
from typing import List, Literal, Optional, Union
from transformers import LogitsProcessor

class FunctionCall():
    name: str
    arguments: str


class FunctionCallResponse():
    name: Optional[str] = None
    arguments: Optional[str] = None


class UsageInfo():
    prompt_tokens: int = 0
    total_tokens: int = 0
    completion_tokens: Optional[int] = 0


class ChatCompletionMessageToolCall():
    id: str
    function: FunctionCall
    type: Literal["function"]


class ChatMessage():
    role: Literal["user", "assistant", "system", "tool"]
    content: Optional[str] = None
    function_call: Optional[FunctionCallResponse] = None
    tool_calls: Optional[List[ChatCompletionMessageToolCall]] = None


class DeltaMessage():
    role: Optional[Literal["user", "assistant", "system"]] = None
    content: Optional[str] = None
    function_call: Optional[FunctionCallResponse] = None


class ChatCompletionResponseChoice():
    index: int
    message: ChatMessage
    finish_reason: Literal["stop", "length", "tool_calls"]


class ChatCompletionResponseStreamChoice():
    delta: DeltaMessage
    finish_reason: Optional[Literal["stop", "length", "tool_calls"]]
    index: int


class ChatCompletionResponse():
    model: str
    id: str
    object: Literal["chat.completion", "chat.completion.chunk"]
    choices: List[Union[ChatCompletionResponseChoice, ChatCompletionResponseStreamChoice]]
    created: Optional[int] = time.time()
    usage: Optional[UsageInfo] = None


class ChatCompletionRequest():
    model: str
    messages: List[ChatMessage]
    temperature: Optional[float] = 0.8
    top_p: Optional[float] = 0.8
    max_tokens: Optional[int] = None
    stream: Optional[bool] = False
    tools: Optional[Union[dict, List[dict]]] = None
    tool_choice: Optional[Union[str, dict]] = "None"
    repetition_penalty: Optional[float] = 1.1


class InvalidScoreLogitsProcessor(LogitsProcessor):
    def __call__(
            self, input_ids: torch.LongTensor, scores: torch.FloatTensor
    ) -> torch.FloatTensor:
        if torch.isnan(scores).any() or torch.isinf(scores).any():
            scores.zero_()
            scores[..., 5] = 5e4
        return scores



def process_messages(messages, tools=None, tool_choice="none"):
    _messages = messages
    processed_messages = []
    msg_has_sys = False

    def filter_tools(tool_choice, tools):
        function_name = tool_choice.get('function', {}).get('name', None)
        if not function_name:
            return []
        filtered_tools = [
            tool for tool in tools
            if tool.get('function', {}).get('name') == function_name
        ]
        return filtered_tools

    if tool_choice != "none":
        if isinstance(tool_choice, dict):
            tools = filter_tools(tool_choice, tools)
        if tools:
            processed_messages.append(
                {
                    "role": "system",
                    "content": None,
                    "tools": tools
                }
            )
            msg_has_sys = True

    if isinstance(tool_choice, dict) and tools:
        processed_messages.append(
            {
                "role": "assistant",
                "metadata": tool_choice["function"]["name"],
                "content": ""
            }
        )

    for m in _messages:
        role, content, func_call = m.role, m.content, m.function_call
        tool_calls = getattr(m, 'tool_calls', None)

        if role == "function":
            processed_messages.append(
                {
                    "role": "observation",
                    "content": content
                }
            )
        elif role == "tool":
            processed_messages.append(
                {
                    "role": "observation",
                    "content": content,
                    "function_call": True
                }
            )
        elif role == "assistant":
            if tool_calls:
                for tool_call in tool_calls:
                    processed_messages.append(
                        {
                            "role": "assistant",
                            "metadata": tool_call.function.name,
                            "content": tool_call.function.arguments
                        }
                    )
            else:
                for response in content.split("\n"):
                    if "\n" in response:
                        metadata, sub_content = response.split("\n", maxsplit=1)
                    else:
                        metadata, sub_content = "", response
                    processed_messages.append(
                        {
                            "role": role,
                            "metadata": metadata,
                            "content": sub_content.strip()
                        }
                    )
        else:
            if role == "system" and msg_has_sys:
                msg_has_sys = False
                continue
            processed_messages.append({"role": role, "content": content})

    if not tools or tool_choice == "none":
        for m in _messages:
            if m.role == 'system':
                processed_messages.insert(0, {"role": m.role, "content": m.content})
                break
    return processed_messages



def process_response(output: str, use_tool: bool = False) -> Union[str, dict]:
    lines = output.strip().split("\n")
    arguments_json = None
    special_tools = ["cogview", "simple_browser"]

    tool_call_pattern = re.compile(r'^[a-zA-Z_][a-zA-Z0-9_]*$')

    if len(lines) >= 2 and tool_call_pattern.match(lines[0]):
        function_name = lines[0].strip()
        arguments = "\n".join(lines[1:]).strip()

        try:
            arguments_json = json.loads(arguments)
            is_tool_call = True
        except json.JSONDecodeError:
            is_tool_call = function_name in special_tools

        if is_tool_call and use_tool:
            content = {
                "name": function_name,
                "arguments": json.dumps(arguments_json if isinstance(arguments_json, dict) else arguments, ensure_ascii=False)
            }
            if function_name == "simple_browser":
                search_pattern = re.compile(r'search\("(.+?)"\s*,\s*recency_days\s*=\s*(\d+)\)')
                match = search_pattern.match(arguments)
                if match:
                    content["arguments"] = json.dumps({
                        "query": match.group(1),
                        "recency_days": int(match.group(2))
                    }, ensure_ascii=False)
            elif function_name == "cogview":
                content["arguments"] = json.dumps({
                    "prompt": arguments
                }, ensure_ascii=False)

            return content
    return output.strip()




async def parse_output_text(model_id: str, value: str, function_call: FunctionCallResponse = None):
    delta = DeltaMessage(role="assistant", content=value)
    if function_call is not None:
        delta.function_call = function_call

    choice_data = ChatCompletionResponseStreamChoice(
        index=0,
        delta=delta,
        finish_reason=None
    )
    chunk = ChatCompletionResponse(model=model_id, id="", choices=[choice_data], object="chat.completion.chunk")
    yield "{}".format(chunk.model_dump_json(exclude_unset=True))
    yield '[DONE]'
