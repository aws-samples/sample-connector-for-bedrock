"""
LiteLLM Proxy Endpoint.

Provides an Anthropic-compatible messages API endpoint that forwards
requests to LiteLLM for multi-provider model inference support.
"""

import json
from typing import Any

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse

router = APIRouter()


def remove_cache_control(obj: Any) -> Any:
    """
    Recursively remove all cache_control fields from a data structure.

    This is needed for non-Claude models that don't support prompt caching.

    Args:
        obj: The object to process (dict, list, or primitive)

    Returns:
        The object with all cache_control fields removed
    """
    if isinstance(obj, dict):
        # Create a new dict without cache_control
        return {
            k: remove_cache_control(v) for k, v in obj.items() if k != "cache_control"
        }
    elif isinstance(obj, list):
        # Process each item in the list
        return [remove_cache_control(item) for item in obj]
    else:
        # Return primitives as-is
        return obj


@router.post("/v1/messages")
async def litellm_messages_proxy(request: Request):
    """
    LiteLLM proxy endpoint for Anthropic-compatible messages API.

    This endpoint forwards requests to LiteLLM for model inference,
    allowing the SDK client to use this server as ANTHROPIC_BASE_URL.

    Supports:
    - Streaming responses
    - Multiple model providers via LiteLLM
    - Compatible with Anthropic Messages API format
    - Automatic removal of cache_control for non-Claude models
    """
    try:
        print("\n[LiteLLM Proxy] Request received")

        # Try to import litellm
        try:
            import litellm
            litellm.success_callback = ["langfuse"]
            print("[LiteLLM Proxy] LiteLLM imported successfully")
        except ImportError:
            print("[LiteLLM Proxy] ERROR: LiteLLM not installed")
            raise HTTPException(
                status_code=503,
                detail="LiteLLM is not installed. Install with: pip install litellm",
            )

        body = await request.json()

        # Check if model is a Claude model
        model = body.get("model", "")
        is_claude_model = "claude" in model.lower()
        print(f"[LiteLLM Proxy] Model: {model}")
        print(f"[LiteLLM Proxy] Is Claude model: {is_claude_model}")

        # Remove cache_control if not a Claude model
        if not is_claude_model:
            print("[LiteLLM Proxy] Removing cache_control for non-Claude model")
            body = remove_cache_control(body)

        # Check if streaming is requested
        is_streaming = body.get("stream", False)
        print(f"[LiteLLM Proxy] Streaming: {is_streaming}")

        if is_streaming:
            # Streaming response
            print("[LiteLLM Proxy] Starting streaming response")
            print(f"[LiteLLM Proxy] Request body keys: {body.keys()}")
            print(f"[LiteLLM Proxy] Model: {body.get('model')}")
            print(f"[LiteLLM Proxy] Stream: {body.get('stream')}")
            print(f"[LiteLLM Proxy] Max tokens: {body.get('max_tokens')}")

            async def generate_stream():
                try:
                    # Forward to LiteLLM with streaming
                    print("[LiteLLM Proxy] Calling litellm.litellm.anthropic.messages.acreate()")
                    print(f"[LiteLLM Proxy] Full request body: {json.dumps(body, indent=2)[:500]}...")
                    response = await litellm.litellm.anthropic.messages.acreate(**body)
                    print(f"[LiteLLM Proxy] Received response object, type: {type(response)}")
                    print("[LiteLLM Proxy] Starting to iterate over streaming chunks...")

                    chunk_count = 0
                    async for chunk in response:
                        chunk_count += 1

                        # Debug: Log chunk details
                        print(f"[LiteLLM Proxy] Chunk #{chunk_count}")
                        print(f"[LiteLLM Proxy]   Type: {type(chunk)}")
                        print(f"[LiteLLM Proxy]   Has model_dump_json: {hasattr(chunk, 'model_dump_json')}")
                        print(f"[LiteLLM Proxy]   Has json: {hasattr(chunk, 'json')}")
                        print(f"[LiteLLM Proxy]   Has model_dump: {hasattr(chunk, 'model_dump')}")
                        print(f"[LiteLLM Proxy]   Has dict: {hasattr(chunk, 'dict')}")

                        try:
                            # Forward raw chunk in SSE format
                            if hasattr(chunk, "model_dump_json"):
                                # Pydantic model
                                print(f"[LiteLLM Proxy]   Using model_dump_json()")
                                json_str = chunk.model_dump_json()
                                print(f"[LiteLLM Proxy]   JSON length: {len(json_str)}")
                                yield f"data: {json_str}\n\n"
                            elif hasattr(chunk, "json"):
                                # Dict-like with json method
                                print(f"[LiteLLM Proxy]   Using json()")
                                json_str = chunk.json()
                                print(f"[LiteLLM Proxy]   JSON length: {len(json_str)}")
                                yield f"data: {json_str}\n\n"
                            elif hasattr(chunk, "model_dump"):
                                # Pydantic v2 model
                                print(f"[LiteLLM Proxy]   Using model_dump()")
                                chunk_dict = chunk.model_dump()
                                print(f"[LiteLLM Proxy]   Dict keys: {chunk_dict.keys()}")
                                json_str = json.dumps(chunk_dict)
                                print(f"[LiteLLM Proxy]   JSON length: {len(json_str)}")
                                yield f"data: {json_str}\n\n"
                            elif hasattr(chunk, "dict"):
                                # Pydantic v1 model
                                print(f"[LiteLLM Proxy]   Using dict()")
                                chunk_dict = chunk.dict()
                                print(f"[LiteLLM Proxy]   Dict keys: {chunk_dict.keys()}")
                                json_str = json.dumps(chunk_dict)
                                print(f"[LiteLLM Proxy]   JSON length: {len(json_str)}")
                                yield f"data: {json_str}\n\n"
                            else:
                                # Plain dict or unknown type
                                print(f"[LiteLLM Proxy]   Attempting json.dumps() on raw chunk")
                                print(f"[LiteLLM Proxy]   Raw chunk: {chunk}")
                                json_str = json.dumps(chunk)
                                print(f"[LiteLLM Proxy]   JSON length: {len(json_str)}")
                                yield f"data: {json_str}\n\n"
                        except Exception as chunk_error:
                            print(f"[LiteLLM Proxy]   ERROR serializing chunk: {type(chunk_error).__name__}: {str(chunk_error)}")
                            print(f"[LiteLLM Proxy]   Chunk repr: {repr(chunk)}")
                            if isinstance(chunk, dict):
                                print(f"[LiteLLM Proxy]   Chunk keys: {chunk.keys()}")
                                for key, value in chunk.items():
                                    print(f"[LiteLLM Proxy]     {key}: {type(value)} = {repr(value)[:100]}")
                            raise

                    print(f"[LiteLLM Proxy] Streaming completed, sent {chunk_count} chunks")

                except Exception as e:
                    print(f"[LiteLLM Proxy] ERROR in streaming: {type(e).__name__}: {str(e)}")
                    error_data = {
                        "error": {"message": str(e), "type": type(e).__name__}
                    }
                    yield f"data: {json.dumps(error_data)}\n\n"

            return StreamingResponse(
                generate_stream(),
                media_type="text/event-stream",
            )
        else:
            # Non-streaming response
            print("[LiteLLM Proxy] Starting non-streaming response")
            print(f"[LiteLLM Proxy] Request body keys: {body.keys()}")
            print(f"[LiteLLM Proxy] Model: {body.get('model')}")

            try:
                print("[LiteLLM Proxy] Calling litellm.litellm.anthropic.messages.acreate()")
                print(f"[LiteLLM Proxy] Full request body: {json.dumps(body, indent=2)[:500]}...")
                response = await litellm.litellm.anthropic.messages.acreate(**body)
                print(f"[LiteLLM Proxy] Response received, type: {type(response)}")
                print(f"[LiteLLM Proxy] Has model_dump: {hasattr(response, 'model_dump')}")
                print(f"[LiteLLM Proxy] Has dict: {hasattr(response, 'dict')}")

                # Convert response to dict
                if hasattr(response, "model_dump"):
                    print("[LiteLLM Proxy] Using model_dump()")
                    result = response.model_dump()
                    print(f"[LiteLLM Proxy] Result keys: {result.keys()}")
                    return result
                elif hasattr(response, "dict"):
                    print("[LiteLLM Proxy] Using dict()")
                    result = response.dict()
                    print(f"[LiteLLM Proxy] Result keys: {result.keys()}")
                    return result
                else:
                    print(f"[LiteLLM Proxy] Returning raw response: {type(response)}")
                    return response

            except Exception as e:
                print(f"[LiteLLM Proxy] ERROR in non-streaming: {type(e).__name__}: {str(e)}")
                raise HTTPException(
                    status_code=500,
                    detail={"error": {"message": str(e), "type": type(e).__name__}},
                )

    except HTTPException:
        raise
    except Exception as e:
        print(f"[LiteLLM Proxy] FATAL ERROR: {type(e).__name__}: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail={"error": {"message": str(e), "type": type(e).__name__}},
        )
