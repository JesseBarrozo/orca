export type UniversalChatGatewaySession = {
  harness: string
  provider: string
  baseUrl: string
  authToken: string
  routedModelId: string
  launchModelId: string
}

const gatewaySessions = new Map<string, UniversalChatGatewaySession>()

export function registerUniversalChatGatewaySession(
  sessionId: string,
  gateway: UniversalChatGatewaySession
): void {
  gatewaySessions.set(sessionId, gateway)
}

export function unregisterUniversalChatGatewaySession(sessionId: string): void {
  const gateway = gatewaySessions.get(sessionId)
  gatewaySessions.delete(sessionId)
  if (gateway) {
    void import('./universal-chat-gateway').then(({ releaseUniversalChatGatewayRoute }) =>
      releaseUniversalChatGatewayRoute(gateway.authToken)
    )
  }
}

export function universalChatGatewaySession(sessionId: string): UniversalChatGatewaySession | null {
  return gatewaySessions.get(sessionId) ?? null
}

export function applyClaudeUniversalChatGatewayEnvironment(
  sessionId: string,
  environment: Record<string, string>
): Record<string, string> {
  const gateway = universalChatGatewaySession(sessionId)
  if (!gateway || gateway.harness !== 'claude') {
    return environment
  }
  const result = { ...environment }
  delete result.ANTHROPIC_API_KEY
  result.ANTHROPIC_BASE_URL = gateway.baseUrl
  result.ANTHROPIC_AUTH_TOKEN = gateway.authToken
  result.ANTHROPIC_MODEL = gateway.routedModelId
  result.CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY = '1'
  return result
}

export function applyCodexUniversalChatGateway(input: {
  sessionId: string
  environment: Record<string, string>
  args: string[]
}): { environment: Record<string, string>; args: string[] } {
  const gateway = universalChatGatewaySession(input.sessionId)
  if (!gateway || gateway.harness !== 'codex') {
    return { environment: input.environment, args: input.args }
  }
  const provider = [
    'name="Orca Universal"',
    `base_url=${JSON.stringify(`${gateway.baseUrl}/v1`)}`,
    'wire_api="responses"',
    'env_key="ORCA_UNIVERSAL_GATEWAY_TOKEN"'
  ].join(',')
  return {
    environment: {
      ...input.environment,
      ORCA_UNIVERSAL_GATEWAY_TOKEN: gateway.authToken
    },
    args: [
      ...input.args,
      '-c',
      'model_provider="orca_universal"',
      '-c',
      `model_providers.orca_universal={${provider}}`
    ]
  }
}

export function applyOpenCodeUniversalChatGatewayEnvironment(
  sessionId: string,
  environment: Record<string, string>,
  harness: string
): Record<string, string> {
  const gateway = universalChatGatewaySession(sessionId)
  if (!gateway || gateway.harness !== harness || !['opencode', 'opencode2'].includes(harness)) {
    return environment
  }
  let existing: Record<string, unknown> = {}
  try {
    const parsed: unknown = environment.OPENCODE_CONFIG_CONTENT
      ? JSON.parse(environment.OPENCODE_CONFIG_CONTENT)
      : {}
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      existing = parsed as Record<string, unknown>
    }
  } catch {
    // Preserve launchability: a malformed inherited config must not receive a partial merge.
    return environment
  }
  const providers =
    existing.provider && typeof existing.provider === 'object' && !Array.isArray(existing.provider)
      ? (existing.provider as Record<string, unknown>)
      : {}
  return {
    ...environment,
    OPENCODE_CONFIG_CONTENT: JSON.stringify({
      ...existing,
      model: gateway.launchModelId,
      provider: {
        ...providers,
        'orca-universal': {
          npm: '@ai-sdk/openai-compatible',
          name: 'Orca Universal',
          options: {
            baseURL: `${gateway.baseUrl}/v1`,
            apiKey: gateway.authToken
          },
          models: {
            [gateway.routedModelId]: {
              name: gateway.routedModelId
            }
          }
        }
      }
    })
  }
}

/** @deprecated Claude-only compatibility alias. */
export const applyUniversalChatGatewayEnvironment = applyClaudeUniversalChatGatewayEnvironment
