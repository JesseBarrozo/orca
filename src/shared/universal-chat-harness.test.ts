import { describe, expect, it } from 'vitest'
import {
  isUniversalChatHarness,
  normalizeUniversalChatHarness,
  UNIVERSAL_CHAT_HARNESSES
} from './universal-chat-harness'
import { UniversalChatSelectParams } from './rpc-contract/universal-chat-params'

describe('Omni harness selection', () => {
  it('accepts Auto and every structured harness exposed by the picker', () => {
    expect(isUniversalChatHarness('auto')).toBe(true)
    for (const harness of UNIVERSAL_CHAT_HARNESSES) {
      expect(isUniversalChatHarness(harness)).toBe(true)
      expect(
        UniversalChatSelectParams.safeParse({
          sessionId: 'session',
          selection: { mode: 'auto', harness }
        }).success
      ).toBe(true)
    }
  })

  it('normalizes unknown persisted values to Auto', () => {
    expect(normalizeUniversalChatHarness('continue')).toBe('auto')
    expect(normalizeUniversalChatHarness(undefined)).toBe('auto')
  })

  it('keeps model provider and harness independent in the RPC contract', () => {
    expect(
      UniversalChatSelectParams.safeParse({
        sessionId: 'session',
        selection: {
          mode: 'model',
          provider: 'codex',
          modelId: 'gpt-5.6-sol',
          harness: 'claude'
        }
      }).success
    ).toBe(true)
  })
})
