# James's Qwen Audio Agent build

Based on upstream `v2.0.1`, branch `james/conversation-backend-sessions`.

Backend work carries the frontend conversation ID. ACP coordinator sessions, their MCP registrations, and cancellation reconciliation are scoped to owner, backend, conversation, and workspace. A new frontend conversation creates a new native coding session on its first delegated task. Reconnecting to the same conversation restores its native coding session. Existing native session history is preserved. Starting a new conversation does not cancel accepted work.

The web **New session** button also updates the URL's `session` parameter, so a reload retains the new conversation. The shell launcher in `/Users/james/tools/qwen-voice-terminal/voice.zsh` opens each launch with a fresh conversation ID.

The global `qwenaudio` executable is linked directly to this checkout using `npm link`. Both `voice` and `qwenaudio` run this source tree; there is no separate installed copy to synchronize. This is a local clone and branch, not a published GitHub fork. Installing an upstream global npm release replaces the link. To update, merge an upstream release into this branch, review changes, install its dependencies, run the relevant session tests, and rebuild the web UI:

```zsh
cd /Users/james/tools/qwen-audio-agent
npm ci --ignore-scripts --no-audit --no-fund
npm run build
AGENT_PROTOCOL=opencode QWEN_AUDIO_AGENT_BACKEND_PERMISSION_MODE=native node --test server/test/conversation-backend-session.test.mjs server/test/backend-work-runtime.test.mjs server/test/acp-backend-adapter.test.mjs server/test/acp-backend-port.test.mjs server/test/acp-session-tools.test.mjs server/test/task-operations.test.mjs server/test/agent-client-selection.test.mjs
npm link --ignore-scripts --no-audit --no-fund
```

Linking only needs to be repeated if the command link is replaced. Restart the Gateway after source changes; rebuild the web UI after frontend changes. Saved Qwen, OpenCode, and Pi configuration files are not edited by this change.
