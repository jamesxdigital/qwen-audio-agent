# Local speech service

The service uses Hugging Face `speech-to-speech` 1.0.0 with local Parakeet STT and Kokoro TTS on Apple Silicon. Its conversation model is DeepSeek V4.1 Flash through OpenCode Go. `serve.py` adds a session header to requests and rotates it when a speech session ends, including requests made during compaction.

`requirements.txt` pins the complete dependency set from the working installation, including the English spaCy model. `setup.sh` creates a Python 3.11.16 environment with uv and synchronizes those packages. The environment is recreated at its destination; moving an existing `.venv` leaves executable paths pointing to its old location.

```zsh
./setup.sh
./start-server.sh
```

The server listens at `ws://127.0.0.1:8765/v1/realtime`. It requires `OPENCODE_API_KEY`; the launcher reads `~/.zshenv` if the key is absent from its environment and supplies it to the SDK through `OPENAI_API_KEY`. Keys are kept out of command arguments.

Default speech output is British Kokoro voice `bm_george` at speed `1.3`. Select a different voice when starting manually:

```zsh
S2S_TTS=kokoro S2S_VOICE=bm_fable S2S_SPEED=1.2 ./start-server.sh
S2S_TTS=qwen3 S2S_VOICE=Ryan ./start-server.sh
```

The MLX Metal cache is capped at 3 GiB by default; set `MLX_METAL_CACHE_LIMIT_BYTES` to change it. Initial model downloads and warmup can delay availability.

For automatic startup:

```zsh
python3 ./install-launch-agent.py
```

This replaces the LaunchAgent's paths with this checkout and restarts the service. Logs are in `~/Library/Logs/qwen-audio-agent/local-speech/`. Stop the automatic service before running another instance manually:

```zsh
launchctl bootout "gui/$(id -u)/com.james.qwen-local-voice"
```

Run the installer again to restore automatic startup. Gateway connection and shell setup are documented in [`../README.md`](../README.md).
