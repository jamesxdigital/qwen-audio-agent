import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { BackendWorkRuntime } from '../src/backend/backend-work-runtime.mjs'
import { AcpBackendAdapter } from '../src/backend/adapters/acp/backend-adapter.mjs'
import { coordinatorKey } from '../src/backend/adapters/acp/backend-session-utils.mjs'

function fixture(statePath) {
  const sessions = new Map()
  const calls = []
  const client = {
    async start() { return { agentCapabilities: { sessionCapabilities: { resume: {} } } } },
    async newSession(options) {
      const session = { sessionId: `coding-${sessions.size + 1}`, cwd: options.cwd, response: {} }
      sessions.set(session.sessionId, { ...session, prompts: [] })
      calls.push(['new', session.sessionId])
      return session
    },
    async resumeSession(sessionId) {
      calls.push(['resume', sessionId])
      return { ...sessions.get(sessionId) }
    },
    async prompt(sessionId, prompt) {
      sessions.get(sessionId).prompts.push(prompt)
      return { content: 'Done', response: { stopReason: 'end_turn' } }
    },
    async close() {},
  }
  function create(directory = '/project') {
    return new AcpBackendAdapter({
      protocol: 'opencode', directory, client, sessionStatePath: statePath, builtinMcp: [],
      profile: {
        label: 'OpenCode', capabilities: {}, acpConnection: { kind: 'process' },
        externalMcp: false, sessionMcp: false,
        uiUrl: ({ sessionId }) => sessionId,
      },
    })
  }
  return { create, sessions, calls }
}

test('new frontend conversations get fresh coding context; reconnects resume their own context', async () => {
  const temp = mkdtempSync(join(tmpdir(), 'qwen-conversation-test-'))
  const { create, sessions, calls } = fixture(join(temp, 'sessions.json'))
  let backend = create()
  let runtime = new BackendWorkRuntime({ backend })
  let task = 0
  const run = (sessionId, instruction, ownerId = 'james') => runtime.run({ instruction }, {
    ownerId, sessionId, taskId: `task-${++task}`,
  })
  try {
    await run('voice-one', 'Remember the first task')
    await run('voice-one', 'Continue the first task')
    await run('voice-two', 'Start with empty coding context')
    assert.equal(sessions.size, 2)
    assert.equal(sessions.get('coding-1').prompts.length, 2)
    assert.equal(sessions.get('coding-2').prompts.length, 1)
    assert.doesNotMatch(sessions.get('coding-2').prompts[0], /Remember the first task/)
    assert.equal(await backend.uiUrl('james', 'voice-one'), 'coding-1')
    assert.equal(await backend.uiUrl('james', 'voice-two'), 'coding-2')

    await backend.close()
    backend = create()
    runtime = new BackendWorkRuntime({ backend })
    await run('voice-one', 'Reconnect to the original conversation')
    assert.equal(sessions.size, 2)
    assert.equal(sessions.get('coding-1').prompts.length, 3)
    assert.deepEqual(calls.at(-1), ['resume', 'coding-1'])

    await run('voice-three', 'Another new conversation')
    assert.equal(sessions.size, 3)
    await run('voice-one', 'Another owner', 'someone-else')
    assert.equal(sessions.size, 4)

    await backend.close()
    backend = create('/different-project')
    runtime = new BackendWorkRuntime({ backend })
    await run('voice-one', 'Use the current workspace')
    assert.equal(sessions.size, 5)
    assert.equal(sessions.get('coding-5').cwd, '/different-project')
  } finally {
    await backend.close()
    rmSync(temp, { recursive: true, force: true })
  }
})

test('cancellation facts remain in their originating conversation', async () => {
  const { create } = fixture(null)
  const backend = create()
  backend.coordinationRuns.set('cancelled-task', {
    ownerId: 'james', conversationSessionId: 'old-conversation', sessionId: 'coding-1',
  })
  try {
    await backend.cancelWork('cancelled-task', { ownerId: 'james' })
    assert.equal(backend.registry.reconciliationsFor(
      coordinatorKey('james', 'opencode', 'old-conversation', '/project'),
    ).length, 1)
    assert.equal(backend.registry.reconciliationsFor(
      coordinatorKey('james', 'opencode', 'new-conversation', '/project'),
    ).length, 0)
  } finally {
    await backend.close()
  }
})
