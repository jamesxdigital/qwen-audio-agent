from dataclasses import replace
from collections.abc import Mapping
from typing import Any
from uuid import uuid4

import httpx
from openai import DefaultHttpxClient
from speech_to_speech.backend_registry import LLM_BACKENDS, HandlerContext
from speech_to_speech.LLM.chat_completions_language_model import ChatCompletionsApiModelHandler
from speech_to_speech.LLM.compaction_prompt import build_compactor


class OpenCodeGoHandler(ChatCompletionsApiModelHandler):
    def warmup(self) -> None:
        self.go_session_id = str(uuid4())
        original_client = self.client
        self.client = original_client.with_options(
            default_headers={"User-Agent": "qwen-audio-agent-local-speech/1.0"},
            http_client=DefaultHttpxClient(event_hooks={"request": [self._add_session_header]}),
        )
        original_client.close()
        if self.compactor is not None:
            self.compactor = build_compactor(self._build_compaction_generate_fn())
        super().warmup()

    def _add_session_header(self, request: httpx.Request) -> None:
        # Compaction captures the client at setup; a hook also rotates its session header.
        request.headers["x-opencode-session"] = self.go_session_id

    def on_session_end(self) -> None:
        super().on_session_end()
        self.go_session_id = str(uuid4())

    def cleanup(self) -> None:
        self.client.close()
        super().cleanup()


def create_go_handler(context: HandlerContext, config: Mapping[str, Any]) -> OpenCodeGoHandler:
    return OpenCodeGoHandler(
        context.stop_event,
        queue_in=context.queue_in,
        queue_out=context.queue_out,
        setup_kwargs={
            **config,
            "cancel_scope": context.cancel_scope,
            "speculative_turns": context.speculative_turns,
        },
    )


def main() -> None:
    from speech_to_speech.cli import main as run_cli

    # The CLI has no custom-header option; register the adapter before building pipelines.
    LLM_BACKENDS["chat-completions"] = replace(
        LLM_BACKENDS["chat-completions"], create_handler=create_go_handler
    )
    run_cli()


if __name__ == "__main__":
    main()
