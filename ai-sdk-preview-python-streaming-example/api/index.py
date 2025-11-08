import os
from typing import List
from pydantic import BaseModel
from dotenv import load_dotenv
from fastapi import FastAPI, Query, Request as FastAPIRequest
from fastapi.responses import StreamingResponse
from openai import OpenAI
from .utils.prompt import ClientMessage, convert_to_openai_messages
from .utils.stream import patch_response_with_headers, stream_text
from .utils.tools import AVAILABLE_TOOLS, TOOL_DEFINITIONS
from vercel import oidc
from vercel.headers import set_headers


load_dotenv(".env.local")

app = FastAPI()


@app.middleware("http")
async def _vercel_set_headers(request: FastAPIRequest, call_next):
    set_headers(dict(request.headers))
    return await call_next(request)


def get_openai_client():
    """Get OpenAI client with appropriate configuration for environment."""
    # Check if running in Vercel environment
    if os.environ.get("VERCEL"):
        # Use Vercel AI Gateway with OIDC token
        return OpenAI(
            api_key=oidc.get_vercel_oidc_token(),
            base_url="https://ai-gateway.vercel.sh/v1"
        ), "gpt-4o"

    # For local development, prefer OpenRouter
    openrouter_key = os.environ.get("OPENROUTER_API_KEY")
    if openrouter_key:
        # OpenRouter uses model prefixes like "openai/gpt-4o"
        model = os.environ.get("MODEL_NAME", "openai/gpt-4o")
        return OpenAI(
            api_key=openrouter_key,
            base_url="https://openrouter.ai/api/v1"
        ), model

    # Fallback to regular OpenAI
    openai_key = os.environ.get("OPENAI_API_KEY")
    if openai_key:
        model = os.environ.get("MODEL_NAME", "gpt-4o")
        return OpenAI(api_key=openai_key), model

    raise ValueError(
        "No API key found. Please set OPENROUTER_API_KEY, OPENAI_API_KEY in .env.local, "
        "or deploy to Vercel for OIDC authentication."
    )


class Request(BaseModel):
    messages: List[ClientMessage]


@app.post("/api/chat")
async def handle_chat_data(request: Request, protocol: str = Query('data')):
    messages = request.messages
    openai_messages = convert_to_openai_messages(messages)

    client, model = get_openai_client()
    response = StreamingResponse(
        stream_text(client, openai_messages, TOOL_DEFINITIONS, AVAILABLE_TOOLS, protocol, model),
        media_type="text/event-stream",
    )
    return patch_response_with_headers(response, protocol)
