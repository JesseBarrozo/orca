import { describe, expect, it, vi } from 'vitest'
import { createAutoModelPoolService } from './auto-model-pool-service'

describe('auto model pool service', () => {
  it('combines existing per-agent catalogs and applies visibility before scoring', async () => {
    const read = vi.fn(async ({ agent }: { agent: string }) => ({
      origin: 'probe' as const,
      fetchedAt: 1,
      models: [
        {
          id: agent === 'grok' ? 'fast' : 'smart',
          label: agent,
          isDefault: true,
          efforts: [],
          supportsAutoMode: true,
          contextWindowTokens: agent === 'claude' ? 200_000 : 32_000
        }
      ]
    }))
    const service = createAutoModelPoolService({
      modelCatalog: { read },
      agents: ['grok', 'claude']
    })
    const pool = await service.read({ pool: { disabledModelKeys: ['claude:smart'] } })
    expect(pool.map((candidate) => `${candidate.provider}:${candidate.modelId}`)).toEqual([
      'grok:fast'
    ])
    expect(read).toHaveBeenCalledTimes(2)
  })

  it('reads persisted visibility preferences on every pool refresh', async () => {
    const read = vi.fn(async ({ agent }: { agent: string }) => ({
      origin: 'probe' as const,
      fetchedAt: 1,
      models: [
        {
          id: 'shared',
          label: agent,
          efforts: [],
          isDefault: false,
          supportsAutoMode: true
        }
      ]
    }))
    let disabledModelKeys: readonly string[] = []
    const service = createAutoModelPoolService({
      modelCatalog: { read },
      agents: ['grok', 'claude'],
      getDisabledModelKeys: () => disabledModelKeys
    })

    expect((await service.read()).map((entry) => entry.provider)).toEqual(['claude', 'grok'])
    disabledModelKeys = ['claude:shared']
    expect((await service.read()).map((entry) => entry.provider)).toEqual(['grok'])
  })

  it('keeps Auto deterministic when no decision model is configured', async () => {
    const service = createAutoModelPoolService({
      modelCatalog: {
        read: vi.fn(async () => ({
          origin: 'probe' as const,
          fetchedAt: 1,
          models: [
            {
              id: 'fast',
              label: 'Fast',
              supportsAutoMode: true,
              isDefault: true,
              efforts: []
            }
          ]
        }))
      },
      agents: ['claude']
    })
    const pool = await service.read()

    await expect(
      service.route({ prompt: 'Summarize this file', profile: 'balanced', candidates: pool })
    ).resolves.toBe(pool[0])
  })

  it('removes providers disabled in Auto and Omni while preserving them for settings discovery', async () => {
    const read = vi.fn(async ({ agent }: { agent: string }) => ({
      origin: 'probe' as const,
      fetchedAt: 1,
      models: [
        { id: 'shared', label: agent, supportsAutoMode: true, isDefault: false, efforts: [] }
      ]
    }))
    const service = createAutoModelPoolService({
      modelCatalog: { read },
      agents: ['opencode', 'opencode2', 'grok'],
      getDisabledAgents: () => ['opencode', 'opencode2']
    })

    expect((await service.read()).map((entry) => entry.provider)).toEqual(['grok'])
    expect(
      (await service.read({ includeDisabledAgents: true })).map((entry) => entry.provider)
    ).toEqual(['grok', 'opencode2'])
  })

  it('keeps Antigravity available from its ACP bootstrap catalog when live discovery is unknown', async () => {
    const service = createAutoModelPoolService({
      modelCatalog: { read: vi.fn(async () => ({ origin: 'unknown' as const })) },
      agents: ['antigravity']
    })

    expect((await service.read()).map((entry) => entry.modelId)).toEqual([
      'gemini-3.8-flash-high',
      'gemini-3.8-flash-low',
      'gemini-3.8-flash-medium'
    ])
  })

  it('keeps Codex Astra available when model discovery omits it', async () => {
    const service = createAutoModelPoolService({
      modelCatalog: {
        read: vi.fn(async () => ({
          origin: 'probe' as const,
          fetchedAt: 1,
          models: [
            {
              id: 'gpt-5.5',
              label: 'GPT-5.5',
              supportsAutoMode: true,
              isDefault: true,
              efforts: []
            }
          ]
        }))
      },
      agents: ['codex']
    })

    expect((await service.read()).map((entry) => entry.modelId)).toEqual(['gpt-5.5', 'gpt-6-astra'])
  })

  it('applies Codex model visibility to fallback models', async () => {
    const service = createAutoModelPoolService({
      modelCatalog: { read: vi.fn(async () => ({ origin: 'unknown' as const })) },
      agents: ['codex'],
      getDisabledModelKeys: () => ['codex:gpt-6-astra']
    })

    expect((await service.read()).map((entry) => entry.modelId)).toEqual([])
  })

  it('does not expose the unsupported Codex Argon id returned by discovery', async () => {
    const service = createAutoModelPoolService({
      modelCatalog: {
        read: vi.fn(async () => ({
          origin: 'probe' as const,
          fetchedAt: 1,
          models: [
            {
              id: 'gpt-6-argon',
              label: 'GPT-6 Argon',
              supportsAutoMode: true,
              isDefault: false,
              efforts: []
            },
            {
              id: 'gpt-6-astra',
              label: 'GPT-6 Astra',
              supportsAutoMode: true,
              isDefault: true,
              efforts: []
            }
          ]
        }))
      },
      agents: ['codex']
    })

    expect((await service.read()).map((entry) => entry.modelId)).toEqual(['gpt-6-astra'])
  })
})
