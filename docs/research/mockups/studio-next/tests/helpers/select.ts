import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

/** Open a Select (the Base UI trigger button) and click the option with this label. Replaces userEvent.selectOptions. */
export async function chooseOption(trigger: HTMLElement | string, label: string | RegExp): Promise<void> {
  const el = typeof trigger === 'string' ? (document.querySelector(trigger) as HTMLElement) : trigger
  if (!el) throw new Error('Select trigger not found: ' + String(trigger))
  await userEvent.click(el)
  const list = await screen.findByRole('listbox')
  await userEvent.click(within(list).getByRole('option', { name: label }))
}
