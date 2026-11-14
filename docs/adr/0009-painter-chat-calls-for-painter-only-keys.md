# 0009. Painter chat calls for keys granted only painter

Status: Accepted

## Context

Painter plans with a chat model (`localLlmModel`). It calls that model through the gateway's own `/v1/chat/completions` with the caller's API key, so the call is billed to that key. The gateway checks model access on every call, so a key granted `painter` alone was refused on painter's own chat call. Granting `painter` must be enough. The key must still not be able to call the chat model directly.

## Decision

- Painter attaches a model grant to each of its calls to the chat model, in the `x-brconnector-painter-grant` header. A grant is a random 32-byte token that the BRConnector process keeps in memory. It is bound to the key id and the chat model name, and it is valid for 60 seconds.
- On `/v1/chat/completions`, the gateway accepts a grant for the resolved model name and the calling key as access, and deletes it on the first lookup that finds it. Without a valid grant, the normal group and key checks apply.
- Painter issues a grant only after its own request has passed the access check for `painter`, and only for the chat model in its config. The grant does not change billing. The call is billed to the same key.

## Threat analysis

- **A client sets the header itself.** It cannot know a valid token. The tokens are random, travel only on the loopback call, and are never returned in a response. A made-up token finds no grant, and the normal check applies.
- **A token leaks after use.** The gateway deletes a token when it checks access, before the chat model's provider runs. A token that a provider passes on with the request headers is already spent.
- **A client replays a token.** A token is deleted on the first lookup that finds it, and it expires after 60 seconds.
- **A token is used for another key or another model.** The grant must match both the calling key and the resolved model name, or the request is refused.
- **Trusting the loopback address instead.** On `lambda` and `lambda-web`, every request reaches BRConnector from a local address, so a source-address check would let any client through. The grant does not depend on the source address.
- **What a painter-only key can reach.** It can use the chat model only through painter: in a stream request under painter's system prompt and tools, and in a non-stream request, which painter forwards to the chat model as documented. Both are billed to that key at the chat model's prices.

## Consequences

- The grant works because painter's loopback call reaches the same process. BRConnector runs one process per container or function, so this holds on every compute type.
- Only the chat completions path accepts grants. Other paths do not read the header.

## Alternatives considered

- **An HMAC-signed header with a per-process secret.** It is as hard to forge, but a token could be replayed until it expires.
- **Call the chat model in process.** It would skip the gateway's request handling, billing and thread records that the loopback call reuses.
- **Grant access to the chat model wherever painter is granted.** The key could then call the chat model directly.
