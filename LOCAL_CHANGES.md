# James's Qwen Audio Agent build

Based on upstream `v2.0.1`, branch `james/conversation-backend-sessions`.

Backend work carries the frontend conversation ID. ACP coordinator sessions, their MCP registrations, and cancellation reconciliation are scoped to owner, backend, conversation, and workspace. A new frontend conversation creates a new native coding session on its first delegated task. Reconnecting to the same conversation restores its native coding session. Existing native session history is preserved. Starting a new conversation does not cancel accepted work.

The web **New session** button also updates the URL's `session` parameter, so a reload retains the new conversation. The shell launcher in `/Users/james/tools/qwen-voice-terminal/voice.zsh` opens each launch with a fresh conversation ID.

The global `qwenaudio` executable uses a package built from this checkout. Installing an upstream npm release replaces these local changes. To update, merge an upstream release into this branch, review changes, run the relevant session tests, build, then install a new package:

```zsh
cd /Users/james/tools/qwen-audio-agent
npm ci --ignore-scripts --no-audit --no-fund
npm run build
AGENT_PROTOCOL=opencode QWEN_AUDIO_AGENT_BACKEND_PERMISSION_MODE=native node --test server/test/conversation-backend-session.test.mjs server/test/backend-work-runtime.test.mjs server/test/acp-backend-adapter.test.mjs server/test/acp-backend-port.test.mjs server/test/acp-session-tools.test.mjs server/test/task-operations.test.mjs server/test/agent-client-selection.test.mjs
npm pack --ignore-scripts --pack-destination /tmp
npm install -g --ignore-scripts --no-audit --no-fund /tmp/qwen-audio-agent-2.0.1.tgz
```

Use the tarball filename printed by `npm pack` if the version changes. Restart the Gateway to load an installed build. Saved Qwen, OpenCode, and Pi configuration files are not edited by this change.
