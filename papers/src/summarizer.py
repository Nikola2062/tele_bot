"""Summarize a paper into three tiers via an OpenAI-compatible API (DeepSeek or OpenRouter)."""
from __future__ import annotations

import json
import logging
import os
from dataclasses import dataclass

from openai import OpenAI

from .fetcher import Paper

log = logging.getLogger(__name__)

SYSTEM_PROMPT = """You are an AI research analyst. For each paper, produce JSON with EXACTLY these three fields:

1. "short_intro": 2-3 sentences. What problem the paper tackles and what it produces. Plain prose, no jargon dump.

2. "detailed_summary": 5-7 bullet points covering the important technical content — method, key idea, datasets/benchmarks, headline numbers, limitations if mentioned. Each bullet starts with "- " and is one tight sentence.

3. "professor_explanation": Write as a friendly university professor explaining to undergraduates. Three short paragraphs:
   - The CORE CONCERN: what real problem in the world made the authors care?
   - The SOLUTION: what they did, using simple analogies a sophomore would get.
   - The RESULT: what worked, how well, and why a student should care.

Return ONLY valid JSON with those three string keys. No code fences, no preamble."""


@dataclass
class Summary:
    short_intro: str
    detailed_summary: str
    professor_explanation: str


PROVIDERS = {
    "deepseek": {
        "base_url": "https://api.deepseek.com",
        "default_model": "deepseek-chat",
        "key_env": "DEEPSEEK_API_KEY",
    },
    "openrouter": {
        "base_url": "https://openrouter.ai/api/v1",
        "default_model": "poolside/laguna-xs-2.1",
        "key_env": "OPENROUTER_API_KEY",
    },
}


def _provider_name() -> str:
    name = os.environ.get("LLM_PROVIDER", "").strip().lower()
    if name:
        if name not in PROVIDERS:
            raise RuntimeError(f"Unknown LLM_PROVIDER {name!r}; expected one of {sorted(PROVIDERS)}")
        return name
    # No explicit choice: use OpenRouter when it is the only key configured.
    if os.environ.get("OPENROUTER_API_KEY") and not os.environ.get("DEEPSEEK_API_KEY"):
        return "openrouter"
    return "deepseek"


def _client(api_key: str, provider: str) -> OpenAI:
    cfg = PROVIDERS[provider]
    # The api_key argument is the --deepseek-api-key CLI value; other providers
    # take their key from their own env var only.
    key = api_key if provider == "deepseek" else os.environ.get(cfg["key_env"], "")
    if not key:
        raise RuntimeError(f"{provider} API key is required (set ${cfg['key_env']})")
    headers = {"X-Title": "hugging-papers"} if provider == "openrouter" else None
    return OpenAI(api_key=key, base_url=cfg["base_url"], default_headers=headers)


def _resolve_model(provider: str, model: str | None) -> str:
    if model:
        return model
    if env_model := os.environ.get("LLM_MODEL"):
        return env_model
    if provider == "deepseek":
        return os.environ.get("DEEPSEEK_MODEL", "deepseek-chat")
    return PROVIDERS[provider]["default_model"]


MAX_ATTEMPTS = 3


def summarize(paper: Paper, *, api_key: str, model: str | None = None) -> Summary:
    provider = _provider_name()
    client = _client(api_key, provider)
    model = _resolve_model(provider, model)

    user_msg = (
        f"Title: {paper.title}\n\n"
        f"Authors: {', '.join(paper.authors) or 'unknown'}\n\n"
        f"Abstract:\n{paper.abstract}"
    )

    last_err: Exception | None = None
    for attempt in range(1, MAX_ATTEMPTS + 1):
        log.info("summarizing %s attempt %d/%d", paper.arxiv_id, attempt, MAX_ATTEMPTS)
        # response_format is DeepSeek-reliable; not every OpenRouter model
        # accepts it, so elsewhere we rely on the prompt + _extract_json.
        extra = {"response_format": {"type": "json_object"}} if provider == "deepseek" else {}
        resp = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_msg},
            ],
            temperature=0.4,
            max_tokens=1500,
            **extra,
        )
        raw = resp.choices[0].message.content or "{}"
        try:
            data = json.loads(_extract_json(raw))
        except json.JSONDecodeError as e:
            last_err = e
            log.warning("attempt %d: malformed JSON (%s); retrying", attempt, e)
            continue
        return Summary(
            short_intro=_as_text(data.get("short_intro")),
            detailed_summary=_as_bullets(data.get("detailed_summary")),
            professor_explanation=_as_text(data.get("professor_explanation")),
        )

    raise RuntimeError(f"{provider} returned invalid JSON after {MAX_ATTEMPTS} attempts: {last_err}")


def _extract_json(raw: str) -> str:
    """Strip code fences and any preamble/postamble around the JSON object."""
    s = raw.strip()
    if s.startswith("```"):
        # Drop opening fence (e.g. ```json) and trailing fence.
        s = s.split("\n", 1)[1] if "\n" in s else s[3:]
        if s.endswith("```"):
            s = s[:-3]
        s = s.strip()
    # If the model added wrapper text, slice to the first { ... last }.
    first = s.find("{")
    last = s.rfind("}")
    if first != -1 and last != -1 and last > first:
        s = s[first : last + 1]
    return s


def _as_text(value) -> str:
    if value is None:
        return ""
    if isinstance(value, list):
        return "\n\n".join(str(v).strip() for v in value if v)
    return str(value).strip()


def _as_bullets(value) -> str:
    """Normalize bullets whether the model returned a list or a pre-formatted string."""
    if value is None:
        return ""
    if isinstance(value, list):
        lines = []
        for item in value:
            s = str(item).strip()
            if not s:
                continue
            lines.append(s if s.startswith(("-", "•", "*")) else f"- {s}")
        return "\n".join(lines)
    return str(value).strip()
