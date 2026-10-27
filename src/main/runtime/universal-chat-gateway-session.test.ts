import { afterEach, describe, expect, it } from 'vitest'
import {
  applyCodexUniversalChatGateway,
  applyOpenCodeUniversalChatGatewayEnvironment,
  applyUniversalChatGatewayEnvironment,
  registerUniversalChatGatewaySession,
  unregisterUniversalChatGatewaySession
} from './universal-chat-gateway-session'

const SESSION_ID = 'claude:universal-gateway-test'

afterEach(() => unregisterUniversalChatGatewaySession(SESSION_ID))

describe('universal chat gateway session environment', () => {
  it('only replaces Anthropic routing for the registered universal session', () => {
    registerUniversalChatGatewaySession(SESSION_ID, {
      harness: 'claude',
      provider: 'antigravity',
      baseUrl: 'http://127.0.0.1:20128',
      authToken: 'gateway-token',
      routedModelId: 'agy/gemini-3.8-flash-high',
      launchModelId: 'agy/gemini-3.8-flash-high'
    })

    expect(
      applyUniversalChatGatewayEnvironment(SESSION_ID, {
        PATH: '/bin',
        ANTHROPIC_API_KEY: 'claude-account-key'
      })
    ).toEqual({
      PATH: '/bin',
      ANTHROPIC_BASE_URL: 'http://127.0.0.1:20128',
      ANTHROPIC_AUTH_TOKEN: 'gateway-token',
      ANTHROPIC_MODEL: 'agy/gemini-3.8-flash-high',
      CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY: '1'
    })

    expect(
      applyUniversalChatGatewayEnvironment('claude:ordinary-session', {
        ANTHROPIC_API_KEY: 'claude-account-key'
      })
    ).toEqual({ ANTHROPIC_API_KEY: 'claude-account-key' })
  })

  it('injects a Responses provider into Codex without changing ordinary sessions', () => {
    registerUniversalChatGatewaySession(SESSION_ID, {
      harness: 'codex',
      provider: 'antigravity',
      baseUrl: 'http://127.0.0.1:20128',
      authToken: 'gateway-token',
      routedModelId: 'agy/gemini-3.8-flash-high',
      launchModelId: 'agy/gemini-3.8-flash-high'
    })
    const result = applyCodexUniversalChatGateway({
      sessionId: SESSION_ID,
      environment: { PATH: '/bin' },
      args: ['--quiet']
    })
    expect(result.environment).toEqual({
      PATH: '/bin',
      ORCA_UNIVERSAL_GATEWAY_TOKEN: 'gateway-token'
    })
    expect(result.args).toEqual([
      '--quiet',
      '-c',
      'model_provider="orca_universal"',
      '-c',
      'model_providers.orca_universal={name="Orca Universal",base_url="http://127.0.0.1:20128/v1",wire_api="responses",env_key="ORCA_UNIVERSAL_GATEWAY_TOKEN"}'
    ])
  })

  it('injects an OpenAI-compatible provider into OpenCode', () => {
    registerUniversalChatGatewaySession(SESSION_ID, {
      harness: 'opencode2',
      provider: 'antigravity',
      baseUrl: 'http://127.0.0.1:20128',
      authToken: 'gateway-token',
      routedModelId: 'agy/gemini-3.8-flash-high',
      launchModelId: 'orca-universal/agy/gemini-3.8-flash-high'
    })
    const result = applyOpenCodeUniversalChatGatewayEnvironment(
      SESSION_ID,
      { OPENCODE_CONFIG_CONTENT: '{"autoupdate":false}' },
      'opencode2'
    )
    expect(JSON.parse(result.OPENCODE_CONFIG_CONTENT ?? '{}')).toMatchObject({
      autoupdate: false,
      model: 'orca-universal/agy/gemini-3.8-flash-high',
      provider: {
        'orca-universal': {
          npm: '@ai-sdk/openai-compatible',
          options: {
            baseURL: 'http://127.0.0.1:20128/v1',
            apiKey: 'gateway-token'
          },
          models: {
            'agy/gemini-3.8-flash-high': { name: 'agy/gemini-3.8-flash-high' }
          }
        }
      }
    })
  })
})
