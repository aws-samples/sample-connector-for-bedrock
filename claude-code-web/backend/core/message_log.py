"""Log-safe descriptions of user messages.

A structured user message can carry pasted images as base64 content blocks. Logs
describe such a message by its block types and byte sizes only, never its data or text.
"""

import json
from typing import Any


def _size(value: Any) -> int:
    """Return the UTF-8 size of a string, or of the JSON form of anything else."""
    if isinstance(value, str):
        return len(value.encode("utf-8"))
    return len(json.dumps(value, default=str).encode("utf-8"))


def _describe_block(block: Any) -> str:
    if isinstance(block, str):
        return f"text({_size(block)} bytes)"
    if not isinstance(block, dict):
        return type(block).__name__
    block_type = block.get("type", "unknown")
    if block_type == "text":
        return f"text({_size(block.get('text', ''))} bytes)"
    source = block.get("source")
    if block_type == "image" and isinstance(source, dict):
        return f"image({_size(source.get('data', ''))} bytes)"
    return f"{block_type}({_size(block)} bytes)"


def summarize_message(message: Any) -> str:
    """Describe a user message for logs by block types and byte sizes.

    Example: ``role=user content=[image(1398104 bytes), text(12 bytes)]``.
    """
    if isinstance(message, str):
        return f"str({_size(message)} bytes)"
    if not isinstance(message, dict):
        return type(message).__name__
    role = str(message.get("role", "unknown"))[:32]
    content = message.get("content")
    if isinstance(content, list):
        return f"role={role} content=[{', '.join(_describe_block(b) for b in content)}]"
    if content is None:
        return f"role={role} content=none"
    return f"role={role} content={_describe_block(content)}"
