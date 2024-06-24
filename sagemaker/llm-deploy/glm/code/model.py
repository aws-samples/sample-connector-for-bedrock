# This is a sample, you should transfer openai request to glm format and return openai response.
# Most code from https://github.com/THUDM/GLM-4/blob/main/basic_demo/openai_api_server.py

from .openai import process_messages, parse_output_text

from djl_python import Input, Output
import os
import torch
import time
import re
from transformers import AutoTokenizer, AutoModel
from typing import Any, Dict, Tuple
import warnings
import gc
import json
from typing import List, Literal, Optional, Union
from transformers import AutoTokenizer, LogitsProcessor
from sse_starlette.sse import EventSourceResponse
from asyncio.log import logger
from vllm import SamplingParams, AsyncEngineArgs, AsyncLLMEngine

model = None
tokenizer = None
MAX_MODEL_LENGTH = 8192

