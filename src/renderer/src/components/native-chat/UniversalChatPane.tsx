import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import type { RuntimeClientTarget } from '../../../../shared/runtime-client-target'
import type { AutoModelPoolEntry } from '../../../../shared/auto-model-pool'
import type {
  UniversalChatSelection,
  UniversalChatSnapshot
} from '../../../../shared/universal-chat'
import {
  UNIVERSAL_CHAT_HARNESSES,
  type UniversalChatHarness
} from '../../../../shared/universal-chat-harness'
import type {
  SessionOptionDescriptor,
  SessionOptionsSurface
} from '../../../../shared/native-chat-session-options'
import type { NativeChatComposerAccessoryContext } from './native-chat-composer-types'
import { isTuiAgent } from '../../../../shared/tui-agent-config'
import {
  isNativeChatModelEnabled,
  isNativeChatProviderEnabled
} from '../../../../shared/native-chat-model-availability'
import { callRuntimeRpc } from '@/runtime/runtime-rpc-client'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { NativeChatModelCombobox } from './NativeChatModelCombobox'
import { UniversalChatOptionControls } from './UniversalChatOptionControls'
import NativeChatView from './NativeChatView'
import { NativeChatEmptyState } from './NativeChatEmptyState'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import { AgentIcon, getAgentLabel } from '@/lib/agent-catalog'
import { collapseUniversalChatEffortVariants } from '../../../../shared/universal-chat-effort'
import {
  collapseUniversalChatProviderAliases,
  isFreeOpenCodeModel,
  universalChatModelLabel,
  universalChatModelProviderLabel
} from '../../../../shared/universal-chat-model-presentation'

export function UniversalChatPane({
  sessionId,
  tabId,
  groupId,
  target,
  isVisible,
  isFocusedGroup
}: {
  /** Stable Orca alias used by the universal-chat RPCs. */
  sessionId: string
  /** The visible tab id, shared with native chat controls and retained-pane routing. */
  tabId: string
  groupId?: string
  target: RuntimeClientTarget
  isVisible: boolean
  isFocusedGroup: boolean
}): React.JSX.Element {
  const [snapshot, setSnapshot] = useState<UniversalChatSnapshot | null>(null)
  const [selection, setSelection] = useState<UniversalChatSelection>({ mode: 'auto' })
  const [error, setError] = useState<string | null>(null)
  const disabledNativeChatModelKeys = useAppStore(
    (state) => state.settings?.disabledNativeChatModelKeys
  )
  const disabledNativeChatProviders = useAppStore(
    (state) => state.settings?.disabledNativeChatProviders
  )

  const refresh = useCallback(async () => {
    const next = await callRuntimeRpc<UniversalChatSnapshot>(target, 'universalChat.history', {
      sessionId
    })
    setSnapshot(next)
    setSelection(next.selection)
  }, [sessionId, target])

  useEffect(() => {
    void refresh().catch((cause) =>
      setError(cause instanceof Error ? cause.message : String(cause))
    )
    const timer = window.setInterval(() => {
      if (isVisible) {
        void refresh().catch(() => undefined)
      }
    }, 800)
    return () => window.clearInterval(timer)
  }, [disabledNativeChatModelKeys, disabledNativeChatProviders, isVisible, refresh])

  const modelOptions = useMemo(
    () =>
      (snapshot?.models ?? []).filter(
        (model) =>
          isTuiAgent(model.provider) &&
          isNativeChatProviderEnabled(disabledNativeChatProviders, model.provider) &&
          isNativeChatModelEnabled(disabledNativeChatModelKeys, model.provider, model.modelId)
      ),
    [disabledNativeChatModelKeys, disabledNativeChatProviders, snapshot?.models]
  )
  const selectedModelValue =
    selection.mode === 'auto' ? 'auto' : `${selection.provider}:${selection.modelId}`
  const selectedHarness = selection.harness ?? 'auto'
  const activeModel = snapshot?.activeModel
  const providerSessionId = snapshot?.providerSessionId

  const selectModel = useCallback(
    (value: string): void => {
      const model = modelOptions.find((item) => `${item.provider}:${item.modelId}` === value)
      const next: UniversalChatSelection = model
        ? {
            mode: 'model',
            provider: model.provider,
            modelId: model.modelId,
            harness: selectedHarness
          }
        : { mode: 'auto', harness: selectedHarness }
      setSelection(next)
      setError(null)
      void callRuntimeRpc<UniversalChatSnapshot>(target, 'universalChat.select', {
        sessionId,
        selection: next
      })
        .then((nextSnapshot) => setSnapshot(nextSnapshot))
        .catch((cause) => setError(cause instanceof Error ? cause.message : String(cause)))
    },
    [modelOptions, selectedHarness, sessionId, target]
  )

  const selectHarness = useCallback(
    (harness: UniversalChatHarness): void => {
      const next: UniversalChatSelection =
        selection.mode === 'auto'
          ? { mode: 'auto', harness }
          : {
              mode: 'model',
              provider: selection.provider,
              modelId: selection.modelId,
              harness
            }
      setSelection(next)
      setError(null)
      void callRuntimeRpc<UniversalChatSnapshot>(target, 'universalChat.select', {
        sessionId,
        selection: next
      })
        .then((nextSnapshot) => setSnapshot(nextSnapshot))
        .catch((cause) => setError(cause instanceof Error ? cause.message : String(cause)))
    },
    [selection, sessionId, target]
  )

  const composerAccessory = useCallback(
    ({
      sessionOptionsSurface,
      sessionOptionsSnapshot,
      isWorking
    }: NativeChatComposerAccessoryContext) => (
      <div className="flex min-w-0 items-center gap-1">
        <UniversalChatHarnessPicker
          harnesses={snapshot?.harnesses ?? []}
          value={selectedHarness}
          onSelect={selectHarness}
        />
        <UniversalChatModelPicker
          models={collapseUniversalChatEffortVariants(
            collapseUniversalChatProviderAliases(modelOptions)
          )}
          value={selectedModelValue}
          onSelect={selectModel}
          sessionOptionsSurface={sessionOptionsSurface}
          sessionOptionsSnapshot={sessionOptionsSnapshot}
          isWorking={isWorking}
        />
      </div>
    ),
    [
      modelOptions,
      selectHarness,
      selectModel,
      selectedHarness,
      selectedModelValue,
      snapshot?.harnesses
    ]
  )

  return (
    <div className="relative flex h-full min-h-0 min-w-0 w-full flex-1 flex-col">
      {activeModel && providerSessionId ? (
        <NativeChatView
          key={providerSessionId}
          mode="structured"
          tabId={tabId}
          groupId={groupId}
          sessionId={providerSessionId}
          agent={activeModel.harness}
          isVisible={isVisible}
          isFocusedGroup={isFocusedGroup}
          target={target}
          composerAccessory={composerAccessory}
          hideNativeModelPicker
          emptyStateCopy={{
            title: translate('components.native-chat.state.universal.title', 'Start an Omni chat'),
            subtitle: translate(
              'components.native-chat.state.universal.subtitle',
              'Orca chooses the provider and model according to your settings.'
            )
          }}
        />
      ) : (
        <div className="flex h-full min-h-0 w-full flex-1 items-center justify-center bg-chat-canvas">
          <NativeChatEmptyState kind={error ? 'error' : 'loading'} message={error ?? undefined} />
        </div>
      )}
      {error && activeModel && providerSessionId ? (
        <div className="pointer-events-none absolute inset-x-4 top-2 z-30 flex justify-center">
          <div className="max-w-xl rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive shadow-sm">
            {error}
          </div>
        </div>
      ) : null}
    </div>
  )
}

function UniversalChatHarnessPicker({
  harnesses,
  value,
  onSelect
}: {
  harnesses: readonly UniversalChatHarness[]
  value: UniversalChatHarness
  onSelect: (value: UniversalChatHarness) => void
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const choices = [
    {
      value: 'auto' as const,
      label: translate('components.native-chat.composer.universalAuto', 'Auto')
    },
    ...UNIVERSAL_CHAT_HARNESSES.filter((harness) => harnesses.includes(harness)).map((harness) => ({
      value: harness,
      label: getAgentLabel(harness)
    }))
  ]
  const selected = choices.find((choice) => choice.value === value) ?? choices[0]
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="xs"
          aria-label={translate(
            'components.native-chat.composer.universalHarness',
            'Omni harness: {{value0}}',
            { value0: selected.label }
          )}
          className="max-w-40 min-w-0 shrink"
        >
          {selected.value !== 'auto' ? <AgentIcon agent={selected.value} size={13} /> : null}
          <span className="truncate text-chat-foreground">{selected.label}</span>
          <ChevronDown className="size-3" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" side="top" collisionPadding={8} className="w-56">
        <div className="space-y-1">
          {choices.map((choice) => (
            <Button
              key={choice.value}
              type="button"
              variant={choice.value === value ? 'secondary' : 'ghost'}
              className="w-full justify-start"
              onClick={() => {
                onSelect(choice.value)
                setOpen(false)
              }}
            >
              {choice.value !== 'auto' ? <AgentIcon agent={choice.value} size={14} /> : null}
              <span className="truncate">{choice.label}</span>
            </Button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}

export { collapseUniversalChatEffortVariants } from '../../../../shared/universal-chat-effort'

function UniversalChatModelPicker({
  models,
  value,
  onSelect,
  sessionOptionsSurface,
  sessionOptionsSnapshot,
  isWorking
}: {
  models: readonly AutoModelPoolEntry[]
  value: string
  onSelect: (value: string) => void
  sessionOptionsSurface?: SessionOptionsSurface | null
  sessionOptionsSnapshot?: readonly SessionOptionDescriptor[]
  isWorking?: boolean
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [pendingOptionIds, setPendingOptionIds] = useState<ReadonlySet<string>>(new Set())
  const choices = [
    {
      value: 'auto',
      label: translate('components.native-chat.composer.universalAuto', 'Auto'),
      description: translate(
        'components.native-chat.composer.universalAutoDescription',
        'Orca chooses the best enabled model.'
      )
    },
    ...models.map((model) => ({
      value: `${model.provider}:${model.modelId}`,
      label: universalChatModelLabel(model),
      description: universalChatModelProviderLabel(model),
      ...(model.isFree === true || isFreeOpenCodeModel(model.provider, model.modelId)
        ? { badge: 'Free' }
        : {})
    }))
  ]
  const selected = choices.find((choice) => choice.value === value) ?? choices[0]
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="xs"
          aria-label={translate(
            'components.native-chat.composer.universalModel',
            'Omni model: {{value0}}',
            {
              value0:
                selected?.label ??
                translate('components.native-chat.composer.universalAuto', 'Auto')
            }
          )}
          className="max-w-64 min-w-0 shrink"
        >
          <span className="truncate text-chat-foreground">{selected?.label ?? 'Auto'}</span>
          <ChevronDown className="size-3" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        side="top"
        collisionPadding={8}
        className="w-96 max-w-(--radix-popover-content-available-width)"
      >
        <NativeChatModelCombobox
          choices={choices}
          currentValue={value}
          readOnly={false}
          readOnlyReason={null}
          busy={false}
          onSelect={(next) => {
            onSelect(next)
            setOpen(false)
          }}
        />
        <UniversalChatOptionControls
          surface={sessionOptionsSurface ?? null}
          snapshot={sessionOptionsSnapshot ?? []}
          isWorking={isWorking === true}
          pendingIds={pendingOptionIds}
          onPendingChange={(id, pending) =>
            setPendingOptionIds((current) => {
              const next = new Set(current)
              if (pending) {
                next.add(id)
              } else {
                next.delete(id)
              }
              return next
            })
          }
        />
      </PopoverContent>
    </Popover>
  )
}
