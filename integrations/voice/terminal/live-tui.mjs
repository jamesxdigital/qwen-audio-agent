import { spawn } from 'node:child_process';
import { writeFileSync, renameSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export class LiveTui {
  constructor({ directory, onStatus, open = spawn, env = process.env }) {
    this.path = join(directory, 'live-session.json');
    this.onStatus = onStatus;
    this.open = open;
    this.env = env;
    this.enabled = env.VOICE_TUI !== '0';
  }

  backend(event) {
    this.connection = { endpoint: event.endpoint, backendPid: event.pid };
    this.update();
  }

  session(event) {
    this.selected = { sessionId: event.sessionId, directory: event.directory };
    this.update();
  }

  update() {
    if (!this.enabled || !this.connection || !this.selected || this.closed) return;
    const state = {
      ...this.connection, ...this.selected, voicePid: process.pid,
      username: this.env.OPENCODE_SERVER_USERNAME,
      password: this.env.OPENCODE_SERVER_PASSWORD,
    };
    const temporary = `${this.path}.tmp`;
    writeFileSync(temporary, JSON.stringify(state), { mode: 0o600 });
    renameSync(temporary, this.path);
    if (this.opened) return;
    this.opened = true;
    const child = this.open('/usr/bin/open', [
      '-na', '/Applications/Ghostty.app', '--args',
      `--working-directory=${state.directory}`, '-e', process.execPath,
      fileURLToPath(new URL('./voice-tui.mjs', import.meta.url)), this.path,
    ], { stdio: 'ignore' });
    child.once('error', error => {
      this.opened = false;
      this.onStatus(`OpenCode live TUI could not open · ${error.code || 'unknown error'}`);
    });
    child.once('exit', code => {
      if (code === 0) this.onStatus('OpenCode live TUI · opened in Ghostty');
      else {
        this.opened = false;
        this.onStatus(`OpenCode live TUI could not open · exit ${code}`);
      }
    });
  }

  close() {
    this.closed = true;
    try { unlinkSync(this.path); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
}
