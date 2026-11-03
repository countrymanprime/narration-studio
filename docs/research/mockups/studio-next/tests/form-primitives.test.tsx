import { useState } from 'react'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FieldRow, Input, NumberInput, Select, Slider, Textarea } from '@/ui/primitives'
import { CommitInput } from '@/ui/CommitInput'
import { chooseOption } from './helpers/select'

afterEach(cleanup)

const OPTS = [
  { value: 'sans', label: 'Sans' },
  { value: 'serif', label: 'Serif' },
  { value: 'mono', label: 'Monospace' },
  { value: 'cursive', label: 'Cursive' },
]

function Pick({ onChange, disabled }: { onChange?: (v: string) => void; disabled?: boolean }) {
  const [v, setV] = useState('sans')
  return <Select aria-label="Font" data-pick="1" id="pick" value={v} disabled={disabled} options={OPTS} onValueChange={(x) => { setV(x); onChange?.(x) }} />
}

describe('Input', () => {
  it('is named by a visible label, accepts typing and passes ref, list, placeholder and data attributes through', async () => {
    const ref = { current: null as HTMLInputElement | null }
    const on = vi.fn()
    render(<FieldRow label="Title" htmlFor="t"><Input id="t" ref={ref} list="dl" placeholder="Type here" data-x="1" onChange={(e) => on(e.target.value)} /></FieldRow>)
    const box = screen.getByLabelText('Title')
    expect(ref.current).toBe(box)
    expect(box).toHaveAttribute('list', 'dl')
    expect(box).toHaveAttribute('placeholder', 'Type here')
    expect(box).toHaveAttribute('data-x', '1')
    await userEvent.type(box, 'ab')
    expect(on).toHaveBeenLastCalledWith('ab')
  })
  it('is 36px high by default and 32px for size sm; the width follows a w- class', () => {
    render(<><Input aria-label="a" /><Input aria-label="b" size="sm" className="w-40" /></>)
    expect(screen.getByLabelText('a').className).toContain('h-9')
    expect(screen.getByLabelText('a').className).toContain('w-full')
    expect(screen.getByLabelText('b').className).toContain('h-8')
    expect(screen.getByLabelText('b').className).not.toContain('w-full')
    expect(screen.getByLabelText('b').className).toContain('w-40')
  })
  it('invalid sets aria-invalid; disabled and readOnly are honoured; Tab reaches it', async () => {
    render(<><Input aria-label="bad" invalid /><Input aria-label="off" disabled /><Input aria-label="ro" readOnly value="x" /></>)
    expect(screen.getByLabelText('bad')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByLabelText('off')).toBeDisabled()
    expect(screen.getByLabelText('ro')).toHaveAttribute('readonly')
    await userEvent.tab()
    expect(screen.getByLabelText('bad')).toHaveFocus()
  })
  it('forwards onKeyDown and onBlur', async () => {
    const kd = vi.fn(); const bl = vi.fn()
    render(<Input aria-label="k" onKeyDown={(e) => kd(e.key)} onBlur={bl} />)
    await userEvent.click(screen.getByLabelText('k'))
    await userEvent.keyboard('{Enter}')
    await userEvent.tab()
    expect(kd).toHaveBeenCalledWith('Enter')
    expect(bl).toHaveBeenCalled()
  })
  it('CommitInput commits on Enter and on blur only when the value changed', async () => {
    const commit = vi.fn()
    render(<CommitInput aria-label="Name" value="Alice" onCommit={commit} />)
    const box = screen.getByLabelText('Name')
    await userEvent.click(box)
    await userEvent.tab()
    expect(commit).not.toHaveBeenCalled()
    await userEvent.clear(box)
    await userEvent.type(box, 'Bob{Enter}')
    expect(commit).toHaveBeenCalledWith('Bob')
  })
})

describe('Textarea', () => {
  it('has a label, is multi-line, can be invalid and disabled', async () => {
    render(<><FieldRow label="Note" htmlFor="n"><Textarea id="n" invalid /></FieldRow><Textarea aria-label="off" disabled /></>)
    const ta = screen.getByLabelText('Note')
    expect(ta.tagName).toBe('TEXTAREA')
    expect(ta).toHaveAttribute('aria-invalid', 'true')
    await userEvent.type(ta, 'one{Enter}two')
    expect(ta).toHaveValue('one\ntwo')
    expect(screen.getByLabelText('off')).toBeDisabled()
  })
})

describe('Select', () => {
  it('shows the selected label and has the combobox role, name, id and data attributes on the trigger', () => {
    render(<Pick />)
    const t = screen.getByRole('combobox', { name: 'Font' })
    expect(t).toHaveTextContent('Sans')
    expect(t).toHaveAttribute('id', 'pick')
    expect(t).toHaveAttribute('data-pick', '1')
    expect(t).toHaveAttribute('aria-expanded', 'false')
  })
  it('opens on click, marks the selected option, picks one by click and closes', async () => {
    const on = vi.fn()
    render(<Pick onChange={on} />)
    const t = screen.getByRole('combobox')
    await userEvent.click(t)
    const list = await screen.findByRole('listbox')
    expect(within(list).getByRole('option', { name: 'Sans' })).toHaveAttribute('aria-selected', 'true')
    expect(list.closest('[data-keeppop]')).not.toBeNull()
    await userEvent.click(within(list).getByRole('option', { name: 'Serif' }))
    expect(on).toHaveBeenCalledWith('serif')
    expect(t).toHaveTextContent('Serif')
    expect(screen.queryByRole('listbox')).toBeNull()
  })
  it('opens with the keyboard, moves with the arrows, selects with Enter', async () => {
    const on = vi.fn()
    render(<Pick onChange={on} />)
    await userEvent.tab()
    expect(screen.getByRole('combobox')).toHaveFocus()
    await userEvent.keyboard('{ArrowDown}')
    await screen.findByRole('listbox')
    await userEvent.keyboard('{ArrowDown}{Enter}')
    expect(on).toHaveBeenCalledWith('serif')
  })
  it('typeahead highlights the matching option', async () => {
    const on = vi.fn()
    render(<Pick onChange={on} />)
    await userEvent.click(screen.getByRole('combobox'))
    await screen.findByRole('listbox')
    await userEvent.keyboard('mo')
    await userEvent.keyboard('{Enter}')
    expect(on).toHaveBeenCalledWith('mono')
  })
  it('Escape closes the popup without changing the value and returns focus to the trigger', async () => {
    const on = vi.fn()
    render(<Pick onChange={on} />)
    const t = screen.getByRole('combobox')
    await userEvent.click(t)
    await screen.findByRole('listbox')
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('listbox')).toBeNull()
    expect(on).not.toHaveBeenCalled()
    expect(t).toHaveFocus()
  })
  it('a disabled Select does not open', async () => {
    render(<Pick disabled />)
    const t = screen.getByRole('combobox')
    expect(t).toBeDisabled()
    await userEvent.click(t)
    expect(screen.queryByRole('listbox')).toBeNull()
  })
  it('shows the placeholder when the value is not among the options, and the test helper picks by label', async () => {
    const on = vi.fn()
    render(<Select aria-label="Pick" value="" placeholder="Choose one" options={OPTS} onValueChange={on} />)
    expect(screen.getByRole('combobox')).toHaveTextContent('Choose one')
    await chooseOption(screen.getByRole('combobox'), 'Cursive')
    expect(on).toHaveBeenCalledWith('cursive')
  })
})

describe('Slider', () => {
  function S({ onChange, disabled }: { onChange?: (v: number) => void; disabled?: boolean }) {
    const [v, setV] = useState(5)
    return <Slider id="sl" aria-label="Size" min={0} max={10} step={1} value={v} disabled={disabled} onValueChange={(x) => { setV(x); onChange?.(x) }} valueText={v + ' px'} label="Size" />
  }
  it('is a slider with a name, range and value text on the range input, addressable by its id', () => {
    render(<S />)
    const r = screen.getByRole('slider', { name: 'Size' })
    expect(r).toHaveAttribute('id', 'sl')
    expect([r.getAttribute('min'), r.getAttribute('max'), r.getAttribute('step')]).toEqual(['0', '10', '1'])
    expect(r).toHaveAttribute('aria-valuenow', '5')
    expect(screen.getByText('5 px')).toBeInTheDocument()
  })
  it('arrow keys, Home and End change the value', async () => {
    const on = vi.fn()
    render(<S onChange={on} />)
    await userEvent.tab()
    expect(screen.getByRole('slider')).toHaveFocus()
    await userEvent.keyboard('{ArrowRight}')
    expect(on).toHaveBeenLastCalledWith(6)
    await userEvent.keyboard('{ArrowLeft}{ArrowLeft}')
    expect(on).toHaveBeenLastCalledWith(4)
    await userEvent.keyboard('{End}')
    expect(on).toHaveBeenLastCalledWith(10)
    await userEvent.keyboard('{Home}')
    expect(on).toHaveBeenLastCalledWith(0)
  })
  it('fireEvent.change on the range input reports the number', () => {
    const on = vi.fn()
    render(<S onChange={on} />)
    fireEvent.change(screen.getByRole('slider'), { target: { value: '8' } })
    expect(on).toHaveBeenCalledWith(8)
  })
  it('disabled disables the range input', () => {
    render(<S disabled />)
    expect(screen.getByRole('slider')).toBeDisabled()
  })
})

describe('NumberInput', () => {
  function N({ onChange }: { onChange?: (v: number) => void }) {
    const [v, setV] = useState(3)
    return <NumberInput aria-label="Count" min={1} max={12} step={1} value={v} onValueChange={(x) => { setV(x); onChange?.(x) }} />
  }
  it('applies a valid in-range number at once', () => {
    const on = vi.fn()
    render(<N onChange={on} />)
    fireEvent.change(screen.getByLabelText('Count'), { target: { value: '7' } })
    expect(on).toHaveBeenCalledWith(7)
  })
  it('clamps an out-of-range number on blur and on Enter', async () => {
    const on = vi.fn()
    render(<N onChange={on} />)
    const box = screen.getByLabelText('Count')
    fireEvent.change(box, { target: { value: '99' } })
    expect(on).not.toHaveBeenCalled()
    fireEvent.blur(box)
    expect(on).toHaveBeenLastCalledWith(12)
    expect(box).toHaveValue(12)
    fireEvent.change(box, { target: { value: '-4' } })
    fireEvent.keyDown(box, { key: 'Enter' })
    expect(on).toHaveBeenLastCalledWith(1)
  })
  it('reverts an empty entry on blur', () => {
    const on = vi.fn()
    render(<N onChange={on} />)
    const box = screen.getByLabelText('Count')
    fireEvent.change(box, { target: { value: '' } })
    fireEvent.blur(box)
    expect(on).not.toHaveBeenCalled()
    expect(box).toHaveValue(3)
  })
  it('exposes min, max, step and can be disabled', () => {
    render(<NumberInput aria-label="n" min={1} max={8} step={2} value={4} onValueChange={() => {}} disabled />)
    const b = screen.getByLabelText('n')
    expect([b.getAttribute('min'), b.getAttribute('max'), b.getAttribute('step')]).toEqual(['1', '8', '2'])
    expect(b).toBeDisabled()
  })
})
