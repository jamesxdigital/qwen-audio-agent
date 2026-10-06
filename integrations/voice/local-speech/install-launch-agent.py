#!/usr/bin/env python3
import os
from pathlib import Path
import plistlib
import subprocess
from time import monotonic, sleep


def main() -> None:
    server_dir = Path(__file__).resolve().parent
    if not (server_dir / ".venv/bin/python").is_file():
        raise SystemExit("Run setup.sh before installing the local speech LaunchAgent")

    label = "com.james.qwen-local-voice"
    domain = f"gui/{os.getuid()}"
    agent_path = Path.home() / "Library/LaunchAgents" / f"{label}.plist"
    log_dir = Path.home() / "Library/Logs/qwen-audio-agent/local-speech"
    agent_path.parent.mkdir(parents=True, exist_ok=True)
    log_dir.mkdir(parents=True, exist_ok=True)
    config = {
        "Label": label,
        "ProgramArguments": [str(server_dir / "start-server.sh")],
        "WorkingDirectory": str(server_dir),
        "RunAtLoad": True,
        "KeepAlive": True,
        "StandardOutPath": str(log_dir / "launchd.out.log"),
        "StandardErrorPath": str(log_dir / "launchd.err.log"),
    }
    subprocess.run(["launchctl", "bootout", f"{domain}/{label}"], check=False, capture_output=True)
    with agent_path.open("wb") as agent_file:
        plistlib.dump(config, agent_file)
    # launchctl bootout can return before the old job has finished unloading.
    deadline = monotonic() + 10
    while True:
        loaded = subprocess.run(
            ["launchctl", "bootstrap", domain, str(agent_path)], capture_output=True, text=True
        )
        if loaded.returncode == 0:
            break
        if loaded.returncode != 5 or monotonic() >= deadline:
            raise SystemExit(loaded.stderr.strip() or "Could not load the local speech LaunchAgent")
        sleep(0.25)
    print(f"Installed and started {agent_path}")


if __name__ == "__main__":
    main()
