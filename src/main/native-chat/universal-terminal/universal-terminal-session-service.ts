import type { AutoModelCandidate } from '../../../shared/auto-model-pool'
import { selectAutoModelCandidate } from '../../../shared/auto-model-pool'
import {
  parseUniversalTerminalCommand,
  type UniversalTerminalCommand,
  type UniversalTerminalLaunch,
  type UniversalTerminalSelection,
  type UniversalTerminalSession
} from '../../../shared/universal-terminal-types'

export type UniversalTerminalSessionService = {
  create: (launch: UniversalTerminalLaunch) => UniversalTerminalSession
  get: (sessionId: string) => UniversalTerminalSession | null
  queueSelection: (sessionId: string, selection: UniversalTerminalSelection) => boolean
  queueCommand: (sessionId: string, command: string) => boolean
  resolveNextSelection: (
    sessionId: string,
    candidates: readonly AutoModelCandidate[],
    disabledModelKeys?: readonly string[]
  ) => UniversalTerminalSelection | null
}

export function createUniversalTerminalSessionService(
  now: () => number = Date.now,
  id = createSessionId
): UniversalTerminalSessionService {
  const sessions = new Map<string, UniversalTerminalSession>()
  return {
    create(launch) {
      const session = { ...launch, id: id(), createdAt: now() }
      sessions.set(session.id, session)
      return session
    },
    get(sessionId) {
      return sessions.get(sessionId) ?? null
    },
    queueSelection(sessionId, selection) {
      const session = sessions.get(sessionId)
      if (!session) {
        return false
      }
      session.pendingSelection = selection
      return true
    },
    queueCommand(sessionId, command) {
      const parsed = parseUniversalTerminalCommand(command)
      if (!parsed) {
        return false
      }
      return this.queueSelection(sessionId, selectionFromCommand(parsed))
    },
    resolveNextSelection(sessionId, candidates, disabledModelKeys) {
      const session = sessions.get(sessionId)
      if (!session) {
        return null
      }
      const selection = session.pendingSelection ?? session.selection
      if (selection.kind === 'manual') {
        session.selection = selection
        session.pendingSelection = undefined
        return selection
      }
      const selected = selectAutoModelCandidate(candidates, {
        disabledModelKeys,
        profile: selection.profile
      })
      if (!selected) {
        return null
      }
      session.selection = { kind: 'manual', modelId: `${selected.provider}:${selected.modelId}` }
      session.pendingSelection = undefined
      return session.selection
    }
  }
}

function selectionFromCommand(command: UniversalTerminalCommand): UniversalTerminalSelection {
  return command.kind === 'select-model'
    ? { kind: 'manual', modelId: command.modelId }
    : { kind: 'auto', profile: command.profile }
}

let sessionCounter = 0
function createSessionId(): string {
  sessionCounter += 1
  return `universal-terminal-${sessionCounter}`
}
