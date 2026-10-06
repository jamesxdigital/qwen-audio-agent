typeset -g QWEN_VOICE_TERMINAL_DIR="${${(%):-%x}:A:h}"

voice() (
  emulate -L zsh
  local voice_terminal_dir="$QWEN_VOICE_TERMINAL_DIR"
  local voice_repo_dir="${voice_terminal_dir:h:h:h}"
  local voice_node="$(command -v node)"
  local url="http://127.0.0.1:3101" opener lock pid i
  local voice_trace_dir voice_result voice_backend=opencode voice_permission_mode=native
  local voice_session_id
  trap '[[ -n "$opener" ]] && kill "$opener" 2>/dev/null; [[ -n "$voice_trace_dir" ]] && rm -rf -- "$voice_trace_dir"; :' EXIT
  trap 'exit 130' INT
  trap 'exit 143' TERM

  case "${1:-}" in
    pi|opencode) voice_backend="$1"; shift ;;
    -h|--help)
      print 'Usage: voice [opencode|pi] [Qwen Audio options]'
      print 'Default: OpenCode · model: opencode-go/deepseek-v4.1-flash'
      print 'Private Tailnet HTTPS is enabled while voice runs.'
      print 'Each launch starts a new conversation and coding session.'
      print 'OpenCode opens a live TUI in Ghostty on the first coding task. VOICE_TUI=0 disables it.'
      print 'Run from your project directory. VOICE_VERBOSE=1 shows full logs.'
      return 0
      ;;
  esac

  case "${1:-}" in
    ''|gateway|run|-*)
      lock="$HOME/.config/qwaudio/state/gateway.lock"
      if [[ -r "$lock" ]]; then
        pid=$(sed -n 's/.*"pid":\([0-9][0-9]*\).*/\1/p' "$lock")
        if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
          print "voice: stopping existing Gateway (pid $pid)…"
          kill "$pid" 2>/dev/null
          for i in {1..20}; do kill -0 "$pid" 2>/dev/null || break; sleep 0.25; done
        fi
      fi
      voice_session_id=$(/usr/bin/uuidgen) || return 1
      export QWEN_AUDIO_AGENT_SESSION_ID="$voice_session_id"
      (
        for i in {1..60}; do
          curl -fsS -o /dev/null --max-time 2 "$url/api/health" 2>/dev/null && { open "$url/?session=$voice_session_id"; return; }
          sleep 0.5
        done
      ) &
      opener=$!
      voice_trace_dir=$(mktemp -d "${TMPDIR:-/tmp}/voice-acp.XXXXXX") || return 1
      : > "$voice_trace_dir/events.log"
      chmod 600 "$voice_trace_dir/events.log"
      export QWEN_AUDIO_GATEWAY_TAILNET=1
      unset QWEN_AUDIO_GATEWAY_LAN
      export VOICE_BACKEND="$voice_backend"
      export AGENT_PROTOCOL="$voice_backend"
      if [[ "$voice_backend" == opencode ]]; then
        voice_permission_mode=full
        unset PI_ACP_TRACE_FILE
        export OPENCODE_BIN="$voice_terminal_dir/acp-trace.mjs"
        export OPENCODE_RUNTIME=binary
        export OPENCODE_ACP_TRACE_FILE="$voice_trace_dir/events.log"
        export OPENCODE_WORKSPACE="$PWD"
      else
        unset OPENCODE_ACP_TRACE_FILE
        export PI_ACP_BIN="$voice_terminal_dir/acp-trace.mjs"
        export PI_ACP_RUNTIME=binary
        export PI_ACP_TRACE_FILE="$voice_trace_dir/events.log"
        export PI_WORKSPACE="$PWD"
      fi
      export QWEN_AUDIO_AGENT_BACKEND_PERMISSION_MODE="$voice_permission_mode"
      QWAUDIO_WORKSPACE="$PWD" "$voice_node" "$voice_terminal_dir/voice-display.mjs" "$@" --backend "$voice_backend" --backend-permission-mode "$voice_permission_mode"
      voice_result=$?
      return $voice_result
      ;;
  esac

  QWAUDIO_WORKSPACE="$PWD" "$voice_node" "$voice_repo_dir/cli/bin/qwenaudio.mjs" "$@"
  voice_result=$?
  return $voice_result
)
