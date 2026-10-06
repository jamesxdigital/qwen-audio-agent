import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync, realpathSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { LiveTui } from '../live-tui.mjs';

function fixture(t, env = {}) {
  const directory = mkdtempSync(join(tmpdir(), "voice tab ' "));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const launches = [];
  const statuses = [];
  const tui = new LiveTui({
    directory, env,
    onStatus: message => statuses.push(message),
    open(command, args, options) {
      const child = new EventEmitter();
      child.stderr = new PassThrough();
      launches.push({ command, args, options, child });
      return child;
    },
  });
  return { tui, launches, statuses };
}

const backend = { endpoint: 'http://127.0.0.1:12345', pid: process.pid };
const session = { sessionId: 'session-one', directory: "/tmp/workspace ' with spaces" };

test('opens one native Ghostty tab and keeps session changes in private state', t => {
  const { tui, launches, statuses } = fixture(t);
  tui.session(session);
  assert.equal(launches.length, 0);
  tui.backend(backend);
  assert.equal(launches.length, 1);
  const launch = launches[0];
  assert.equal(launch.command, '/usr/bin/osascript');
  assert.deepEqual(launch.args, [
    fileURLToPath(new URL('../open-live-tab.applescript', import.meta.url)),
    process.execPath,
    fileURLToPath(new URL('../voice-tui.mjs', import.meta.url)),
    tui.path, session.directory,
  ]);
  assert.equal(statSync(tui.path).mode & 0o777, 0o600);
  launch.child.emit('exit', 0);
  assert.deepEqual(statuses, ['OpenCode live TUI · tab opened in Ghostty']);
  tui.session({ ...session, sessionId: 'session-two' });
  assert.equal(launches.length, 1);
  assert.equal(JSON.parse(readFileSync(tui.path)).sessionId, 'session-two');
  tui.close();
  assert.equal(existsSync(tui.path), false);
  tui.session({ ...session, sessionId: 'session-three' });
  assert.equal(launches.length, 1);
  assert.equal(existsSync(tui.path), false);
});

test('reports native launch failures and retries on a later selection', t => {
  const { tui, launches, statuses } = fixture(t);
  tui.backend(backend);
  tui.session(session);
  launches[0].child.stderr.write('Automation permission denied');
  launches[0].child.emit('exit', 1);
  assert.equal(tui.opened, false);
  assert.match(statuses[0], /Automation permission denied/);
  tui.session(session);
  assert.equal(launches.length, 2);
  launches[1].child.emit('error', Object.assign(new Error('not found'), { code: 'ENOENT' }));
  assert.equal(tui.opened, false);
  assert.match(statuses[1], /ENOENT/);
});

test('disabled live TUI does not create a tab or state file', t => {
  const { tui, launches } = fixture(t, { VOICE_TUI: '0' });
  tui.backend(backend);
  tui.session(session);
  assert.equal(launches.length, 0);
  assert.equal(existsSync(tui.path), false);
});

test('Ghostty macOS login wrapper runs Node with intact quoted script and state paths', { skip: process.platform !== 'darwin' }, t => {
  const directory = mkdtempSync(join(tmpdir(), "voice ' $HOME `uname` "));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const follower = join(directory, "follower ' $HOME.mjs");
  const state = join(directory, "state ' `uname`.json");
  const output = join(directory, 'result.json');
  writeFileSync(follower, `import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
writeFileSync(join(dirname(process.argv[2]), 'result.json'), JSON.stringify({ args: process.argv.slice(2), cwd: process.cwd() }));
`);
  const compiled = join(directory, 'opener.scpt');
  execFileSync('/usr/bin/osacompile', ['-o', compiled, fileURLToPath(new URL('../open-live-tab.applescript', import.meta.url))]);
  const command = execFileSync('/usr/bin/osascript', [
    '-e', `on run argv
      set opener to load script POSIX file (item 1 of argv)
      return opener's followerCommand(item 2 of argv, item 3 of argv, item 4 of argv)
    end run`,
    compiled, process.execPath, follower, state,
  ], { encoding: 'utf8' }).trim();
  execFileSync('/bin/bash', ['--noprofile', '--norc', '-c', `exec -l ${command}`], { cwd: directory });
  const result = JSON.parse(readFileSync(output));
  assert.deepEqual(result.args, [state]);
  assert.equal(result.cwd, realpathSync(directory));
});
