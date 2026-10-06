# Voice terminal

Run from your project directory:

```zsh
voice           # OpenCode (default)
voice opencode  # OpenCode explicitly
voice pi        # Pi via pi-acp
```

Both use `opencode-go/deepseek-v4.1-flash` for coding. Qwen retains the speech-to-speech provider configured in `~/.config/qwaudio/config.env`.

New terminals source `voice.zsh` from `~/.zshrc`. To reload an existing shell:

```zsh
source /Users/james/Tools/qwen-audio-agent/integrations/voice/terminal/voice.zsh
```

Starting a session replaces the existing local Qwen Gateway and opens a fresh voice conversation. The current directory becomes the backend workspace. Use Ctrl+C to stop. `VOICE_VERBOSE=1 voice` displays routine logs and full tool output.

Qwen runs directly from this checkout, based on v2.0.1. The terminal resolves the CLI and helper scripts relative to its own source; `qwenaudio` is also linked to this checkout through `npm link`. Source changes take effect after restarting the Gateway; frontend changes also require rebuilding the web UI. See that clone’s `LOCAL_CHANGES.md` for the update workflow. Its backend coordinator is scoped to the voice conversation and workspace. Clicking **New session** in WebUI (or any client that selects a new conversation ID) creates a fresh coding session on the first delegated task. Reconnecting to the same conversation resumes that conversation's coding session. Previous OpenCode sessions remain in OpenCode's history; creating a conversation does not cancel work already running.

The renderer provides thinking (when emitted by the backend), tools, results, and replies. A direct answer from the speech model does not invoke the coding backend. Ask it to delegate a coding task to the selected backend to see its activity.

## Live OpenCode window

On the first OpenCode coding task, `voice` automatically opens one dedicated Ghostty window using the documented `opencode attach` command. It attaches to the HTTP server inside the same ACP process that executes the task, with the exact native session ID and workspace. Replies and tool activity stream live into both windows. Clicking **New session** in Qwen switches that dedicated TUI to the new coding session when its first task starts. It does not open another window for each task.

Closing the dedicated window leaves voice running. Stopping `voice` stops its attached TUI. Pi does not open an OpenCode window. Use `VOICE_TUI=0 voice` to disable automatic opening for a launch.

The ACP process binds a free loopback port for its lifetime; it is separate from Qwen's managed OpenCode UI service on port 4096. The port, native session ID, and workspace are held in an owner-only temporary state file. The TUI follower watches that state and reattaches when the session changes. Server credentials, if configured, are passed privately through the environment.

## OpenCode integration

Uses the installed `/opt/homebrew/bin/opencode` through its documented `opencode acp` entry point and Qwen's native OpenCode integration. OpenCode voice sessions use Qwen’s documented `full` permission mode: file changes and commands are allowed automatically, and Gateway permission requests are automatically approved. Existing authentication, plugins, MCPs, and skills are inherited. Ordinary OpenCode sessions keep their saved permission settings. The trace adapter only copies ACP updates to a restricted temporary file; ACP stdout stays unchanged.

Qwen 2.0.1 maps its shared OpenCode model override to `alibaba-cn`. For OpenCode runs, the shared override is explicitly empty and the Go model is selected through OpenCode's documented `OPENCODE_CONFIG_CONTENT` runtime override. Existing inline config is merged. These changes are local to the voice process; saved Qwen, OpenCode, and Pi configuration is not rewritten. Restored OpenCode sessions retain their native session model, as documented by Qwen.

References:
- https://github.com/QwenAudio/qwen-audio-agent/blob/v2.0.1/docs/backends/configuration.md#opencode
- https://github.com/QwenAudio/qwen-audio-agent/blob/v2.0.1/docs/configuration/backend.md
- https://opencode.ai/docs/acp/
- https://opencode.ai/docs/config/#precedence-order

## Tailnet devices

`voice` enables Qwen’s built-in Tailnet mode. It manages a private Tailscale Serve HTTPS proxy while the Gateway runs and removes its foreground claim on exit. The local browser stays at http://127.0.0.1:3101; remote browsers use https://jamesxmacbook.taild0952b.ts.net/.

On each remote device, enable Tailscale on the same Tailnet. Create its own connection link on the Mac:

```zsh
qwenaudio gateway pair --endpoint https://jamesxmacbook.taild0952b.ts.net --name "My device"
```

Open the generated link, click Connect, and allow microphone access. Keep the Mac awake and voice running. Switching active devices may ask to take over the current client. Connection links contain private device credentials.
