import { describe, expect, it } from 'vitest'
import { createUniversalTerminalSessionService } from './universal-terminal-session-service'

describe('universal terminal session service', () => {
  it('queues model changes for the next turn without recreating the session', () => {
    const service = createUniversalTerminalSessionService(
      () => 42,
      () => 'session-1'
    )
    const created = service.create({
      selection: { kind: 'auto', profile: 'balanced' },
      accountScope: 'all-connected',
      workspacePath: '/workspace'
    })
    expect(service.queueCommand(created.id, '/model claude:sonnet')).toBe(true)
    expect(service.get(created.id)).toMatchObject({
      id: 'session-1',
      pendingSelection: { kind: 'manual', modelId: 'claude:sonnet' }
    })
    expect(service.resolveNextSelection(created.id, [])).toEqual({
      kind: 'manual',
      modelId: 'claude:sonnet'
    })
    expect(service.get(created.id)?.id).toBe('session-1')
  })

  it('resolves Auto through the filtered pool and supports profile commands', () => {
    const service = createUniversalTerminalSessionService(
      () => 42,
      () => 'session-2'
    )
    const created = service.create({
      selection: { kind: 'auto', profile: 'balanced' },
      accountScope: 'all-connected',
      workspacePath: '/workspace'
    })
    expect(service.queueCommand(created.id, '/profile offline')).toBe(true)
    expect(
      service.resolveNextSelection(created.id, [
        {
          provider: 'remote',
          modelId: 'smart',
          label: 'Smart',
          availability: 'available',
          qualityScore: 100
        },
        {
          provider: 'local',
          modelId: 'small',
          label: 'Small',
          capabilities: ['offline'],
          availability: 'available'
        }
      ])
    ).toEqual({ kind: 'manual', modelId: 'local:small' })
  })
})
