// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { NativeChatEmptyState } from './NativeChatEmptyState'

afterEach(cleanup)

it('keeps pointing the terminal-backed chat back to its terminal when a read fails', () => {
  render(<NativeChatEmptyState kind="error" />)
  expect(
    screen.getByText(
      'The transcript could not be read. Toggle back to the terminal to keep working.'
    )
  ).toBeInTheDocument()
})

it('shows the host message in place of the terminal-backed default', () => {
  render(<NativeChatEmptyState kind="error" message="disk full" />)
  expect(screen.getByText('disk full')).toBeInTheDocument()
  expect(screen.queryByText(/Toggle back to the terminal/)).toBeNull()
})

it('allows provider-neutral surfaces to replace provider-specific empty copy', () => {
  render(
    <NativeChatEmptyState
      kind="empty"
      agent="claude"
      customCopy={{ title: 'Start a Omni chat', subtitle: 'Orca chooses the model.' }}
    />
  )
  expect(screen.getByText('Start a Omni chat')).toBeInTheDocument()
  expect(screen.getByText('Orca chooses the model.')).toBeInTheDocument()
  expect(screen.queryByText('Start a chat with Claude')).toBeNull()
})
