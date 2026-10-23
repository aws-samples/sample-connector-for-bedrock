"""Defaults for the user's ~/.claude/settings.json."""

import json
import logging
import os
import re
import tempfile

from .paths import claude_dir

logger = logging.getLogger(__name__)

DEFAULTS = {"skipWebFetchPreflight": True}


def _detect_indent(text: str):
    """Indent of the first indented line; None for a single-line file; 2 spaces otherwise."""
    m = re.search(r"\n([ \t]+)\S", text)
    if m:
        return m.group(1)
    return 2 if "\n" in text.strip() else None


def apply_default_user_settings() -> None:
    """Add missing default keys to settings.json; existing keys are never changed.

    Keys, values and key order are preserved and non-ASCII text stays literal UTF-8.
    Whitespace may be normalised (the detected indent is reused, but the file is
    re-serialised). An unreadable file is left as it is.
    """
    path = claude_dir() / "settings.json"
    settings: dict = {}
    indent = 2
    if path.exists():
        try:
            text = path.read_text(encoding="utf-8")
            loaded = json.loads(text)
        except (OSError, ValueError) as e:
            logger.warning("Leaving %s unchanged, cannot read it: %s", path, e)
            return
        if not isinstance(loaded, dict):
            logger.warning("Leaving %s unchanged, it is not a JSON object", path)
            return
        settings = loaded
        indent = _detect_indent(text)

    missing = {k: v for k, v in DEFAULTS.items() if k not in settings}
    if not missing:
        return
    settings.update(missing)

    tmp_name = None
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        fd, tmp_name = tempfile.mkstemp(dir=path.parent, prefix=".settings.", suffix=".tmp")
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(settings, f, indent=indent, ensure_ascii=False)
            f.write("\n")
        if path.exists():
            os.chmod(tmp_name, path.stat().st_mode & 0o777)
        os.replace(tmp_name, path)
        tmp_name = None
    except OSError as e:
        logger.warning("Could not update %s: %s", path, e)
    finally:
        if tmp_name:
            try:
                os.unlink(tmp_name)
            except OSError:
                pass
