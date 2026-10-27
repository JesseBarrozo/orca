import type { AutoModelProfile } from './auto-model-pool'

export type UniversalTerminalSelection =
  | { kind: 'manual'; modelId: string }
  | { kind: 'auto'; profile: AutoModelProfile }

export type UniversalTerminalLaunch = {
  selection: UniversalTerminalSelection
  accountScope: 'active' | 'all-connected' | readonly string[]
  workspacePath: string
}

export type UniversalTerminalSession = UniversalTerminalLaunch & {
  id: string
  createdAt: number
  pendingSelection?: UniversalTerminalSelection
}

export type UniversalTerminalCommand =
  | { kind: 'select-model'; modelId: string }
  | { kind: 'select-auto'; profile: AutoModelProfile }

export function parseUniversalTerminalCommand(input: string): UniversalTerminalCommand | null {
  const parts = input.trim().split(/\s+/)
  if (parts[0] !== '/model' && parts[0] !== '/profile') {
    return null
  }
  if (parts[0] === '/profile') {
    const profile = parts[1]
    return profile && isAutoProfile(profile) ? { kind: 'select-auto', profile } : null
  }
  const modelId = parts.slice(1).join(' ')
  if (!modelId) {
    return null
  }
  if (modelId === 'auto') {
    return { kind: 'select-auto', profile: 'balanced' }
  }
  if (modelId.startsWith('auto/')) {
    const profile = modelId.slice('auto/'.length)
    return isAutoProfile(profile) ? { kind: 'select-auto', profile } : null
  }
  return { kind: 'select-model', modelId }
}

function isAutoProfile(value: string): value is AutoModelProfile {
  return [
    'fast',
    'cheap',
    'coding',
    'reasoning',
    'balanced',
    'intelligence',
    'reliable',
    'offline'
  ].includes(value)
}
