import { useEffect, useMemo, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import type { GlobalSettings } from '../../../../shared/global-settings-types'
import {
  getAgentSessionOptionCatalog,
  type CatalogModel
} from '../../../../shared/agent-session-option-catalog'
import {
  isNativeChatModelEnabled,
  isNativeChatProviderEnabled,
  setNativeChatModelEnabled,
  setNativeChatProviderEnabled
} from '../../../../shared/native-chat-model-availability'
import type { TuiAgent } from '../../../../shared/tui-agent'
import type { AutoModelPoolEntry } from '../../../../shared/auto-model-pool'
import type { RuntimeClientTarget } from '../../../../shared/runtime-client-target'
import {
  SettingsBadge,
  SettingsSegmentedControl,
  SettingsSubsectionHeader,
  SettingsSwitchRow
} from './SettingsFormControls'
import { translate } from '@/i18n/i18n'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../ui/collapsible'
import { callRuntimeRpc } from '@/runtime/runtime-rpc-client'
import { AgentIcon, getAgentLabel } from '@/lib/agent-catalog'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store'
import { getRuntimeAgentInventoryKey } from '@/store/slices/runtime-agent-inventory-key'
import { collapsePreferredAgentAliases } from '../../../../shared/tui-agent-selection'
import {
  OPENCODE_FREE_MODEL_IDS,
  isFreeOpenCodeModel,
  isOpenCodeDefaultSentinel,
  universalChatModelLabel,
  universalChatModelProviderLabel
} from '../../../../shared/universal-chat-model-presentation'

type Props = {
  settings: GlobalSettings
  updateSettings: (updates: Partial<GlobalSettings>) => void | Promise<void>
  hostScope: { target: RuntimeClientTarget; available: boolean }
}

type SettingsCatalogModel = CatalogModel & {
  /** All provider ids represented by this single settings row. */
  preferenceModelIds?: readonly string[]
}

const OPENCODE_AGENTS = ['opencode', 'opencode2'] as const
type OpenCodeAgent = (typeof OPENCODE_AGENTS)[number]

// Keep OpenCode visible while its dynamic listing is unavailable, but never expose
// the provider's implicit `default` sentinel as a selectable model.
const OPENCODE_FALLBACK_MODELS: Record<OpenCodeAgent, CatalogModel[]> = {
  opencode: OPENCODE_FREE_MODEL_IDS.map((id) => ({
    id,
    label: universalChatModelLabel({ modelId: id, label: id }),
    description: universalChatModelProviderLabel({ provider: 'opencode', modelId: id, label: id }),
    options: []
  })),
  opencode2: OPENCODE_FREE_MODEL_IDS.map((id) => ({
    id,
    label: universalChatModelLabel({ modelId: id, label: id }),
    description: universalChatModelProviderLabel({ provider: 'opencode2', modelId: id, label: id }),
    options: []
  }))
}

const SUPPORTED_AGENTS: readonly TuiAgent[] = [
  'claude',
  'codex',
  'cursor',
  'gemini',
  'grok',
  'muse',
  'omp',
  'antigravity',
  'codebuddy',
  'opencode',
  'opencode2'
]

export function NativeChatModelSettings({
  settings,
  updateSettings,
  hostScope
}: Props): React.JSX.Element {
  const environmentId =
    hostScope.target.kind === 'environment' ? hostScope.target.environmentId : null
  const environmentKnown = useAppStore((state) =>
    environmentId ? state.runtimeEnvironments.some((entry) => entry.id === environmentId) : true
  )
  const detectedIds = useAppStore((state) => {
    if (!hostScope.available || !environmentKnown) {
      return null
    }
    return environmentId
      ? (state.runtimeDetectedAgentIds[getRuntimeAgentInventoryKey(environmentId)] ?? null)
      : state.detectedAgentIds
  })
  const [discoveredModels, setDiscoveredModels] = useState<
    Partial<Record<TuiAgent, AutoModelPoolEntry[]>>
  >({})

  useEffect(() => {
    if (!hostScope.available) {
      setDiscoveredModels({})
      return
    }
    let cancelled = false
    void callRuntimeRpc<AutoModelPoolEntry[]>(
      hostScope.target,
      'agentSession.autoModelPool',
      { includeDisabled: true, includeDisabledAgents: true, waitForListing: true },
      { timeoutMs: 15_000 }
    )
      .then((entries) => {
        if (cancelled) {
          return
        }
        const next: Partial<Record<TuiAgent, AutoModelPoolEntry[]>> = {}
        for (const agent of SUPPORTED_AGENTS) {
          next[agent] = entries.filter((entry) => entry.provider === agent)
        }
        setDiscoveredModels(next)
      })
      .catch(() => {
        if (!cancelled) {
          setDiscoveredModels({})
        }
      })
    return () => {
      cancelled = true
    }
  }, [hostScope.available, hostScope.target])

  const groups = useMemo(() => {
    if (detectedIds === null) {
      return []
    }
    const installedAgents = new Set(collapsePreferredAgentAliases(detectedIds))
    return SUPPORTED_AGENTS.map((agent) => {
      const catalog = getAgentSessionOptionCatalog(agent)
      const discovered = discoveredModels[agent] ?? []
      const seed =
        catalog?.models ?? (isOpenCodeAgent(agent) ? OPENCODE_FALLBACK_MODELS[agent] : [])
      const models = mergeSettingsModels(agent, seed, discovered)
      return { agent, models }
    })
      .filter((entry) => installedAgents.has(entry.agent))
      .filter((entry) => entry.models.length > 0)
  }, [detectedIds, discoveredModels])
  const modelCount = groups.reduce((count, group) => count + group.models.length, 0)

  return (
    <div className="space-y-4" data-settings-section="native-chat-models">
      <SettingsSubsectionHeader
        title={
          <span className="flex items-center gap-2">
            {translate(
              'settings.agents.modelsAvailableToAutoAndUniversalChat',
              'Models available to Auto & Omni Chat'
            )}
            <SettingsBadge>{modelCount}</SettingsBadge>
          </span>
        }
        description={translate(
          'settings.agents.modelsAvailableToAutoDescription',
          'Enable or disable models used by Auto and Omni Chat. Models discovered later are enabled by default.'
        )}
      />
      <div className="divide-y divide-border/40">
        {groups.map(({ agent, models }) => (
          <NativeChatProviderModelGroup
            key={agent}
            agent={agent}
            models={models}
            settings={settings}
            updateSettings={updateSettings}
          />
        ))}
      </div>
    </div>
  )
}

function NativeChatProviderModelGroup({
  agent,
  models,
  settings,
  updateSettings
}: {
  agent: TuiAgent
  models: SettingsCatalogModel[]
  settings: GlobalSettings
  updateSettings: Props['updateSettings']
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const providerLabel = getAgentLabel(agent)

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div
        className={cn(
          'flex items-center gap-3 py-3.5',
          !isNativeChatProviderEnabled(settings.disabledNativeChatProviders, agent) && 'opacity-60'
        )}
      >
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="group flex min-w-0 flex-1 items-center gap-3 text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            aria-label={`Toggle ${providerLabel} models`}
          >
            <div className="flex size-7 shrink-0 items-center justify-center rounded-md border border-border/50 bg-background/50">
              <AgentIcon agent={agent} size={16} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate text-sm font-medium">{providerLabel}</span>
                <SettingsBadge tone="muted">{models.length}</SettingsBadge>
              </div>
            </div>
          </button>
        </CollapsibleTrigger>
        <SettingsSegmentedControl
          value={
            isNativeChatProviderEnabled(settings.disabledNativeChatProviders, agent)
              ? 'enabled'
              : 'disabled'
          }
          onChange={(next) => {
            updateSettings({
              disabledNativeChatProviders: setNativeChatProviderEnabled(
                settings.disabledNativeChatProviders,
                agent,
                next === 'enabled'
              )
            })
          }}
          ariaLabel={`${providerLabel} availability`}
          size="sm"
          options={[
            {
              value: 'enabled',
              label: translate('auto.components.settings.AgentsPane.d4d2a45d63', 'Enabled')
            },
            {
              value: 'disabled',
              label: translate('auto.components.settings.AgentsPane.8dc0192e48', 'Disabled')
            }
          ]}
        />
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
            aria-label={`Toggle ${providerLabel} models`}
          >
            <ChevronDown
              className={cn('size-4 transition-transform', open && 'rotate-180')}
              aria-hidden="true"
            />
          </button>
        </CollapsibleTrigger>
      </div>
      <CollapsibleContent animation="height" className="divide-y divide-border/40 pb-3 pl-10">
        {models.map((model) => {
          const preferenceModelIds = model.preferenceModelIds ?? [model.id]
          const enabled = preferenceModelIds.some((modelId) =>
            isNativeChatModelEnabled(settings.disabledNativeChatModelKeys, agent, modelId)
          )
          return (
            <SettingsSwitchRow
              key={`${agent}:${model.id}`}
              label={
                <span className="flex items-center gap-2">
                  <span>
                    {universalChatModelLabel({
                      modelId: model.id,
                      label: model.label
                    })}
                  </span>
                  {isFreeOpenCodeModel(agent, model.id) ? (
                    <SettingsBadge tone="muted">Free</SettingsBadge>
                  ) : null}
                </span>
              }
              description={
                model.description ??
                universalChatModelProviderLabel({
                  provider: agent,
                  modelId: model.id,
                  label: model.label
                })
              }
              checked={enabled}
              ariaLabel={`${providerLabel} ${model.label}`}
              onChange={() =>
                updateSettings({
                  disabledNativeChatModelKeys: preferenceModelIds.reduce(
                    (disabledModelKeys, modelId) =>
                      setNativeChatModelEnabled(disabledModelKeys, agent, modelId, !enabled),
                    settings.disabledNativeChatModelKeys
                  )
                })
              }
            />
          )
        })}
      </CollapsibleContent>
    </Collapsible>
  )
}

function mergeSettingsModels(
  agent: TuiAgent,
  seed: readonly CatalogModel[],
  discovered: readonly AutoModelPoolEntry[]
): SettingsCatalogModel[] {
  if (discovered.length === 0) {
    return agent === 'antigravity' ? collapseAntigravityEffortVariants(seed) : [...seed]
  }
  const discoveredById = new Map(
    discovered
      .filter((model) => !isOpenCodeDefaultSentinel(agent, model.modelId))
      .map((model) => [model.modelId, model])
  )
  const merged = seed.map((model) => {
    const live = discoveredById.get(model.id)
    if (!live) {
      return model
    }
    discoveredById.delete(model.id)
    return {
      ...model,
      label: universalChatModelLabel({
        modelId: live.modelId,
        label: live.label
      }),
      description:
        model.description ??
        universalChatModelProviderLabel({
          provider: agent,
          modelId: live.modelId,
          label: live.label
        })
    }
  })
  for (const model of discoveredById.values()) {
    merged.push({
      id: model.modelId,
      label: universalChatModelLabel({
        modelId: model.modelId,
        label: model.label
      }),
      description: universalChatModelProviderLabel({
        provider: agent,
        modelId: model.modelId,
        label: model.label
      }),
      options: []
    })
  }
  return agent === 'antigravity' ? collapseAntigravityEffortVariants(merged) : merged
}

function isOpenCodeAgent(agent: TuiAgent): agent is OpenCodeAgent {
  return (OPENCODE_AGENTS as readonly string[]).includes(agent)
}

const ANTIGRAVITY_EFFORT_VARIANT_PATTERN = /(?:\s*\((low|medium|high)\)|[-_](low|medium|high))$/i

function collapseAntigravityEffortVariants(
  models: readonly CatalogModel[]
): SettingsCatalogModel[] {
  const groups = new Map<string, SettingsCatalogModel>()
  for (const model of models) {
    const baseLabel = model.label.replace(ANTIGRAVITY_EFFORT_VARIANT_PATTERN, '').trim()
    const baseDescription = model.description
      ?.replace(ANTIGRAVITY_EFFORT_VARIANT_PATTERN, '')
      .trim()
    const key = baseLabel.toLocaleLowerCase()
    const current = groups.get(key)
    const ids = new Set(current?.preferenceModelIds ?? [])
    ids.add(model.id)
    if (!current || effortVariantRank(model) > effortVariantRank(current)) {
      groups.set(key, {
        ...model,
        label: baseLabel,
        ...(baseDescription ? { description: baseDescription } : {}),
        preferenceModelIds: [...ids]
      })
    } else {
      groups.set(key, { ...current, preferenceModelIds: [...ids] })
    }
  }
  return [...groups.values()]
}

function effortVariantRank(model: CatalogModel): number {
  const labelMatch = model.label.match(ANTIGRAVITY_EFFORT_VARIANT_PATTERN)
  const idMatch = model.id.match(ANTIGRAVITY_EFFORT_VARIANT_PATTERN)
  const variant = (
    labelMatch?.[1] ??
    labelMatch?.[2] ??
    idMatch?.[1] ??
    idMatch?.[2]
  )?.toLowerCase()
  return variant === 'high' ? 3 : variant === 'medium' ? 2 : variant === 'low' ? 1 : 0
}
