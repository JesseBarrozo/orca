import type {
  SessionOptionDescriptor,
  SessionOptionsSurface,
  SessionOptionValue
} from '../../../../shared/native-chat-session-options'
import { sortNativeChatSessionOptions } from '../../../../shared/native-chat-session-option-snapshot'
import { NativeChatSessionOptionRows } from './NativeChatSessionOptionRows'
import { runSessionOptionSurfaceCall } from './native-chat-session-option-surface-call'
import { translate } from '@/i18n/i18n'

export function UniversalChatOptionControls({
  surface,
  snapshot,
  isWorking,
  pendingIds,
  onPendingChange
}: {
  surface: SessionOptionsSurface | null
  snapshot: readonly SessionOptionDescriptor[]
  isWorking: boolean
  pendingIds: ReadonlySet<string>
  onPendingChange: (id: string, pending: boolean) => void
}): React.JSX.Element | null {
  const listedOptions = sortNativeChatSessionOptions(snapshot).filter(
    (descriptor) =>
      descriptor.id === 'effort' ||
      descriptor.id === 'fastMode' ||
      // Codex exposes its fast-mode equivalent as a service tier.
      descriptor.id === 'serviceTier'
  )
  const fastMode = listedOptions.find((descriptor) => descriptor.id === 'fastMode') ?? {
    id: 'fastMode',
    label: translate('components.native-chat.composer.fastMode', 'Fast mode'),
    kind: { type: 'boolean' as const, currentValue: false },
    valueSource: 'unknown' as const,
    transport: 'agent-session' as const,
    settable: false
  }
  const options = [
    ...listedOptions.filter((descriptor) => descriptor.id !== 'fastMode'),
    fastMode
  ].map((descriptor) => (surface ? descriptor : { ...descriptor, settable: false }))
  return (
    <div className={isWorking ? 'pointer-events-none opacity-60' : undefined}>
      <NativeChatSessionOptionRows
        options={options}
        shownReason={null}
        pendingIds={pendingIds}
        onSet={(descriptor, value: SessionOptionValue) => {
          if (isWorking || !surface || pendingIds.has(descriptor.id)) {
            return
          }
          runSessionOptionSurfaceCall(
            descriptor.id,
            (pending) => onPendingChange(descriptor.id, pending !== null),
            () => surface.setOption(descriptor.id, value)
          )
        }}
        onAction={(descriptor) => {
          if (isWorking || !surface || pendingIds.has(descriptor.id)) {
            return
          }
          runSessionOptionSurfaceCall(
            descriptor.id,
            (pending) => onPendingChange(descriptor.id, pending !== null),
            () => surface.invokeAction(descriptor.id)
          )
        }}
      />
    </div>
  )
}
