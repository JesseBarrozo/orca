import { Check } from 'lucide-react'
import type { GlobalSettings } from '../../../../shared/global-settings-types'
import type { RuntimeClientTarget } from '../../../../shared/runtime-client-target'
import {
  UNIVERSAL_CHAT_HARNESSES,
  isUniversalChatHarness,
  type UniversalChatHarness
} from '../../../../shared/universal-chat-harness'
import { collapsePreferredAgentAliases } from '../../../../shared/tui-agent-selection'
import { useAppStore } from '@/store'
import { getRuntimeAgentInventoryKey } from '@/store/slices/runtime-agent-inventory-key'
import { AgentIcon, getAgentLabel } from '@/lib/agent-catalog'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import { SettingsBadge, SettingsSubsectionHeader } from './SettingsFormControls'

type Props = {
  settings: GlobalSettings
  updateSettings: (updates: Partial<GlobalSettings>) => void | Promise<void>
  hostScope: { target: RuntimeClientTarget; available: boolean }
}

export function UniversalChatHarnessSetting({
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
  const storedHarness: UniversalChatHarness = isUniversalChatHarness(
    settings.universalChatDefaultHarness
  )
    ? settings.universalChatDefaultHarness
    : 'auto'
  const detectedHarnesses =
    detectedIds === null
      ? []
      : UNIVERSAL_CHAT_HARNESSES.filter((agent) =>
          new Set(collapsePreferredAgentAliases(detectedIds)).has(agent)
        )
  const harnesses =
    storedHarness !== 'auto' && !detectedHarnesses.includes(storedHarness)
      ? [storedHarness, ...detectedHarnesses]
      : detectedHarnesses

  return (
    <section className="space-y-4">
      <SettingsSubsectionHeader
        title={translate('settings.agents.universalChatDefaultHarness', 'Omni default harness')}
        description={translate(
          'settings.agents.universalChatDefaultHarnessDescription',
          'Used for new Auto & Omni Chat sessions. The harness and selected model are independent.'
        )}
      />
      <div className="flex flex-wrap gap-2">
        <HarnessPill
          active={storedHarness === 'auto'}
          onClick={() => updateSettings({ universalChatDefaultHarness: 'auto' })}
        >
          {storedHarness === 'auto' ? <Check className="size-3.5" /> : null}
          {translate('settings.agents.universalChatAutoHarness', 'Auto')}
        </HarnessPill>
        {harnesses.map((harness) => (
          <HarnessPill
            key={harness}
            active={storedHarness === harness}
            onClick={() => updateSettings({ universalChatDefaultHarness: harness })}
            title={
              detectedIds !== null && !detectedIds.includes(harness)
                ? translate(
                    'settings.agents.universalChatDefaultHarnessUndetected',
                    'Saved as default, but this harness is not detected right now'
                  )
                : undefined
            }
          >
            <AgentIcon agent={harness} size={14} />
            {getAgentLabel(harness)}
            {storedHarness === harness ? <Check className="size-3.5" /> : null}
          </HarnessPill>
        ))}
        {detectedIds !== null && harnesses.length === 0 ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <SettingsBadge tone="muted">
              {translate('settings.agents.universalChatAutoHarness', 'Auto')}
            </SettingsBadge>
            {translate(
              'settings.agents.universalChatNoHarnesses',
              'No structured harness detected on this host'
            )}
          </div>
        ) : null}
      </div>
    </section>
  )
}

function HarnessPill({
  active,
  onClick,
  children,
  title
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
  title?: string
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={title}
      className={cn(
        'inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50',
        active
          ? 'border-muted-foreground/40 bg-accent font-medium text-accent-foreground'
          : 'border-border bg-background/50 text-muted-foreground hover:border-muted-foreground/35 hover:text-foreground'
      )}
    >
      {children}
    </button>
  )
}
