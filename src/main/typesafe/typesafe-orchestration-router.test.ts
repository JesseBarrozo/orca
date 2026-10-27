import { describe, expect, it, vi } from 'vitest'
import { createTypeSafeOrchestrationRouter } from './typesafe-orchestration-router'
import type { AutoModelPoolEntry } from '../../shared/auto-model-pool'

const candidates: AutoModelPoolEntry[] = [
  { provider: 'claude', modelId: 'sonnet', label: 'Sonnet', score: 100 },
  { provider: 'codex', modelId: 'gpt-5.6-sol', label: 'GPT-5.6 Sol', score: 90 }
]

describe('TypeSafe orchestration router', () => {
  it('routes only to a candidate already present in the eligible pool', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          answers: { model: { type: 'choice', choice: 'candidate_1', confidence: 0.92 } }
        }),
        { status: 200 }
      )
    )
    const router = createTypeSafeOrchestrationRouter({
      resolveEnvironment: async () => ({ TYPESAFE_API_KEY: 'test-key' }),
      fetch: fetchMock
    })

    await expect(
      router.choose({ prompt: 'Fix the compiler error', profile: 'coding', candidates })
    ).resolves.toBe(candidates[1])
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.typesafe.ai/v1/systemone',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer test-key' })
      })
    )
  })

  it('falls back when Jev is not configured or not confident', async () => {
    const fetchMock = vi.fn<typeof fetch>()
    const router = createTypeSafeOrchestrationRouter({
      resolveEnvironment: async () => ({}),
      fetch: fetchMock
    })
    await expect(
      router.choose({ prompt: 'hello', profile: 'balanced', candidates })
    ).resolves.toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
