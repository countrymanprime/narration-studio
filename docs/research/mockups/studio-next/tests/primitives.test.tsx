import { useState } from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Checkbox } from '@/ui/primitives/Checkbox'
import { Radio, RadioGroup } from '@/ui/primitives/RadioGroup'

afterEach(cleanup)

function Box(props: { initial?: boolean; disabled?: boolean; onChange?: (c: boolean) => void }) {
  const [on, setOn] = useState(props.initial ?? false)
  return <Checkbox aria-label="Include" data-inc="x" checked={on} disabled={props.disabled} onCheckedChange={(c) => { setOn(c); props.onChange?.(c) }} />
}

describe('Checkbox', () => {
  it('has the checkbox role, a name, aria-checked and passes data-* through', () => {
    render(<Box />)
    const box = screen.getByRole('checkbox', { name: 'Include' })
    expect(box).toHaveAttribute('aria-checked', 'false')
    expect(box).toHaveAttribute('data-inc', 'x')
  })

  it('Space toggles it from the keyboard and a click toggles it too', async () => {
    const on = vi.fn()
    const u = userEvent.setup()
    render(<Box onChange={on} />)
    const box = screen.getByRole('checkbox')
    await u.tab()
    expect(box).toHaveFocus()
    await u.keyboard(' ')
    expect(box).toHaveAttribute('aria-checked', 'true')
    expect(box.querySelector('svg')).not.toBeNull()
    await u.click(box)
    expect(box).toHaveAttribute('aria-checked', 'false')
    expect(on.mock.calls).toEqual([[true], [false]])
  })

  it('a disabled one cannot be toggled or focused', async () => {
    const on = vi.fn()
    const u = userEvent.setup()
    render(<Box disabled initial onChange={on} />)
    const box = screen.getByRole('checkbox')
    expect(box).toHaveAttribute('aria-disabled', 'true')
    await u.click(box)
    await u.tab()
    await u.keyboard(' ')
    expect(on).not.toHaveBeenCalled()
    expect(box).toHaveAttribute('aria-checked', 'true')
  })

  it('a visible label names it and clicking the text toggles it', async () => {
    const u = userEvent.setup()
    function L() { const [on, setOn] = useState(false); return <Checkbox id="kch" label="Keep subtitle" checked={on} onCheckedChange={setOn} /> }
    render(<L />)
    expect(screen.getByRole('checkbox', { name: 'Keep subtitle' })).toHaveAttribute('aria-checked', 'false')
    await u.click(screen.getByText('Keep subtitle'))
    expect(screen.getByRole('checkbox', { name: 'Keep subtitle' })).toHaveAttribute('aria-checked', 'true')
  })

  it('indeterminate reports mixed', () => {
    render(<Checkbox aria-label="All" checked={false} indeterminate />)
    expect(screen.getByRole('checkbox', { name: 'All' })).toHaveAttribute('aria-checked', 'mixed')
  })
})

describe('RadioGroup', () => {
  function G({ onValue }: { onValue?: (v: string) => void }) {
    const [v, setV] = useState('a')
    return (
      <RadioGroup aria-label="Theme" value={v} onValueChange={(x) => { setV(x); onValue?.(x) }}>
        <Radio value="a" label="Alpha" description="First" />
        <Radio value="b" label="Beta" />
        <Radio value="c" label="Gamma" disabled />
      </RadioGroup>
    )
  }

  it('has radiogroup and radio roles with names, descriptions and aria-checked', () => {
    render(<G />)
    expect(screen.getByRole('radiogroup', { name: 'Theme' })).toBeInTheDocument()
    expect(screen.getAllByRole('radio')).toHaveLength(3)
    expect(screen.getByRole('radio', { name: /^Alpha/ })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('radio', { name: 'Beta' })).toHaveAttribute('aria-checked', 'false')
    expect(screen.getByRole('radio', { name: /^Alpha/ })).toHaveAccessibleDescription('First')
  })

  it('arrow keys move the selection and skip a disabled radio', async () => {
    const on = vi.fn()
    const u = userEvent.setup()
    render(<G onValue={on} />)
    await u.tab()
    expect(screen.getByRole('radio', { name: /^Alpha/ })).toHaveFocus()
    await u.keyboard('{ArrowDown}')
    expect(screen.getByRole('radio', { name: 'Beta' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('radio', { name: 'Beta' })).toHaveFocus()
    await u.keyboard('{ArrowDown}')
    expect(screen.getByRole('radio', { name: /^Alpha/ })).toHaveAttribute('aria-checked', 'true')
    await u.keyboard('{ArrowUp}')
    expect(on.mock.calls.map((c) => c[0])).toEqual(['b', 'a', 'b'])
  })

  it('clicking the label text selects, and a disabled radio stays off', async () => {
    const u = userEvent.setup()
    render(<G />)
    await u.click(screen.getByText('Beta'))
    expect(screen.getByRole('radio', { name: 'Beta' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('radio', { name: 'Gamma' })).toHaveAttribute('aria-disabled', 'true')
    await u.click(screen.getByText('Gamma'))
    expect(screen.getByRole('radio', { name: 'Gamma' })).toHaveAttribute('aria-checked', 'false')
  })

  it('a standalone Radio (mock panel) works controlled by checked', async () => {
    const u = userEvent.setup()
    const pick = vi.fn()
    render(<Radio name="x" value="v" label="Solo" checked={false} onCheckedChange={pick} />)
    await u.click(screen.getByRole('radio', { name: 'Solo' }))
    expect(pick).toHaveBeenCalledTimes(1)
  })
})
