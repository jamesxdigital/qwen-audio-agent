#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { openSync, writeSync, closeSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { createServer } from 'node:net';

const openCode = Boolean(process.env.OPENCODE_ACP_TRACE_FILE);
const label = openCode ? 'OpenCode' : 'Pi';
const tracePath = openCode ? (process.argv[2] === 'acp' ? process.env.OPENCODE_ACP_TRACE_FILE : null) : process.env.PI_ACP_TRACE_FILE;
const trace = tracePath ? openSync(tracePath, 'a', 0o600) : null;
const secrets = Object.entries(process.env)
  .filter(([key, value]) => /KEY|TOKEN|SECRET|PASSWORD/i.test(key) && value.length >= 8)
  .map(([, value]) => value);
function clean(value) {
  let text = String(value ?? '').replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '').replace(/[\x00-\x08\x0b-\x1f\x7f]/g, '');
  for (const secret of secrets) text = text.split(secret).join('[redacted]');
  return text.replace(/\bsk-[A-Za-z0-9_-]{12,}/g, '[redacted]');
}
function show(kind, text, extra = {}) {
  if (trace === null || !text) return;
  writeSync(trace, `${JSON.stringify({ kind, text: clean(text), ...extra })}\n`);
}
const tools = new Map();
function observe(line) {
  let message;
  try { message = JSON.parse(line); } catch { return; }
  if (message.method !== 'session/update') return;
  const update = message.params?.update;
  if (!update) return;
  if (update.sessionUpdate === 'agent_thought_chunk' || update.sessionUpdate === 'agent_message_chunk') {
    if (update.content?.type === 'text') show(update.sessionUpdate === 'agent_thought_chunk' ? 'thinking' : 'reply', update.content.text);
    return;
  }
  if (!['tool_call', 'tool_call_update'].includes(update.sessionUpdate)) return;
  const previous = tools.get(update.toolCallId) || {};
  const current = { ...previous, ...update };
  tools.set(update.toolCallId, current);
  if (current.status !== previous.status || (!previous.rawInput && current.rawInput)) {
    const input = current.rawInput;
    const detail = input?.command || input?.path || input?.file_path || '';
    show('tool', current.title || current.kind || 'tool', {
      id: update.toolCallId, status: current.status || 'pending', detail: clean(detail),
    });
  }
  const terminalOutput = update._meta?.terminal_output?.data;
  if (terminalOutput) show('result', terminalOutput, { id: update.toolCallId });
  if (['completed', 'failed'].includes(update.status)) {
    const output = (update.content || []).flatMap(item => {
      if (item.type === 'content' && item.content?.type === 'text') return [item.content.text];
      if (item.type === 'diff') return [`Changed: ${item.path}`];
      return [];
    }).join('\n');
    if (output) show('result', `${output}\n`, { id: update.toolCallId });
    tools.delete(update.toolCallId);
  }
}
const binary = openCode ? (process.env.OPENCODE_ACP_REAL_BIN || '/opt/homebrew/bin/opencode') : (process.env.PI_ACP_REAL_BIN || '/opt/homebrew/bin/pi-acp');
const args = process.argv.slice(2);
let livePort;
if (openCode && trace !== null) {
  livePort = await new Promise((resolve, reject) => {
    const server = createServer();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      server.close(error => error ? reject(error) : resolve(port));
    });
  });
  args.push('--hostname', '127.0.0.1', '--port', String(livePort));
}
const child = spawn(binary, args, { stdio: ['pipe', 'pipe', 'inherit'] });
if (livePort) show('backend', 'OpenCode live server', { endpoint: `http://127.0.0.1:${livePort}`, pid: child.pid });
// ACP stdout must remain byte-for-byte unchanged; terminal output goes to a separate file.
child.stdout.pipe(process.stdout);
createInterface({ input: child.stdout }).on('line', observe);
process.stdin.pipe(child.stdin);
child.stdin.on('error', error => { if (error.code !== 'EPIPE') throw error; });
process.stdout.on('error', error => { if (error.code === 'EPIPE') child.kill('SIGTERM'); else throw error; });
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(signal, () => child.kill(signal));
child.on('error', error => { console.error(`${label} adapter could not start: ${error.code || 'unknown error'}`); process.exitCode = 1; });
child.on('close', (code, signal) => {
  if (trace !== null) { show('ended', `${label} session ended`); closeSync(trace); }
  process.exit(code ?? (signal ? 128 : 1));
});
