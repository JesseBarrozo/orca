/* eslint-disable max-lines -- The provider-neutral session lifecycle and projection stay together. */
import { randomUUID } from 'node:crypto'
import type { AutoModelPoolEntry, AutoModelProfile } from '../../shared/auto-model-pool'
import type {
  UniversalChatSelection,
  UniversalChatSnapshot,
  UniversalChatTurn
} from '../../shared/universal-chat'
import {
  normalizeUniversalChatHarness,
  type UniversalChatHarness,
  isUniversalChatHarness
} from '../../shared/universal-chat-harness'
import { computeAgentSessionPayloadFingerprint } from '../../shared/agent-session-mutation-envelope'
import {
  createStructuredAgentSessionId,
  structuredAgentSessionCreateParams
} from '../../shared/structured-agent-session-create'
import type { AgentJournalRenderItem } from '../../shared/agent-session-journal-types'
import type { AgentSessionMutationEnvelope } from '../../shared/agent-session-wire'
import type { StructuredAgentSessionFirstMessage } from '../../shared/structured-agent-session-create'
import type { RpcContext } from './rpc/core'
import {
  requireInstalledStructuredHost,
  structuredCallerFor
} from './rpc/methods/structured-agent-session-gate'
import { prepareStructuredAgentSessionCreateForWorktree } from './rpc/methods/structured-agent-session-create'
import { getStructuredAgentSessionHost } from '../native-chat/agent-session-wire/structured-agent-session-registry'
import { structuredAgentRuntimeRegistration } from './structured-agent-runtime-registrations'
import { resolveUniversalChatGatewayRoute } from './universal-chat-gateway'
import {
  registerUniversalChatGatewaySession,
  unregisterUniversalChatGatewaySession
} from './universal-chat-gateway-session'

type ProviderSession = {
  sessionId: string
  provider: string
  modelId: string
  label: string
  harness: UniversalChatHarness
  effort?: string
  fastMode?: boolean
}

type UniversalSession = {
  id: string
  worktree: string
  profile: AutoModelProfile
  selection: UniversalChatSelection
  turns: UniversalChatTurn[]
  providerSession: ProviderSession | null
  providerSessionIds: Set<string>
  providerItemCount: number
}

const sessions = new Map<string, UniversalSession>()

export async function createUniversalChat(
  ctx: RpcContext,
  worktree: string,
  profile: AutoModelProfile = 'balanced'
) {
  const session: UniversalSession = {
    id: randomUUID(),
    worktree,
    profile,
    selection: { mode: 'auto', harness: resolveDefaultHarness(ctx) },
    turns: [],
    providerSession: null,
    providerSessionIds: new Set(),
    providerItemCount: 0
  }
  const models = await readPool(ctx, session)
  const candidate = await chooseCandidate(ctx, session, session.selection, models)
  if (!candidate) {
    throw new Error('Aucun modèle activé et disponible pour le Chat universel.')
  }
  const providerSession = await createProviderSession(ctx, session, candidate)
  session.id = providerSession.sessionId
  session.providerSession = providerSession
  session.providerSessionIds.add(providerSession.sessionId)
  sessions.set(session.id, session)
  return session.id
}

export async function selectUniversalChat(
  ctx: RpcContext,
  sessionId: string,
  selection: UniversalChatSelection
): Promise<void> {
  const session = await getSession(ctx, sessionId)
  const normalizedSelection = normalizeSelection(ctx, selection)
  const models = await readPool(ctx, session)
  const candidate = await chooseCandidate(ctx, session, normalizedSelection, models)
  if (!candidate) {
    throw new Error('Aucun modèle activé et disponible pour le Chat universel.')
  }
  session.selection = normalizedSelection
  const harness = resolveHarness(normalizedSelection, candidate.provider)
  const current = session.providerSession
  if (
    !current ||
    current.provider !== candidate.provider ||
    current.modelId !== candidate.modelId ||
    current.harness !== harness ||
    current.effort !== normalizedSelection.effort ||
    current.fastMode !== normalizedSelection.fastMode
  ) {
    session.providerSession = await createProviderSession(ctx, session, candidate, undefined, false)
    session.providerSessionIds.add(session.providerSession.sessionId)
    session.providerItemCount = 0
  }
}

export async function readUniversalChat(
  ctx: RpcContext,
  sessionId: string
): Promise<UniversalChatSnapshot> {
  const session = await getSession(ctx, sessionId)
  const models = await readPool(ctx, session)
  await refreshPendingTurns(session)
  return snapshot(session, models)
}

export async function sendUniversalChat(
  ctx: RpcContext,
  sessionId: string,
  text: string,
  requestedSelection?: UniversalChatSelection
): Promise<UniversalChatSnapshot> {
  const session = await getSession(ctx, sessionId)
  if (requestedSelection) {
    session.selection = normalizeSelection(ctx, requestedSelection)
  }
  const models = await readPool(ctx, session)
  const candidate = await chooseCandidate(ctx, session, session.selection, models, text)
  if (!candidate) {
    throw new Error('Aucun modèle activé et disponible pour le Chat universel.')
  }

  const turn: UniversalChatTurn = {
    id: randomUUID(),
    role: 'user',
    text,
    provider: candidate.provider,
    modelId: candidate.modelId,
    status: 'pending'
  }
  session.turns.push(turn)

  const providerChanged =
    session.providerSession?.provider !== candidate.provider ||
    session.providerSession?.modelId !== candidate.modelId ||
    session.providerSession?.harness !== resolveHarness(session.selection, candidate.provider) ||
    session.providerSession?.effort !== session.selection.effort ||
    session.providerSession?.fastMode !== session.selection.fastMode
  if (!session.providerSession || providerChanged) {
    session.providerSession = await createProviderSession(ctx, session, candidate, text, false)
    session.providerSessionIds.add(session.providerSession.sessionId)
    session.providerItemCount = 0
  } else {
    await sendToProvider(ctx, session, text)
  }

  await refreshPendingTurns(session)
  return snapshot(session, models)
}

export async function closeUniversalChat(sessionId: string): Promise<void> {
  const session = sessions.get(sessionId)
  sessions.delete(sessionId)
  const host = getStructuredAgentSessionHost()
  const providerSessionIds = session?.providerSessionIds ?? new Set([sessionId])
  for (const providerSessionId of providerSessionIds) {
    // Releasing the compatibility route must not depend on the native session host still
    // being available (for example while Orca is shutting down or recovering from a crash).
    unregisterUniversalChatGatewaySession(providerSessionId)
    if (host) {
      if (host.setSessionTabVisibility) {
        await host.setSessionTabVisibility(providerSessionId, false).catch(() => undefined)
      }
      await host.close(providerSessionId, 'user-close').catch(() => undefined)
    }
  }
}

async function readPool(ctx: RpcContext, session: UniversalSession): Promise<AutoModelPoolEntry[]> {
  const host = await requireInstalledStructuredHost(ctx)
  if (!host.deps.autoModelPool) {
    return []
  }
  const workspacePath = await ctx.runtime
    .resolveStructuredAgentSessionLocalWorkspacePath(session.worktree)
    .catch(() => null)
  return host.deps.autoModelPool.read({
    ...(workspacePath ? { workspacePath } : {}),
    waitForListing: true,
    pool: { profile: session.profile }
  })
}

async function chooseCandidate(
  ctx: RpcContext,
  session: UniversalSession,
  selection: UniversalChatSelection,
  models: readonly AutoModelPoolEntry[],
  prompt?: string
): Promise<AutoModelPoolEntry | null> {
  if (selection.mode === 'auto') {
    const host = await requireInstalledStructuredHost(ctx)
    if (prompt?.trim() && host.deps.autoModelPool?.route) {
      const routed = await host.deps.autoModelPool.route({
        prompt,
        profile: session.profile,
        candidates: models
      })
      if (routed) {
        return routed
      }
    }
    return models[0] ?? null
  }
  return (
    models.find(
      (candidate) =>
        candidate.provider === selection.provider && candidate.modelId === selection.modelId
    ) ?? null
  )
}

async function createProviderSession(
  ctx: RpcContext,
  session: UniversalSession,
  candidate: AutoModelPoolEntry,
  text?: string,
  publish = true
): Promise<ProviderSession> {
  const host = await requireInstalledStructuredHost(ctx)
  const caller = structuredCallerFor(ctx)
  const harness = resolveHarness(session.selection, candidate.provider)
  const harnessRegistration = structuredAgentRuntimeRegistration(harness)
  if (!harnessRegistration) {
    throw new Error(`Le harness ${harness} n’est pas disponible pour le Chat universel.`)
  }
  const providerSessionId = createStructuredAgentSessionId(harness, randomUUID)
  const gateway = await resolveUniversalChatGatewayRoute({
    harness,
    provider: candidate.provider,
    modelId: candidate.modelId
  })
  if (gateway) {
    // Register before launch preparation: every subsequent failure path can now release the
    // ephemeral route and stop the compatibility shim when it becomes idle.
    registerUniversalChatGatewaySession(providerSessionId, gateway)
  }
  const launchModelId = gateway?.launchModelId ?? candidate.modelId
  const launchOptions = {
    model: launchModelId,
    ...(session.selection.effort ? { effort: session.selection.effort } : {}),
    ...(session.selection.fastMode ? { fastMode: 'true' } : {})
  }
  const firstMessage = text
    ? { clientMessageId: randomUUID(), body: userBody(buildProviderPrompt(session, text)) }
    : undefined
  const createParams = structuredAgentSessionCreateParams({
    sessionId: providerSessionId,
    worktree: session.worktree,
    agent: harness,
    ...(firstMessage ? { firstMessage } : {}),
    options: launchOptions,
    randomUuid: randomUUID
  })
  try {
    const prepared = await prepareStructuredAgentSessionCreateForWorktree({
      runtime: ctx.runtime,
      ensureHost: async () => host,
      envelope: createParams.envelope,
      worktree: session.worktree,
      agent: harness,
      caller,
      options: launchOptions,
      ...(firstMessage ? { firstMessage } : {}),
      atRest: true
    })
    const result = await host.create(caller, prepared.attachParams, {
      ...(firstMessage ? { firstMessage } : {}),
      ...(prepared.catalogModels ? { catalogModels: prepared.catalogModels } : {}),
      ...(prepared.hostLaunchDirectory ? { hostLaunchDirectory: prepared.hostLaunchDirectory } : {})
    })
    if (!result.ok) {
      unregisterUniversalChatGatewaySession(providerSessionId)
      throw new Error(
        result.refusal.message ?? `Le provider ${candidate.provider} a refusé la session.`
      )
    }
    if (publish && prepared.tab) {
      await ctx.runtime.publishStructuredAgentSessionTab({
        workspaceId: prepared.tab.workspaceId,
        sessionId: providerSessionId,
        agent: 'universal',
        activate: true
      })
    }
    return {
      sessionId: providerSessionId,
      provider: candidate.provider,
      modelId: candidate.modelId,
      label: candidate.label,
      harness,
      ...(session.selection.effort ? { effort: session.selection.effort } : {}),
      ...(session.selection.fastMode ? { fastMode: true } : {})
    }
  } catch (error) {
    unregisterUniversalChatGatewaySession(providerSessionId)
    throw error
  }
}

async function sendToProvider(
  ctx: RpcContext,
  session: UniversalSession,
  text: string
): Promise<void> {
  const host = await requireInstalledStructuredHost(ctx)
  const providerSession = session.providerSession
  if (!providerSession) {
    throw new Error('Le transport du Chat universel n’est pas initialisé.')
  }
  const record = host.deps.store.getRecord(providerSession.sessionId)
  if (!record) {
    throw new Error('La session provider du Chat universel est indisponible.')
  }
  const body = userBody(text)
  const envelope: AgentSessionMutationEnvelope = {
    sessionId: providerSession.sessionId,
    clientOperationId: `${Date.now()}-${randomUUID().replaceAll('-', '')}`,
    expectedRuntimeFence: record.lease.runtimeFence,
    payloadFingerprint: computeAgentSessionPayloadFingerprint({
      method: 'agentSession.send',
      sessionId: providerSession.sessionId,
      fields: { body }
    })
  }
  const result = await host.send(structuredCallerFor(ctx), {
    envelope,
    body,
    userSend: true
  })
  if (!result.ok) {
    throw new Error(result.refusal.message ?? 'Le provider n’a pas accepté le message.')
  }
}

function buildProviderPrompt(session: UniversalSession, text: string): string {
  if (session.turns.length === 1) {
    return text
  }
  const context = session.turns
    .slice(0, -1)
    .map((turn) => `${turn.role === 'user' ? 'Utilisateur' : 'Assistant'}: ${turn.text}`)
    .join('\n\n')
  return `Contexte de la conversation universelle Orca:\n${context}\n\nNouvelle demande de l’utilisateur:\n${text}`
}

function userBody(text: string): StructuredAgentSessionFirstMessage['body'] {
  return { kind: 'message', role: 'user', blocks: [{ type: 'text', text }] }
}

async function refreshPendingTurns(session: UniversalSession): Promise<void> {
  const providerSession = session.providerSession
  if (!providerSession) {
    return
  }
  const host = getStructuredAgentSessionHost()
  if (!host) {
    return
  }
  const snapshot = await host.journalSnapshot(providerSession.sessionId).catch(() => null)
  if (!snapshot) {
    return
  }
  session.providerItemCount = snapshot.items.length
  const assistantItems = snapshot.items.filter(
    (item) => item.body.kind === 'message' && item.body.role === 'assistant'
  )
  const latestAssistant = assistantItems.at(-1)
  const pending = session.turns.findLast((turn) => turn.status === 'pending')
  if (pending && latestAssistant) {
    pending.status = 'complete'
    session.turns.push({
      id: `${pending.id}:answer`,
      role: 'assistant',
      provider: pending.provider,
      modelId: pending.modelId,
      text: messageText(latestAssistant),
      status: 'complete'
    })
  }
}

function messageText(item: AgentJournalRenderItem): string {
  if (item.body.kind !== 'message') {
    return ''
  }
  return item.body.blocks
    .map((block) => (block.type === 'text' ? block.text : '[image]'))
    .join('\n')
}

function snapshot(session: UniversalSession, models: AutoModelPoolEntry[]): UniversalChatSnapshot {
  const activeModel = session.providerSession
    ? {
        provider: session.providerSession.provider,
        modelId: session.providerSession.modelId,
        label: session.providerSession.label,
        harness: session.providerSession.harness
      }
    : null
  return {
    sessionId: session.id,
    providerSessionId: session.providerSession?.sessionId ?? null,
    worktree: session.worktree,
    profile: session.profile,
    selection: session.selection,
    models,
    turns: session.turns,
    activeModel,
    harnesses: availableHarnesses(models, session)
  }
}

function availableHarnesses(
  models: readonly AutoModelPoolEntry[],
  session: UniversalSession
): UniversalChatHarness[] {
  const harnesses = new Set<UniversalChatHarness>()
  for (const model of models) {
    if (isUniversalChatHarness(model.provider)) {
      harnesses.add(model.provider)
    }
  }
  const activeHarness = session.providerSession?.harness
  if (activeHarness) {
    harnesses.add(activeHarness)
  }
  return [...harnesses]
}

function resolveDefaultHarness(ctx: RpcContext): UniversalChatHarness {
  return normalizeUniversalChatHarness(
    ctx.runtime.requireStore().getSettings().universalChatDefaultHarness
  )
}

function normalizeSelection(
  ctx: RpcContext,
  selection: UniversalChatSelection
): UniversalChatSelection {
  return { ...selection, harness: selection.harness ?? resolveDefaultHarness(ctx) }
}

function resolveHarness(selection: UniversalChatSelection, provider: string): UniversalChatHarness {
  const harness = selection.harness && selection.harness !== 'auto' ? selection.harness : provider
  if (!isUniversalChatHarness(harness) || harness === 'auto') {
    throw new Error(`Le provider ${provider} ne peut pas être utilisé comme harness.`)
  }
  return harness
}

async function getSession(ctx: RpcContext, sessionId: string): Promise<UniversalSession> {
  const session = sessions.get(sessionId)
  if (session) {
    return session
  }
  const host = await requireInstalledStructuredHost(ctx)
  const record = host.deps.store.getRecord(sessionId)
  if (!record) {
    if (host.setSessionTabVisibility) {
      await host.setSessionTabVisibility(sessionId, false).catch(() => undefined)
    }
    throw new Error('Chat universel introuvable ou déjà fermé.')
  }
  const modelId = record.options?.model ?? 'auto'
  const restored: UniversalSession = {
    id: sessionId,
    worktree: record.location.workspaceId,
    profile: 'balanced',
    selection:
      modelId === 'auto'
        ? { mode: 'auto', harness: normalizeUniversalChatHarness(record.provider) }
        : {
            mode: 'model',
            provider: record.provider,
            modelId,
            harness: normalizeUniversalChatHarness(record.provider)
          },
    turns: [],
    providerSession: {
      sessionId,
      provider: record.provider,
      modelId,
      label: modelId,
      harness: normalizeUniversalChatHarness(record.provider)
    },
    providerSessionIds: new Set([sessionId]),
    providerItemCount: 0
  }
  const journal = await host.journalSnapshot(sessionId).catch(() => null)
  if (journal) {
    restored.providerItemCount = journal.items.length
    for (const [index, item] of journal.items.entries()) {
      if (
        item.body.kind !== 'message' ||
        (item.body.role !== 'user' && item.body.role !== 'assistant')
      ) {
        continue
      }
      restored.turns.push({
        id: `restored-${index}`,
        role: item.body.role,
        provider: record.provider,
        modelId,
        text: messageText(item),
        status: 'complete'
      })
    }
  }
  sessions.set(sessionId, restored)
  return restored
}
