import { removeAgentArgOption } from './agent-session-option-agent-args'
import type {
  AgentSessionOptionCatalog,
  CatalogModel,
  CatalogOption
} from './agent-session-option-catalog-types'

const ANTIGRAVITY_EFFORT: CatalogOption = {
  id: 'effort',
  label: 'Reasoning effort',
  category: 'thought_level',
  kind: {
    type: 'select',
    choices: [
      { value: 'low', label: 'Low' },
      { value: 'medium', label: 'Medium' },
      { value: 'high', label: 'High' }
    ],
    defaultValue: 'high'
  },
  apply: {
    launchArgs: (value) => ['--effort', String(value)],
    removeAgentArgs: (tokens) => removeAgentArgOption('antigravity', tokens, ['--effort']),
    midSession: { kind: 'command', build: (value) => `/effort ${String(value)}` }
  }
}

/**
 * Antigravity exposes its model inventory only after an ACP session starts. Keep the known
 * server defaults available while that first discovery is unavailable, just like Gemini's
 * static catalog, so Auto and Omni do not lose the provider entirely.
 */
export const ANTIGRAVITY_FALLBACK_MODELS: CatalogModel[] = [
  {
    id: 'gemini-3.8-flash-high',
    label: 'Gemini 3.8 Flash (High)',
    description: 'Antigravity ACP bootstrap model',
    isDefault: true,
    supportsAutoMode: true,
    options: []
  },
  {
    id: 'gemini-3.8-flash-medium',
    label: 'Gemini 3.8 Flash (Medium)',
    description: 'Antigravity ACP bootstrap model',
    supportsAutoMode: true,
    options: []
  },
  {
    id: 'gemini-3.8-flash-low',
    label: 'Gemini 3.8 Flash (Low)',
    description: 'Antigravity ACP bootstrap model',
    supportsAutoMode: true,
    options: []
  }
]

export const ANTIGRAVITY_SESSION_OPTION_CATALOG: AgentSessionOptionCatalog = {
  supportsWorkerLaunchPreferences: true,
  // These are the ACP server's bootstrap models. A successful session listing replaces them
  // with the account-scoped inventory returned by Antigravity.
  models: ANTIGRAVITY_FALLBACK_MODELS,
  discoveredModelsAreAuthoritative: true,
  modelApply: {
    launchArgs: (value) => ['--model', String(value)],
    removeAgentArgs: (tokens) => removeAgentArgOption('antigravity', tokens, ['--model']),
    midSession: { kind: 'agent-picker', command: '/model' }
  },
  unknownModelOptions: [ANTIGRAVITY_EFFORT]
}
