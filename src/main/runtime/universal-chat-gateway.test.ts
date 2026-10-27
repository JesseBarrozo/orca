import { describe, expect, it } from 'vitest'
import {
  gatewayModelId,
  releaseUniversalChatGatewayRoute,
  resolveUniversalChatGatewayRoute
} from './universal-chat-gateway'

async function expectGatewayToStop(baseUrl: string): Promise<void> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      await fetch(`${baseUrl}/health`)
    } catch {
      return
    }
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  throw new Error('The idle Orca compatibility gateway did not stop.')
}

describe('Omni chat gateway model routing', () => {
  it('uses the Antigravity route namespace for discovered models', () => {
    expect(gatewayModelId('antigravity', 'gemini-3.8-flash-high')).toBe('agy/gemini-3.8-flash-high')
  })

  it('preserves an already qualified upstream model id', () => {
    expect(gatewayModelId('opencode2', 'openai/gpt-5.4-mini')).toBe('openai/gpt-5.4-mini')
  })

  it('starts an Orca-owned loopback gateway on demand', async () => {
    const route = await resolveUniversalChatGatewayRoute({
      harness: 'claude',
      provider: 'antigravity',
      modelId: 'gemini-3.8-flash-high'
    })
    expect(route).not.toBeNull()
    const response = await fetch(`${route!.baseUrl}/health`)
    expect(await response.json()).toEqual({ status: 'ok', owner: 'orca' })
    expect(new URL(route!.baseUrl).hostname).toBe('127.0.0.1')
    releaseUniversalChatGatewayRoute(route!.authToken)
  })

  it('does not start a compatibility gateway for a provider-native harness', async () => {
    await expect(
      resolveUniversalChatGatewayRoute({
        harness: 'claude',
        provider: 'claude',
        modelId: 'opus-5.5'
      })
    ).resolves.toBeNull()
  })

  it('shares the shim while routes exist, stops when idle, and restarts on demand', async () => {
    const first = await resolveUniversalChatGatewayRoute({
      harness: 'claude',
      provider: 'antigravity',
      modelId: 'gemini-3.8-flash-high'
    })
    const second = await resolveUniversalChatGatewayRoute({
      harness: 'codex',
      provider: 'antigravity',
      modelId: 'gemini-4-argon-high'
    })
    expect(first).not.toBeNull()
    expect(second).not.toBeNull()
    expect(second!.baseUrl).toBe(first!.baseUrl)

    releaseUniversalChatGatewayRoute(first!.authToken)
    expect((await fetch(`${second!.baseUrl}/health`)).status).toBe(200)

    releaseUniversalChatGatewayRoute(second!.authToken)
    await expectGatewayToStop(second!.baseUrl)

    const restarted = await resolveUniversalChatGatewayRoute({
      harness: 'opencode2',
      provider: 'antigravity',
      modelId: 'gemini-3.8-flash-high'
    })
    expect(restarted).not.toBeNull()
    expect((await fetch(`${restarted!.baseUrl}/health`)).status).toBe(200)
    releaseUniversalChatGatewayRoute(restarted!.authToken)
  })
})
