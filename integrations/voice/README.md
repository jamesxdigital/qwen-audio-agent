# James's voice setup

This fork keeps the Gateway changes, terminal launcher, and local speech service in one checkout. The speech service remains a separate process connected to the Gateway over `ws://127.0.0.1:8765/v1/realtime`.

- [`terminal/`](terminal/README.md): `voice`, ACP activity display, and the live OpenCode tab in Ghostty.
- [`local-speech/`](local-speech/README.md): local Parakeet speech recognition, Kokoro or Qwen3 speech output, and an OpenCode Go conversation adapter.

Audio is processed locally by the speech service. Transcribed text, instructions, and conversation history go to DeepSeek through OpenCode Go. Coding tasks are delegated by the Gateway to OpenCode or Pi.

## Set up this checkout

On an Apple Silicon Mac, install Node.js matching the root package's engines, npm, uv, OpenCode, Ghostty, and Tailscale. Pi additionally requires `pi-acp`. Configure backend authentication through those tools and provide `OPENCODE_API_KEY` in the environment or `~/.zshenv`.

From the repository root:

```zsh
npm ci --ignore-scripts --no-audit --no-fund
npm run build
npm link --ignore-scripts --no-audit --no-fund
./integrations/voice/local-speech/setup.sh
python3 ./integrations/voice/local-speech/install-launch-agent.py
```

The installer starts the speech service at login and restarts it if it exits. Rerun it after moving the checkout. It writes the current checkout paths to `~/Library/LaunchAgents/com.james.qwen-local-voice.plist`; logs go to `~/Library/Logs/qwen-audio-agent/local-speech/`.

Set these values in `~/.config/qwaudio/config.env` to use local speech:

```dotenv
QWEN_AUDIO_REALTIME_PROVIDER=speech-to-speech
SPEECH_TO_SPEECH_REALTIME_URL=ws://127.0.0.1:8765/v1/realtime
```

Add the absolute path to the terminal source to `~/.zshrc`, for example:

```zsh
source /Users/james/Tools/qwen-audio-agent/integrations/voice/terminal/voice.zsh
```

Source that line in existing shells, or open a new shell. Run `voice` from the project directory you want the coding backend to work in.

Python environments, model caches, logs, credentials, and temporary session files are runtime data. They are not committed or included in the npm package. Model caches keep their usual Hugging Face locations outside this repository.

## Updating the fork

`origin` is `jamesxdigital/qwen-audio-agent`; `upstream` is `QwenAudio/qwen-audio-agent`. The fork's default branch is `james/conversation-backend-sessions`, containing the local integration and session changes.

Fetch upstream releases and merge the chosen tag into this branch. Then follow the dependency, build, and session-test workflow in [`../../LOCAL_CHANGES.md`](../../LOCAL_CHANGES.md). Run the local speech setup again when its pinned requirements change. Restart the Gateway after JavaScript changes and reinstall the LaunchAgent after speech-service changes.
