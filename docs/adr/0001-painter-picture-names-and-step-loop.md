# 0001. Painter picture names and the step loop

Status: Accepted

## Context

Painter lets the chat model (`localLlmModel`) choose one of eight Stability tools and chain up to five steps in one streamed request. The tools need pictures, but picture bytes must not travel through tool arguments. The design names each picture and lets the code map the name back to S3. Four questions were left to the implementation:

- How names are formed and how the chat model learns them.
- Where the loop keeps its state between steps.
- How several tool calls in one chat answer count against the limit of five.
- What happens when a step fails.

BRClient resends the whole conversation on every turn. The server cannot rewrite the client's history. So uploads from earlier turns arrive again as `data:` URLs, and pictures painter generated earlier arrive as `![...](presigned URL)` in assistant messages.

## Decision

- **Names.** Every picture in the conversation gets the name `image_N`, numbered in order of appearance. Each picture in the chat model's messages is preceded by a text part `[image_N]`. The system prompt lists every name and its origin: uploaded in the latest message, uploaded earlier, or made by painter. Because history only grows at the end, a picture keeps its name across turns.
- **Uploads.** Only the `data:` pictures of the last user message are this turn's uploads. They are checked against the limits (5 pictures, 10 MB each, readable) as a set, then stored before the first chat call. Uploads from earlier turns get names but are stored only when a tool uses them, so a long conversation does not write the same pictures on every turn and does not hit the limit of five.
- **Generated pictures in history.** Before the chat model sees the history, each presigned URL of the model's `s3Bucket` in an assistant message is replaced by its name. The chat model does not rewrite URLs. A tool argument still accepts `s3://<bucket>/<key>`, read only from the model's bucket.
- **Loop state.** The state lives in the chat messages, in the OpenAI tool protocol: the assistant message with its `tool_calls`, one `tool` message per call, then one user message with the newest generated picture as a small JPEG. The previous such message loses its picture, so the chat model sees only the newest one.
- **Limit.** Each tool call is one step, whether it succeeds or fails, and the calls of one answer run in order. Some chat providers return only the last of several parallel tool calls; painter then runs one step per answer. A sixth call is not run; the stream says the limit was reached. Every chat answer either ends the request or uses at least one step, so a request makes at most six chat calls.
- **Failures.** Any failed step ends the request: an unknown tool or picture name, bad arguments, a picture outside the limits, a filtered or failed generation, or a Bedrock error. Pictures already made stay streamed and billed. No chat call is made and no step starts after the client has disconnected.

## Consequences

- "Remove the background of the last picture" works across turns without the chat model handling URLs.
- An earlier upload costs nothing until it is used. A pending upload is checked against the 10 MB limit when it is stored.
- If the client drops or edits history messages, numbering shifts. The system prompt carries the current list, so the chat model is not misled by the names in old step lines for long.
- Ending on any failure keeps cost predictable. The user re-asks to retry, for example with different wording after a filtered prompt.

## Alternatives considered

- **Store every history upload on every turn.** Simple, but it writes the same pictures to S3 on every turn.
- **Let the chat model rewrite presigned URLs to `s3://` URLs.** This depends on the chat model following an instruction exactly. The code can do it deterministically.
- **Return step errors to the chat model and continue.** The chat model could retry a filtered prompt, but each retry can cost money the user did not ask for.
