#!/bin/zsh
set -eu

server_dir="${0:A:h}"
if [[ ! -x "$server_dir/.venv/bin/python" ]]; then
  uv venv --python 3.11.16 "$server_dir/.venv"
fi
uv pip sync --python "$server_dir/.venv/bin/python" "$server_dir/requirements.txt"
