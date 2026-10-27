import { beforeEach, describe, expect, it, vi } from 'vitest'
import { dispatchAntigravityRequest } from './universal-chat-antigravity-transport'
import { createAntigravityHostCredentialBackend } from '../antigravity/native-credential-backend'
import { getMainHttpClient } from '../network/http-client'

vi.mock('../../shared/app-environment', () => ({
  getAppEnvironment: () => ({ getPath: () => '/test-home' })
}))
vi.mock('../antigravity/native-credential-backend', () => ({
  createAntigravityHostCredentialBackend: vi.fn()
}))
vi.mock('../network/http-client', () => ({ getMainHttpClient: vi.fn() }))

describe('Omni chat Antigravity transport', () => {
  const fetch = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(createAntigravityHostCredentialBackend).mockReturnValue({
      read: vi.fn(async () => ({
        contents: '{}',
        authMethod: 'oauth-personal',
        identity: null,
        accessToken: 'secret-token',
        refreshToken: null,
        expiresAt: Date.now() + 60_000
      })),
      write: vi.fn()
    })
    vi.mocked(getMainHttpClient).mockReturnValue({ fetch } as never)
  })

  it('routes an Anthropic request to Antigravity and returns Anthropic JSON', async () => {
    fetch.mockResolvedValue(
      new Response(
        `data: ${JSON.stringify({
          response: { candidates: [{ content: { parts: [{ text: 'Bonjour' }] } }] }
        })}\n\n`,
        { status: 200 }
      )
    )

    const result = await dispatchAntigravityRequest({
      protocol: 'anthropic-messages',
      provider: 'antigravity',
      modelId: 'gemini-3.8-flash',
      body: {
        max_tokens: 200,
        messages: [{ role: 'user', content: 'Salut' }]
      },
      signal: new AbortController().signal
    })

    expect(result.status).toBe(200)
    expect(JSON.parse(String(result.body))).toMatchObject({
      type: 'message',
      model: 'gemini-3.8-flash-medium',
      content: [{ type: 'text', text: 'Bonjour' }]
    })
    const [, init] = fetch.mock.calls[0] as [string, RequestInit]
    const upstream = JSON.parse(String(init.body)) as Record<string, unknown>
    expect(upstream).toMatchObject({
      model: 'gemini-3.8-flash-medium',
      request: { contents: [{ role: 'user', parts: [{ text: 'Salut' }] }] }
    })
    expect(JSON.stringify(upstream)).not.toContain('secret-token')
  })

  it('rejects an expired Antigravity session before network I/O', async () => {
    vi.mocked(createAntigravityHostCredentialBackend).mockReturnValue({
      read: vi.fn(async () => ({
        contents: '{}',
        authMethod: 'oauth-personal',
        identity: null,
        accessToken: 'expired',
        refreshToken: null,
        expiresAt: Date.now() - 1
      })),
      write: vi.fn()
    })

    await expect(
      dispatchAntigravityRequest({
        protocol: 'anthropic-messages',
        provider: 'antigravity',
        modelId: 'gemini-3.8-flash',
        body: {},
        signal: new AbortController().signal
      })
    ).rejects.toThrow('expiré')
    expect(fetch).not.toHaveBeenCalled()
  })

  it.each([
    {
      protocol: 'openai-chat' as const,
      body: { messages: [{ role: 'user', content: 'Salut' }] },
      expectedObject: 'chat.completion'
    },
    {
      protocol: 'openai-responses' as const,
      body: { input: [{ role: 'user', content: 'Salut' }] },
      expectedObject: 'response'
    }
  ])('adapts $protocol for Codex and OpenCode harnesses', async (example) => {
    fetch.mockResolvedValue(
      new Response(
        `data: ${JSON.stringify({
          response: { candidates: [{ content: { parts: [{ text: 'Bonjour' }] } }] }
        })}\n\n`,
        { status: 200 }
      )
    )

    const result = await dispatchAntigravityRequest({
      protocol: example.protocol,
      provider: 'antigravity',
      modelId: 'gemini-3.8-flash-medium',
      body: example.body,
      signal: new AbortController().signal
    })

    expect(result.status).toBe(200)
    expect(JSON.parse(String(result.body))).toMatchObject({ object: example.expectedObject })
  })
})
