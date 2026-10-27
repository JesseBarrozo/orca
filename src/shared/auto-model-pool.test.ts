import { describe, expect, it } from 'vitest'
import { buildAutoModelPool, selectAutoModelCandidate } from './auto-model-pool'

const candidates = [
  {
    provider: 'codex',
    modelId: 'fast',
    label: 'Fast',
    availability: 'available' as const,
    latencyMs: 500,
    inputCost: 0.01,
    outputCost: 0.02,
    qualityScore: 55,
    reliabilityScore: 80
  },
  {
    provider: 'claude',
    modelId: 'smart',
    label: 'Smart',
    availability: 'available' as const,
    latencyMs: 1800,
    inputCost: 0.04,
    outputCost: 0.08,
    qualityScore: 95,
    reliabilityScore: 90
  },
  {
    provider: 'offline',
    modelId: 'local',
    label: 'Local',
    capabilities: ['offline'],
    availability: 'available' as const,
    qualityScore: 50,
    reliabilityScore: 100
  }
]

describe('auto model pool', () => {
  it('removes disabled models before scoring and fallback', () => {
    expect(
      selectAutoModelCandidate(candidates, { disabledModelKeys: ['claude:smart'] })?.modelId
    ).toBe('fast')
  })

  it('supports profile-specific selection without allowing unavailable models', () => {
    expect(selectAutoModelCandidate(candidates, { profile: 'intelligence' })?.modelId).toBe('smart')
    expect(selectAutoModelCandidate(candidates, { profile: 'offline' })?.modelId).toBe('local')
    expect(
      selectAutoModelCandidate(
        candidates.map((candidate) =>
          candidate.modelId === 'fast' ? { ...candidate, capabilities: ['coding'] } : candidate
        ),
        { profile: 'coding' }
      )?.modelId
    ).toBe('fast')
    expect(
      buildAutoModelPool(
        candidates.map((candidate) =>
          candidate.modelId === 'smart'
            ? { ...candidate, availability: 'unavailable' as const }
            : candidate
        ),
        { profile: 'intelligence' }
      ).map((candidate) => candidate.modelId)
    ).not.toContain('smart')
  })
})
