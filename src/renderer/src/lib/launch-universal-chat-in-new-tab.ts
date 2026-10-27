import { runtimeEnvironmentIdOrLocalUnlessTwin } from '@/lib/worktree-runtime-owner'
import { runtimeTargetForOwnerEnvironment } from '@/runtime/runtime-client-target'
import { callRuntimeRpc } from '@/runtime/runtime-rpc-client'
import { executionHostIdForStructuredTarget } from '@/runtime/structured-agent-session-owner'
import { useAppStore } from '@/store'
import { ORCA_LAYOUT_OWNER_IS_MAIN } from '../../../shared/layout-owner-switch'
import { openAgentSessionTabThroughLayoutOwner } from './structured-agent-session-tab-open-through-layout-owner'
import { structuredAgentSessionTabId } from '../../../shared/structured-agent-session-projection'

export function isUniversalChatTabEntity(entityId: string): boolean {
  return entityId.startsWith('universal-chat:')
}

export function universalChatSessionIdFromEntity(entityId: string): string | null {
  return isUniversalChatTabEntity(entityId) ? entityId.slice('universal-chat:'.length) : null
}

export async function launchUniversalChatInNewTab(args: {
  worktreeId: string
  groupId: string
}): Promise<void> {
  const environmentId = runtimeEnvironmentIdOrLocalUnlessTwin(
    useAppStore.getState(),
    args.worktreeId
  )
  const target = runtimeTargetForOwnerEnvironment(environmentId)
  const snapshot = await callRuntimeRpc<{ sessionId: string }>(target, 'universalChat.create', {
    worktree: args.worktreeId,
    profile: 'balanced'
  })
  const openLocally = () => {
    const state = useAppStore.getState()
    const existing = state.unifiedTabsByWorktree[args.worktreeId]?.find(
      (tab) => tab.contentType === 'agent-session' && tab.entityId === snapshot.sessionId
    )
    if (existing) {
      state.focusGroup(args.worktreeId, existing.groupId)
      state.activateTab(existing.id, { worktreeId: args.worktreeId })
      state.setActiveTabType('agent-session', args.worktreeId)
      return existing
    }
    const created = state.createUnifiedTab(args.worktreeId, 'agent-session', {
      id: structuredAgentSessionTabId(snapshot.sessionId),
      entityId: snapshot.sessionId,
      agentSessionAgent: 'universal',
      label: 'Omni',
      targetGroupId: args.groupId,
      activate: true
    })
    // Why: the runtime tab projection can arrive immediately after creation and
    // overwrite the visible-surface selection. Re-assert the local focus so the
    // menu action always lands on the newly-created provider-neutral chat.
    state.focusGroup(args.worktreeId, created.groupId)
    state.activateTab(created.id, { worktreeId: args.worktreeId })
    state.setActiveTabType('agent-session', args.worktreeId)
    return created
  }

  if (ORCA_LAYOUT_OWNER_IS_MAIN) {
    openAgentSessionTabThroughLayoutOwner({
      worktreeId: args.worktreeId,
      executionHostId: executionHostIdForStructuredTarget(target),
      sessionId: snapshot.sessionId,
      agent: 'universal',
      targetGroupId: args.groupId,
      activate: true,
      drawHere: openLocally
    })
  } else {
    openLocally()
  }
}
