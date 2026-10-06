#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { readFileSync, watch } from 'node:fs';
import { dirname, basename } from 'node:path';
import { once } from 'node:events';

const path = process.argv[2];
if (!path) throw new Error('Live session state file is required');
let child;
let activeKey;
let closing = false;
let pending = Promise.resolve();

function state() {
  const value = JSON.parse(readFileSync(path, 'utf8'));
  const url = new URL(value.endpoint);
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || !url.port
    || !value.sessionId || !value.directory || !Number.isInteger(value.voicePid)
    || !Number.isInteger(value.backendPid)) throw new Error('Invalid live session state');
  process.kill(value.voicePid, 0);
  process.kill(value.backendPid, 0);
  return value;
}

async function stopChild() {
  const previous = child;
  child = null;
  if (!previous?.pid || previous.exitCode !== null || previous.signalCode !== null) return;
  const exited = once(previous, 'exit');
  previous.kill('SIGTERM');
  const timeout = setTimeout(() => previous.kill('SIGKILL'), 3000);
  try { await exited; } finally { clearTimeout(timeout); }
}

async function shutdown() {
  if (closing) return;
  closing = true;
  watcher.close();
  clearInterval(timer);
  await stopChild();
  process.exit(0);
}

async function reconcile() {
  if (closing) return;
  let current;
  try { current = state(); } catch { await shutdown(); return; }
  const key = JSON.stringify([current.endpoint, current.sessionId, current.directory]);
  if (key === activeKey) return;
  await stopChild();
  if (closing) return;
  activeKey = key;
  child = spawn(process.env.VOICE_OPENCODE_BIN || '/opt/homebrew/bin/opencode', [
    'attach', current.endpoint, '--dir', current.directory, '--session', current.sessionId,
  ], {
    cwd: current.directory, stdio: 'inherit',
    env: {
      ...process.env,
      ...(current.username ? { OPENCODE_SERVER_USERNAME: current.username } : {}),
      ...(current.password ? { OPENCODE_SERVER_PASSWORD: current.password } : {}),
    },
  });
  const launched = child;
  child.once('error', error => {
    console.error(`OpenCode live TUI could not start · ${error.code || 'unknown error'}`);
    void shutdown();
  });
  child.once('exit', () => { if (child === launched) void shutdown(); });
}

let watcher;
try {
  watcher = watch(dirname(path), (_event, filename) => {
    if (String(filename) === basename(path)) pending = pending.then(reconcile).catch(shutdown);
  });
} catch (error) {
  if (error.code === 'ENOENT') process.exit(0);
  throw error;
}
const timer = setInterval(() => { try { state(); } catch { void shutdown(); } }, 1000);
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(signal, () => { void shutdown(); });
pending = pending.then(reconcile).catch(shutdown);
