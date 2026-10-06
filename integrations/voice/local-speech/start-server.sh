#!/bin/zsh
set -eu

# Local voice service: Parakeet (STT) + TTS run locally. The conversational
# "brain" is DeepSeek V4.1 Flash via OpenCode Go (cloud); mic audio never leaves the
# machine, only transcribed text does.
#
# TTS is selectable with env vars so a voice can be pinned without editing this
# file. Defaults suit an English-only user who wants a brisk pace.
#   S2S_TTS=kokoro S2S_VOICE=bm_george S2S_SPEED=1.3 ./start-server.sh  # default
#   S2S_TTS=qwen3  S2S_VOICE=Ryan ./start-server.sh                     # slower, more expressive
# English Kokoro voices: af_heart, af_bella, af_nicole, am_michael, am_onyx,
#   bf_emma, bf_alice, bm_george, bm_fable. Lang: a=American, b=British.
#
export HF_HUB_DISABLE_XET=1

# MLX defaults its Metal cache to the full device memory, which makes this
# process grow to ~18 GB and push the machine into swap. Cap it at 3 GiB.
export MLX_METAL_CACHE_LIMIT_BYTES="${MLX_METAL_CACHE_LIMIT_BYTES:-3221225472}"
if [ -z "${OPENCODE_API_KEY:-}" ] && [ -f "$HOME/.zshenv" ]; then
  source "$HOME/.zshenv"
fi
if [ -z "${OPENCODE_API_KEY:-}" ]; then
  echo "OPENCODE_API_KEY is not set" >&2
  exit 1
fi

# The OpenAI SDK reads OPENAI_API_KEY when --responses_api_api_key is omitted,
# which keeps the key out of argv (and therefore out of `ps`).
export OPENAI_API_KEY="$OPENCODE_API_KEY"

tts="${S2S_TTS:-kokoro}"
case "$tts" in
  kokoro)
    tts_args=(--tts kokoro
              --kokoro_voice "${S2S_VOICE:-bm_george}"
              --kokoro_lang_code "${S2S_LANG:-b}"
              --kokoro_speed "${S2S_SPEED:-1.3}") ;;
  qwen3)
    tts_args=(--tts qwen3 --qwen3_tts_speaker "${S2S_VOICE:-Ryan}") ;;
  *)
    echo "Unknown S2S_TTS '$tts' (expected kokoro or qwen3)" >&2
    exit 1 ;;
esac

server_dir="${0:A:h}"
exec "$server_dir/.venv/bin/python" "$server_dir/serve.py" serve \
  --mac-optimal-settings \
  --llm_backend chat-completions \
  --model_name deepseek-v4.1-flash \
  --responses_api_base_url https://opencode.ai/zen/go/v1 \
  "${tts_args[@]}"
