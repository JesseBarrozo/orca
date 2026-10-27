import { describe, expect, it } from 'vitest'
import {
  filterEnabledNativeChatModels,
  isNativeChatModelEnabled,
  nativeChatModelKey,
  setNativeChatModelEnabled
} from './native-chat-model-availability'

const models = [
  { id: 'fast', label: 'Fast', options: [] },
  { id: 'smart', label: 'Smart', options: [] }
]

describe('native chat model availability', () => {
  it('enables models by default and persists only disabled keys', () => {
    expect(nativeChatModelKey('codex', 'fast')).toBe('codex:fast')
    expect(isNativeChatModelEnabled(undefined, 'codex', 'fast')).toBe(true)
    expect(setNativeChatModelEnabled(undefined, 'codex', 'fast', false)).toEqual(['codex:fast'])
    expect(setNativeChatModelEnabled(['codex:fast'], 'codex', 'fast', true)).toEqual([])
  })

  it('filters only the selected agent models', () => {
    expect(filterEnabledNativeChatModels(models, ['codex:fast'], 'codex').map((m) => m.id)).toEqual(
      ['smart']
    )
    expect(filterEnabledNativeChatModels(models, ['claude:fast'], 'codex')).toHaveLength(2)
  })

  it('matches provider-qualified model ids to their stable catalog setting', () => {
    expect(isNativeChatModelEnabled(['claude:fable'], 'claude', 'fable[1m]')).toBe(false)
    expect(isNativeChatModelEnabled(['claude:fable'], 'claude', 'claude-fable-5-1')).toBe(false)
    expect(isNativeChatModelEnabled(['claude:fable'], 'claude', 'sonnet')).toBe(true)
  })
})
