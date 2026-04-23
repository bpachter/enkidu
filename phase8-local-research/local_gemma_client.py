"""Local Ollama/Gemma JSON client for phase 8 pipelines."""

from __future__ import annotations

import json
import os
import re
from typing import Any

import requests


class LocalGemmaClient:
    def __init__(self, model: str | None = None, base_url: str | None = None) -> None:
        self.model = model or os.environ.get("OLLAMA_MODEL", "gemma4:26b")
        self.base_url = (
            base_url
            or os.environ.get("OLLAMA_URL")
            or os.environ.get("OLLAMA_HOST")
            or "http://localhost:11434"
        ).rstrip("/")

    @staticmethod
    def _extract_json_block(text: str) -> str:
        cleaned = text.strip()
        cleaned = re.sub(r"^```(?:json)?\\s*", "", cleaned, flags=re.MULTILINE)
        cleaned = re.sub(r"\\s*```$", "", cleaned, flags=re.MULTILINE).strip()

        if cleaned.startswith("{") or cleaned.startswith("["):
            return cleaned

        match = re.search(r"(\{.*\}|\[.*\])", cleaned, re.DOTALL)
        if match:
            return match.group(1)
        return cleaned

    def chat_text(self, system_prompt: str, user_prompt: str, options: dict[str, Any] | None = None) -> str:
        payload: dict[str, Any] = {
            "model": self.model,
            "stream": False,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
        }
        if options:
            payload["options"] = options

        response = requests.post(
            f"{self.base_url}/api/chat",
            json=payload,
            timeout=(120, 300),
        )
        response.raise_for_status()
        data = response.json()
        return str(data.get("message", {}).get("content", "")).strip()

    def chat_json(self, system_prompt: str, user_prompt: str, options: dict[str, Any] | None = None) -> dict[str, Any]:
        raw = self.chat_text(system_prompt=system_prompt, user_prompt=user_prompt, options=options)
        block = self._extract_json_block(raw)
        try:
            parsed = json.loads(block)
        except json.JSONDecodeError as exc:
            raise ValueError(f"Model did not return valid JSON. Raw head: {raw[:300]}") from exc

        if isinstance(parsed, dict):
            return parsed
        return {"items": parsed}
