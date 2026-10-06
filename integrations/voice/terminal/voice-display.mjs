#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { openSync, readSync, closeSync, watch } from 'node:fs';
import { createInterface } from 'node:readline';
import { StringDecoder } from 'node:string_decoder';
import { constants } from 'node:os';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LiveTui } from './live-tui.mjs';

const backend = process.env.VOICE_BACKEND || 'opencode';
const label = backend === 'pi' ? 'Pi' : 'OpenCode';
const model = 'opencode-go/deepseek-v4.1-flash';
if (backend === 'opencode') {
  const inline = JSON.parse(process.env.OPENCODE_CONFIG_CONTENT || '{}');
  if (!inline || Array.isArray(inline) || typeof inline !== 'object') throw new Error('OPENCODE_CONFIG_CONTENT must be a JSON object');
  process.env.OPENCODE_CONFIG_CONTENT = JSON.stringify({ ...inline, model });
  // Qwen 2.0.1 maps the shared OpenCode model override to Alibaba; OpenCode selects Go itself.
  process.env.QWEN_AUDIO_AGENT_BACKEND_MODEL = '';
  process.env.OPENCODE_MODEL = model;
} else {
  process.env.QWEN_AUDIO_AGENT_BACKEND_MODEL = model;
}

const verbose = process.env.VOICE_VERBOSE === '1';
const color = process.stdout.isTTY && !('NO_COLOR' in process.env);
const width = Math.max(30, Math.min(process.stdout.columns || 100, 120));
const paint = (code, text) => color ? `\x1b[${code}m${text}\x1b[0m` : text;
const secrets = Object.entries(process.env)
  .filter(([key, value]) => /KEY|TOKEN|SECRET|PASSWORD/i.test(key) && value.length >= 8)
  .map(([, value]) => value);
function clean(value) {
  let text = String(value ?? '').replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '').replace(/[\x00-\x08\x0b-\x1f\x7f]/g, '');
  for (const secret of secrets) text = text.split(secret).join('[redacted]');
  return text.replace(/\bsk-[A-Za-z0-9_-]{12,}/g, '[redacted]');
}
let section = '';
let column = 0;
function finish() {
  if (column) process.stdout.write('\n');
  column = 0;
  section = '';
}
function heading(kind, id = '') {
  const key = `${kind}:${id}`;
  if (section === key) return;
  finish();
  const styles = { Thinking: '2', Reply: '1;36', Tools: '1;33', Result: '2' };
  process.stdout.write(`\n${paint(styles[kind] || '1', `── ${label} · ${kind}`)}\n`);
  section = key;
}
function writeBody(text, style = '') {
  // ACP chunks can split words; keep the cursor position across chunks.
  while (text.length) {
    if (text.startsWith('\n')) {
      process.stdout.write('\n');
      column = 0;
      text = text.slice(1);
      continue;
    }
    if (column >= width - 2) {
      process.stdout.write('\n');
      column = 0;
    }
    if (!column) process.stdout.write('  ');
    const newline = text.indexOf('\n');
    let length = Math.min(text.length, width - 2 - column, newline < 0 ? Infinity : newline);
    if (length < text.length && text[length] !== '\n') {
      const space = text.lastIndexOf(' ', length - 1);
      if (space > 0) length = space + 1;
    }
    const part = text.slice(0, length);
    process.stdout.write(style ? paint(style, part) : part);
    column += length;
    text = text.slice(length);
    if (text.length && !text.startsWith('\n')) {
      process.stdout.write('\n');
      column = 0;
    }
  }
}
function status(text, style = '2') {
  finish();
  process.stdout.write(`\n  ${paint(style, text)}\n`);
}
const resultLengths = new Map();
function agent(event) {
  if (event.kind === 'backend') {
    liveTui?.backend(event);
  } else if (event.kind === 'thinking' || event.kind === 'reply') {
    heading(event.kind === 'thinking' ? 'Thinking' : 'Reply');
    writeBody(event.text, event.kind === 'thinking' ? '2' : '');
  } else if (event.kind === 'tool') {
    heading('Tools');
    const state = { pending: 'queued', in_progress: 'running', completed: 'done', failed: 'failed' }[event.status] || event.status;
    const mark = event.status === 'completed' ? '✓' : event.status === 'failed' ? '✗' : '›';
    writeBody(`${mark} ${event.text} · ${state}\n`, event.status === 'failed' ? '31' : '33');
    if (event.detail && !event.text.includes(event.detail) && !['completed', 'failed'].includes(event.status)) {
      writeBody(`  ${event.detail}\n`, '2');
    }
  } else if (event.kind === 'result') {
    const used = resultLengths.get(event.id) || { characters: 0, lines: 0, shortened: false };
    const budget = verbose ? Infinity : 2400;
    if (used.shortened) return;
    heading('Result', event.id);
    const remaining = budget - used.characters;
    let text = event.text.slice(0, remaining);
    if (!verbose) {
      const lines = text.split('\n');
      if (lines.length > 24 - used.lines) text = lines.slice(0, 24 - used.lines).join('\n');
    }
    writeBody(text);
    used.characters += text.length;
    used.lines += (text.match(/\n/g) || []).length;
    used.shortened = text.length < event.text.length || used.characters >= budget;
    resultLengths.set(event.id, used);
    if (used.shortened) writeBody('\n… result shortened · VOICE_VERBOSE=1 voice shows all output\n', '2');
  }
}
const seen = new Set();
let capacityBusy = false;
function once(key, text, style) {
  if (seen.has(key)) return;
  seen.add(key);
  status(text, style);
}
function gateway(raw) {
  const line = clean(raw);
  const match = line.match(/^\S+\s+(TRACE|DEBUG|INFO|WARN|ERROR|FATAL)\s+\S+\s+(.*)$/);
  if (!match) {
    if (/^(Gateway 已启动|WebUI：|Realtime：)/.test(line) && !verbose) return;
    if (line.trim()) status(line);
    return;
  }
  const [, level, rest] = match;
  let data = {};
  const jsonStart = rest.indexOf(' {');
  if (jsonStart >= 0) {
    try { data = JSON.parse(rest.slice(jsonStart + 1)); } catch { /* Some log records contain a human message after JSON. */ }
  }
  const event = rest.split(/[ :]/)[0];
  if (event === 'acp.coordinator_session_selected') liveTui?.session(data);
  if (verbose) { status(line, /ERROR|FATAL/.test(level) ? '31' : '2'); return; }
  if (/WARN|ERROR|FATAL/.test(level)) {
    const message = data.error?.message || data.message;
    if (data.classification === 'capacity_busy' || message?.includes('session_limit_reached')) {
      if (!capacityBusy) status('Voice · speech slot busy; waiting to reconnect. Keep one voice browser tab open.', '33');
      capacityBusy = true;
      return;
    }
    if (event === 'realtime.closed') {
      if (!capacityBusy) status('Voice · disconnected');
      seen.delete('realtime.connected');
      return;
    }
    const summary = message || (jsonStart >= 0 ? rest.slice(0, jsonStart) : rest);
    status(`${level} · ${event}${summary === event ? '' : ` · ${summary}`}`, level === 'WARN' ? '33' : '31');
    return;
  }
  if (event === 'gateway.ready') once(event, `Gateway ready · ${data.origin || 'http://127.0.0.1:3101'}`, '32');
  else if (event === 'tailnet.ready') status(`Tailnet · ${data.endpoint}`, '32');
  else if (event === 'acp.initialized') once(event, `${data.backend || label} connected · ${data.agentName || 'ACP'} ${data.agentVersion || ''}`, '32');
  else if (event === 'realtime.connected') {
    if (capacityBusy) status(`Voice reconnected · ${data.provider || 'realtime'}`, '32');
    else once(event, `Voice connected · ${data.provider || 'realtime'}`, '32');
    capacityBusy = false;
  }
  else if (event === 'voice_client.configured') status(`Microphone ${data.inputEnabled ? 'on' : 'off'} · speaker ${data.outputEnabled ? 'on' : 'off'}`);
  else if (event === 'realtime.response_started') status('Voice · responding');
  else if (event === 'realtime.response.done' && data.hasFunctionCall === false) status('Voice · replied directly');
  else if (event === 'realtime.playback.ended') status('Voice · playback finished');
  else if (/disconnect|failed|cancel|interrupt/.test(event)) status(event.replaceAll('.', ' · '));
}

process.stdout.write(`\n${paint('1;36', `VOICE  /  ${label.toUpperCase()}`)}\n`);
process.stdout.write(`  Workspace  ${clean(process.env.QWAUDIO_WORKSPACE || process.cwd())}\n`);
process.stdout.write(`  Model      ${model}\n`);
process.stdout.write(`  Permissions  ${backend === 'pi' || process.env.QWEN_AUDIO_AGENT_BACKEND_PERMISSION_MODE === 'full' ? 'Always allow' : 'Native'}\n`);
process.stdout.write(`  Browser    http://127.0.0.1:3101\n`);
process.stdout.write(`  ${paint('2', 'Ctrl+C to stop · VOICE_VERBOSE=1 voice for full logs')}\n`);

const tracePath = backend === 'pi' ? process.env.PI_ACP_TRACE_FILE : process.env.OPENCODE_ACP_TRACE_FILE;
const liveTui = backend === 'opencode' ? new LiveTui({ directory: dirname(tracePath), onStatus: text => status(text, '32') }) : null;
const fd = openSync(tracePath, 'r');
const buffer = Buffer.alloc(65536);
const decoder = new StringDecoder('utf8');
let offset = 0;
let pending = '';
function flush() {
  let count;
  while ((count = readSync(fd, buffer, 0, buffer.length, offset)) > 0) {
    offset += count;
    pending += decoder.write(buffer.subarray(0, count));
    let newline;
    while ((newline = pending.indexOf('\n')) >= 0) {
      const line = pending.slice(0, newline);
      pending = pending.slice(newline + 1);
      let event;
      try { event = JSON.parse(line); } catch { continue; }
      agent(event);
    }
  }
}
const watcher = watch(tracePath, flush);
flush();
const gatewayCommand = process.env.VOICE_QWENAUDIO_BIN || process.execPath;
const gatewayArgs = process.env.VOICE_QWENAUDIO_BIN
  ? process.argv.slice(2)
  : [fileURLToPath(new URL('../../../cli/bin/qwenaudio.mjs', import.meta.url)), ...process.argv.slice(2)];
const child = spawn(gatewayCommand, gatewayArgs, { stdio: ['inherit', 'pipe', 'pipe'] });
for (const output of [child.stdout, child.stderr]) createInterface({ input: output }).on('line', gateway);
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(signal, () => child.kill(signal));
process.stdout.on('error', error => { if (error.code === 'EPIPE') child.kill('SIGTERM'); else throw error; });
child.on('error', error => status(`Could not start Qwen Audio: ${error.code || 'unknown error'}`, '31'));
child.on('close', (code, signal) => {
  liveTui?.close();
  watcher.close();
  flush();
  closeSync(fd);
  finish();
  status(`Voice stopped${code ? ` · exit ${code}` : ''}`, code ? '31' : '2');
  process.stdout.end(() => process.exit(code ?? (signal ? 128 + (constants.signals[signal] || 0) : 1)));
});
