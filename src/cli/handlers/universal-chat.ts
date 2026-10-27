import type { CommandHandler } from '../dispatch'
import { getRequiredWorktreeSelector } from '../selectors'
import { resolveCurrentAgentWorkspaceSelector } from '../agent-workspace-selector'
import { printResult } from '../format'

export const UNIVERSAL_CHAT_HANDLERS: Record<string, CommandHandler> = {
  omni: async ({ client, cwd, flags, json }) => {
    const selector = flags.get('worktree')
    const worktree =
      selector === undefined || selector === 'active' || selector === 'current'
        ? await resolveCurrentAgentWorkspaceSelector(cwd, client)
        : await getRequiredWorktreeSelector(flags, 'worktree', cwd, client)
    const result = await client.call<{ sessionId: string }>('omni.create', {
      worktree,
      profile: 'balanced'
    })
    printResult(result, json, (value) => `Omni session ${value.sessionId} created`)
  }
}
