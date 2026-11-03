// @vitest-environment jsdom
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DawCapabilities } from '../../api/contracts/daw';
import { SetupChip } from '../booth/record/SetupChip';
import { EngineChip } from '../layout/EngineChip';
import { TooltipProvider } from '../primitives/Tooltip';
import { EnginePanelProvider } from './EnginePanelContext';

afterEach(cleanup);

// Owner ruling (#2251): the chip that names the DAW leads to one place, the Audio engine panel, from every page. The header's EngineChip
// and the Booth's SetupChip once went to different places (the panel, and Settings > Recording & DAW). Both now draw EngineChipButton,
// which owns the click and the sentence that says where it goes; these tests fail if a DAW chip is wired anywhere else.
const SRC = join(__dirname, '..', '..');

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.tsx?$/.test(name) && !/\.(test|stories)\.tsx?$/.test(name) ? [path] : [];
  });
}

const capabilities = { daw: 'REAPER', reachable: true, capabilities: {} } as unknown as DawCapabilities;

describe('every DAW chip opens the Audio engine panel', () => {
  it('the header chip and the Booth setup chip call the one panel opener and say so in the tooltip', async () => {
    const open = vi.fn();
    render(
      <TooltipProvider>
        <EnginePanelProvider value={open}>
          <EngineChip daw="REAPER" dawFileLinked dawReachable dawProjectMatches />
          <SetupChip capabilities={capabilities} standaloneName="Recorder" />
        </EnginePanelProvider>
      </TooltipProvider>,
    );
    const chips = screen.getAllByRole('button');
    expect(chips).toHaveLength(2);
    for (const chip of chips) {
      await userEvent.click(chip);
    }
    expect(open).toHaveBeenCalledTimes(2);
    for (const chip of chips) {
      await userEvent.hover(chip);
      expect((await screen.findByRole('tooltip')).textContent).toContain('Opens the Audio engine panel');
      await userEvent.unhover(chip);
    }
  });

  it('the Built-in chips, in the header and on the Booth, both open Recording settings and say so', async () => {
    const openPanel = vi.fn();
    const openSettings = vi.fn();
    render(
      <TooltipProvider>
        <EnginePanelProvider value={openPanel} openRecordingSettings={openSettings}>
          <EngineChip engine="builtin" dawFileLinked={false} />
          <SetupChip capabilities={{ daw: 'none', reachable: true, capabilities: {} } as unknown as DawCapabilities} standaloneName="Recorder" />
        </EnginePanelProvider>
      </TooltipProvider>,
    );
    const chips = screen.getAllByRole('button');
    expect(chips).toHaveLength(2);
    for (const chip of chips) await userEvent.click(chip);
    expect(openSettings).toHaveBeenCalledTimes(2);
    expect(openPanel).not.toHaveBeenCalled();
    for (const chip of chips) {
      await userEvent.hover(chip);
      expect((await screen.findByRole('tooltip')).textContent).toContain('Opens Recording settings');
      await userEvent.unhover(chip);
    }
  });

  it('only EngineChipButton gives a DAW chip a click; neither chip takes a destination', () => {
    for (const file of ['components/layout/EngineChip.tsx', 'components/booth/record/SetupChip.tsx']) {
      const text = readFileSync(join(SRC, file), 'utf8');
      expect(text, file).toContain('EngineChipButton');
      expect(text, file).not.toMatch(/\bonClick\b|onOpenEnginePanel|openSettings|goTo\(|navigate\(/);
    }
  });

  it('no page hands a DAW chip a destination of its own', () => {
    for (const file of sources(SRC)) {
      const text = readFileSync(file, 'utf8');
      for (const match of text.matchAll(/<(EngineChip|SetupChip)\b[^>]*?\bon(Click|OpenEnginePanel)=/gs)) {
        throw new Error(`${file}: <${match[1]}> is given ${match[0].slice(-20)}; a DAW chip opens the Audio engine panel itself`);
      }
    }
  });
});
