# James's Qwen Audio Agent build

Based on upstream `v2.0.1`, branch `james/conversation-backend-sessions`, in [James's fork](https://github.com/jamesxdigital/qwen-audio-agent). `origin` points to this fork; `upstream` points to `QwenAudio/qwen-audio-agent`.

Backend work carries the frontend conversation ID. ACP coordinator sessions, their MCP registrations, and cancellation reconciliation are scoped to owner, backend, conversation, and workspace. A new frontend conversation creates a new native coding session on its first delegated task. Reconnecting to the same conversation restores its native coding session. Existing native session history is preserved. Starting a new conversation does not cancel accepted work.

The web **New session** button also updates the URL's `session` parameter, so a reload retains the new conversation. The shell launcher in `integrations/voice/terminal/voice.zsh` opens each launch with a fresh conversation ID.

The ACP adapter emits `acp.coordinator_session_selected` after creating or restoring a coordinator. The voice terminal uses this event to follow the selected native session in a dedicated Ghostty tab. Ghostty’s native AppleScript API creates the tab with one quoted follower command. Its trace wrapper binds the OpenCode ACP process's own HTTP server to a free loopback port; the TUI attaches to that server, rather than the separate managed UI service. The live tab is optional with `VOICE_TUI=0` and does not apply to Pi.

The global `qwenaudio` executable is linked directly to this checkout using `npm link`. Both `voice` and `qwenaudio` run this source tree; there is no separate installed copy to synchronize. The terminal helpers and local speech adapter are versioned in `integrations/voice/`; see its [setup guide](integrations/voice/README.md). The Python environment is recreated with pinned requirements, and its LaunchAgent resolves paths from this checkout. Logs and model caches remain outside the repository. Installing an upstream global npm release replaces the link. To update, fetch `upstream` and merge an upstream release into this branch, review changes, install its dependencies, run the relevant session tests, and rebuild the web UI:

```zsh
cd /Users/james/Tools/qwen-audio-agent
npm ci --ignore-scripts --no-audit --no-fund
npm run build
AGENT_PROTOCOL=opencode QWEN_AUDIO_AGENT_BACKEND_PERMISSION_MODE=native node --test server/test/conversation-backend-session.test.mjs server/test/backend-work-runtime.test.mjs server/test/acp-backend-adapter.test.mjs server/test/acp-backend-port.test.mjs server/test/acp-session-tools.test.mjs server/test/task-operations.test.mjs server/test/agent-client-selection.test.mjs
npm link --ignore-scripts --no-audit --no-fund
```

Linking only needs to be repeated if the command link is replaced. Restart the Gateway after source changes; rebuild the web UI after frontend changes. Saved Qwen, OpenCode, and Pi configuration files are not edited by this change.
