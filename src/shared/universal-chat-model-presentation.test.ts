import { describe, expect, it } from 'vitest'
import {
  collapseUniversalChatProviderAliases,
  isFreeOpenCodeModel,
  isOpenCodeDefaultSentinel,
  universalChatModelLabel,
  universalChatModelProviderLabel
} from './universal-chat-model-presentation'

describe('universal chat model presentation', () => {
  it('removes OpenCode transport prefixes and shows the underlying OpenAI vendor', () => {
    const model = {
      provider: 'opencode2',
      modelId: 'opencode/gpt-5.4-mini',
      label: 'OpenCode GPT 5.4 Mini'
    }
    expect(universalChatModelLabel(model)).toBe('GPT 5.4 Mini')
    expect(universalChatModelProviderLabel(model)).toBe('OpenAI by OpenCode')
  })

  it('marks OpenCode free catalog ids without changing their transport ids', () => {
    expect(isFreeOpenCodeModel('opencode2', 'opencode/beam-free')).toBe(true)
    expect(isFreeOpenCodeModel('opencode2', 'opencode/big-pickle')).toBe(true)
    expect(isFreeOpenCodeModel('opencode2', 'openai/gpt-5.6-luna')).toBe(false)
  })

  it('shows an intermediary suffix for OpenRouter model routes', () => {
    expect(
      universalChatModelProviderLabel({
        provider: 'openrouter',
        modelId: 'anthropic/claude-sonnet',
        label: 'anthropic/Claude Sonnet'
      })
    ).toBe('Anthropic by OpenRouter')
  })

  it('collapses the OpenCode and OpenCode 2 aliases in favor of OpenCode 2', () => {
    const models = [
      { provider: 'opencode', modelId: 'opencode/beam-free' },
      { provider: 'opencode2', modelId: 'opencode/beam-free' },
      { provider: 'codex', modelId: 'gpt-5.6-luna' }
    ]
    expect(collapseUniversalChatProviderAliases(models)).toEqual([
      { provider: 'opencode2', modelId: 'opencode/beam-free' },
      { provider: 'codex', modelId: 'gpt-5.6-luna' }
    ])
  })

  it('does not expose OpenCode config default as a selectable model', () => {
    expect(isOpenCodeDefaultSentinel('opencode2', 'default')).toBe(true)
    expect(isOpenCodeDefaultSentinel('opencode2', 'opencode/default')).toBe(true)
    expect(isOpenCodeDefaultSentinel('opencode2', 'opencode/beam-free')).toBe(false)
  })
})
