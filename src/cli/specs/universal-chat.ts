import type { CommandSpec } from '../args'
import { GLOBAL_FLAGS } from '../args'

export const UNIVERSAL_CHAT_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['universal'],
    summary: 'Open a Universal Chat session in Orca',
    usage: 'orca universal [--worktree <selector>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'worktree'],
    notes: [
      'Creates a provider-neutral chat session using the selected default harness and active model pool.',
      'The harness and model remain independent; switch either one from the Universal Chat UI.'
    ]
  }
]
