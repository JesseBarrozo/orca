// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { GlobalSettings } from '../../../../shared/global-settings-types'
import type { AutoModelPoolEntry } from '../../../../shared/auto-model-pool'
import type { UniversalChatSnapshot } from '../../../../shared/universal-chat'
import { createGlobalSettingsFixture } from '../../../../shared/global-settings-test-fixture'
import { useAppStore } from '@/store'
import { collapseUniversalChatEffortVariants, UniversalChatPane } from './UniversalChatPane'

const runtimeRpc = vi.hoisted(() => vi.fn())

vi.mock('@/runtime/runtime-rpc-client', () => ({
  callRuntimeRpc: runtimeRpc
}))

vi.mock('./NativeChatView', () => ({
  default: ({
    composerAccessory
  }: {
    composerAccessory?:
      | ReactNode
      | ((context: {
          sessionOptionsSurface: null
          sessionOptionsSnapshot: never[]
          isWorking: boolean
        }) => ReactNode)
  }) => {
    const rendered =
      typeof composerAccessory === 'function'
        ? composerAccessory({
            sessionOptionsSurface: null,
            sessionOptionsSnapshot: [],
            isWorking: false
          })
        : composerAccessory
    return <div data-testid="native-chat-view">{rendered}</div>
  }
}))

const target = { kind: 'local' } as const
const fable = {
  provider: 'claude',
  modelId: 'claude-fable-5-1[1m]',
  label: 'Fable',
  score: 1
}

function settingsWithDisabledModelKeys(keys: string[]): GlobalSettings {
  return createGlobalSettingsFixture({ disabledNativeChatModelKeys: keys })
}

function settingsWithDisabledProviders(
  agents: NonNullable<GlobalSettings['disabledNativeChatProviders']>
): GlobalSettings {
  return createGlobalSettingsFixture({ disabledNativeChatProviders: agents })
}

function snapshot(models: UniversalChatSnapshot['models']): UniversalChatSnapshot {
  return {
    sessionId: 'universal-session',
    providerSessionId: 'claude-session',
    worktree: '/tmp/worktree',
    profile: 'balanced',
    selection: { mode: 'auto' },
    models,
    turns: [],
    harnesses: ['claude'],
    activeModel: {
      provider: fable.provider,
      modelId: fable.modelId,
      label: fable.label,
      harness: 'claude'
    }
  }
}

describe('UniversalChatPane', () => {
  afterEach(() => {
    cleanup()
    runtimeRpc.mockReset()
    useAppStore.setState(useAppStore.getInitialState())
  })

  it('refreshes an open chat when a disabled model is re-enabled', async () => {
    useAppStore.setState({
      settings: settingsWithDisabledModelKeys(['claude:fable'])
    })
    runtimeRpc.mockImplementation(async (_target: unknown, method: string) => {
      if (method === 'universalChat.history') {
        const disabled = useAppStore
          .getState()
          .settings?.disabledNativeChatModelKeys?.includes('claude:fable')
        return snapshot(disabled ? [] : [fable])
      }
      return undefined
    })

    render(
      <UniversalChatPane
        sessionId="universal-session"
        tabId="universal-tab"
        target={target}
        isVisible={false}
        isFocusedGroup
      />
    )

    await waitFor(() => {
      expect(runtimeRpc).toHaveBeenCalledWith(target, 'universalChat.history', {
        sessionId: 'universal-session'
      })
    })
    expect(screen.queryByRole('button', { name: /Fable/ })).not.toBeInTheDocument()

    act(() => {
      useAppStore.setState({ settings: settingsWithDisabledModelKeys([]) })
    })

    await waitFor(() => {
      expect(
        runtimeRpc.mock.calls.filter(([, method]) => method === 'universalChat.history')
      ).toHaveLength(2)
    })

    const picker = screen.getByRole('button', { name: 'Universal Chat model: Auto' })
    expect(picker).toBeInTheDocument()
    fireEvent.click(picker)
    expect(screen.getByText('Fable')).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: /Fast mode|Mode rapide/ })).toBeDisabled()
  })

  it('hides models from a provider disabled in Universal Chat settings', async () => {
    useAppStore.setState({
      settings: settingsWithDisabledProviders(['claude'])
    })
    runtimeRpc.mockImplementation(async (_target: unknown, method: string) => {
      if (method === 'universalChat.history') {
        return snapshot([fable])
      }
      return undefined
    })

    render(
      <UniversalChatPane
        sessionId="universal-session"
        tabId="universal-tab"
        target={target}
        isVisible={false}
        isFocusedGroup
      />
    )

    const picker = await screen.findByRole('button', {
      name: 'Universal Chat model: Auto'
    })
    fireEvent.click(picker)
    expect(screen.queryByText('Fable')).not.toBeInTheDocument()
  })

  it('shows one Antigravity row per model and keeps effort out of the model label', () => {
    const models = [
      'gemini-3.8-flash-high',
      'gemini-3.8-flash-medium',
      'gemini-3.8-flash-low',
      'gemini-4-argon-high',
      'gemini-4-argon-medium',
      'gemini-4-argon-low'
    ].map((modelId) => ({
      provider: 'antigravity',
      modelId,
      label: modelId
        .replaceAll('-', ' ')
        .replace(/\b\w/g, (letter) => letter.toUpperCase())
        .replace(/\b(High|Medium|Low)$/, '($1)'),
      score: 1
    })) satisfies AutoModelPoolEntry[]

    const collapsed = collapseUniversalChatEffortVariants(models)

    expect(collapsed).toHaveLength(2)
    expect(collapsed.map((model) => model.label)).toEqual(['Gemini 3.8 Flash', 'Gemini 4 Argon'])
    expect(collapsed.map((model) => model.modelId)).toEqual([
      'gemini-3.8-flash-high',
      'gemini-4-argon-high'
    ])
  })
})
